import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EntitlementService } from '../membership/membership.service';
import { SystemLogService } from '../system-log/system-log.service';
import { MemberService } from '../member/member.service';
import { WxPayService } from './wx-pay.service';
import { type PrepayDto, type RefundDto } from './dto/subscription.dto';
import {
  type NotifyResponse,
  type PrepayResult,
  type SubscriptionOrderRow,
  type WechatNotifyBody,
  type WechatNotifyResource
} from './types/subscription.types';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly wxPayService: WxPayService,
    private readonly entitlementService: EntitlementService,
    private readonly systemLogService: SystemLogService,
    private readonly memberService: MemberService,
    private readonly configService: ConfigService
  ) {}

  // ==================== 下单 ====================

  /**
   * 订阅状态查询（小程序会员中心）：
   * 返回当前套餐视图 + 存储用量 + 各按次额度消耗。
   */
  async getCurrent(userId: string, familyId: number): Promise<Record<string, unknown>> {
    if (!familyId || familyId <= 0) {
      throw new HttpException('缺少家族ID', HttpStatus.BAD_REQUEST);
    }
    await this.assertFamilyMember(userId, familyId);
    const sub = await this.entitlementService.getSubscription(familyId);
    const quota = await this.entitlementService.getQuotaUsage(familyId);
    return { ...sub, ...quota };
  }

  /**
   * 订阅下单：
   * - 校验用户属于家族、套餐可购买
   * - 创建 pending 订单
   * - 真实模式：调微信 JSAPI 下单返回支付参数；模拟模式（未配置商户）直接模拟支付成功
   */
  async prepay(userId: string, dto: PrepayDto): Promise<PrepayResult> {
    const months = dto.months ?? 12;

    await this.assertFamilyMember(userId, dto.familyId);
    const plan = await this.entitlementService.getPlan(dto.planCode);
    if (plan.code === 'free') {
      throw new HttpException('免费版无需购买', HttpStatus.BAD_REQUEST);
    }
    const amountFen = Math.round(Number(plan.priceAnnual) * 100);
    if (amountFen <= 0) {
      throw new HttpException('套餐金额异常', HttpStatus.BAD_REQUEST);
    }

    const tradeNo = this.wxPayService.generateNo();
    const description = `数字家谱-${plan.name}订阅`;

    await this.dataSource.query(
      'INSERT INTO `subscription_order` (`order_no`, `out_trade_no`, `family_id`, `user_id`, `plan_code`, `amount`, `period_months`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [tradeNo, tradeNo, dto.familyId, userId, plan.code, amountFen / 100, months, 'pending']
    );

    // 模拟模式（未配置微信商户）：直接完成支付，便于本地联调
    // 生产环境 NODE_ENV=production 时强制校验回调地址，避免误配导致真实支付链路断裂
    if (!this.wxPayService.isConfigured()) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('生产环境微信支付配置不完整（需 WX_MCH_ID/WX_MCH_SERIAL_NO/WX_MCH_PRIVATE_KEY/WX_PAY_API_V3_KEY/WX_PAY_NOTIFY_URL），拒绝模拟支付');
        throw new HttpException('支付服务未正确配置，请联系管理员', HttpStatus.SERVICE_UNAVAILABLE);
      }
      await this.handlePaid(tradeNo, `MOCK_${tradeNo}`, new Date());
      this.systemLogService.write({
        logType: 'operation',
        module: 'subscription',
        action: '购买订阅（模拟支付）',
        method: 'POST',
        path: '/api/user/subscription/prepay',
        operator: '',
        operatorId: null,
        success: true,
        detail: `orderNo=${tradeNo} plan=${plan.code} family=${dto.familyId}`
      });
      return { mock: true, orderNo: tradeNo };
    }

    // 生产环境回调地址兜底校验：微信要求 notify_url 必须公网可达，否则支付成功但无法激活订阅
    const notifyUrl = this.configService.get<string>('WX_PAY_NOTIFY_URL') || '';
    if (process.env.NODE_ENV === 'production' && (!notifyUrl || !/^https:\/\//.test(notifyUrl))) {
      this.logger.error(`WX_PAY_NOTIFY_URL 配置不合法（当前值: ${notifyUrl || '空'}），生产环境必须为 https:// 开头公网可达地址`);
      throw new HttpException('支付回调地址未正确配置，请联系管理员', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const [user] = await this.dataSource.query<{ openid: string }[]>(
      'SELECT `openid` FROM `user` WHERE `id` = ?',
      [userId]
    );
    const openid = user?.openid || '';
    if (!openid) {
      throw new HttpException('未获取到用户 openid，无法支付', HttpStatus.BAD_REQUEST);
    }

    const { payParams } = await this.wxPayService.jsapiPrepay({
      outTradeNo: tradeNo,
      description,
      amountFen,
      openid
    });
    return { mock: false, orderNo: tradeNo, payParams };
  }

  // ==================== 支付回调 ====================

  /**
   * 微信支付回调通知处理：
   * - 解密资源（AES-256-GCM，失败即 FAIL）
   * - 校验 trade_state / 金额一致性
   * - 幂等激活订阅
   */
  async handleNotify(body: WechatNotifyBody): Promise<NotifyResponse> {
    try {
      if (!body?.resource?.ciphertext) {
        return { code: 'FAIL', message: 'invalid notify body' };
      }
      const resource = this.wxPayService.decryptNotify(body);
      if (body.event_type !== 'TRANSACTION.SUCCESS' || resource.trade_state !== 'SUCCESS') {
        return { code: 'FAIL', message: 'not a success transaction' };
      }

      await this.handlePaid(resource.out_trade_no, resource.transaction_id, resource.success_time || new Date().toISOString(), resource);
      return { code: 'SUCCESS' };
    } catch (err) {
      this.systemLogService.write({
        logType: 'error',
        module: 'subscription',
        action: '支付回调处理失败',
        method: 'POST',
        path: '/api/subscription/pay/notify',
        operator: '',
        operatorId: null,
        success: false,
        detail: err instanceof Error ? err.message : String(err)
      });
      return { code: 'FAIL', message: err instanceof Error ? err.message : 'internal error' };
    }
  }

  /**
   * 支付成功统一处理（真实回调与模拟支付共用）：
   * - 条件更新订单 pending→paid（幂等，重复回调无副作用）
   * - 激活/顺延订阅 + 重置按次额度周期
   * - 金额校验仅在真实回调传入 resource 时执行
   */
  private async handlePaid(
    outTradeNo: string,
    transactionId: string,
    payTime: Date | string,
    resource?: WechatNotifyResource
  ): Promise<void> {
    const [order] = await this.dataSource.query<SubscriptionOrderRow[]>(
      'SELECT * FROM `subscription_order` WHERE `out_trade_no` = ?',
      [outTradeNo]
    );
    if (!order) return;

    // 真实回调：校验实付金额与订单金额一致（分）
    if (resource?.amount) {
      const expectFen = Math.round(Number(order.amount) * 100);
      if (resource.amount.total !== expectFen) {
        throw new HttpException(`支付金额不一致: 订单 ${expectFen} 分, 实付 ${resource.amount.total} 分`, HttpStatus.BAD_REQUEST);
      }
    }

    const result = await this.dataSource.query(
      'UPDATE `subscription_order` SET `status` = ?, `transaction_id` = ?, `pay_time` = ? WHERE `out_trade_no` = ? AND `status` = ?',
      ['paid', transactionId, payTime, outTradeNo, 'pending']
    );
    if (this.affectedRows(result) === 0) return; // 已处理（幂等）或订单不存在

    await this.entitlementService.activateSubscription(order.family_id, order.plan_code, order.period_months, order.user_id);

    // 消费得积分：订阅支付成功，给支付人绑定的 CRM 会员入账（幂等）
    await this.memberService.recordConsumeForUser(order.user_id, order.order_no, Number(order.amount), order.out_trade_no);
  }

  // ==================== 退款 ====================

  /** 用户自助退款：校验订单归属与状态，真实退款或模拟退款 */
  async refund(userId: string, dto: RefundDto): Promise<void> {
    const [order] = await this.dataSource.query<SubscriptionOrderRow[]>(
      'SELECT * FROM `subscription_order` WHERE `order_no` = ? OR `out_trade_no` = ?',
      [dto.orderNo, dto.orderNo]
    );
    if (!order) {
      throw new HttpException('订单不存在', HttpStatus.NOT_FOUND);
    }
    if (order.user_id !== userId) {
      throw new HttpException('无权操作该订单', HttpStatus.FORBIDDEN);
    }
    if (order.status !== 'paid') {
      throw new HttpException('订单当前状态不可退款', HttpStatus.BAD_REQUEST);
    }

    const refundNo = await this.performRefund(order, dto.reason || '用户申请退款');
    this.systemLogService.write({
      logType: 'operation',
      module: 'subscription',
      action: '退款',
      method: 'POST',
      path: '/api/user/subscription/refund',
      operator: '',
      operatorId: null,
      success: true,
      detail: `orderNo=${order.out_trade_no} refundNo=${refundNo} amount=${order.amount}`
    });
  }

  /** 管理端退款（后台代退）：按订单号定位，仅校验订单状态为已支付 */
  async adminRefund(orderNo: string, reason: string | undefined, operator: string, operatorId: number | null): Promise<void> {
    const [order] = await this.dataSource.query<SubscriptionOrderRow[]>(
      'SELECT * FROM `subscription_order` WHERE `order_no` = ? OR `out_trade_no` = ?',
      [orderNo, orderNo]
    );
    if (!order) {
      throw new HttpException('订单不存在', HttpStatus.NOT_FOUND);
    }
    if (order.status !== 'paid') {
      throw new HttpException('订单当前状态不可退款', HttpStatus.BAD_REQUEST);
    }

    const refundNo = await this.performRefund(order, reason || '管理员退款');
    this.systemLogService.write({
      logType: 'operation',
      module: 'subscription',
      action: '管理退款',
      method: 'POST',
      path: '/api/subscription/orders/refund',
      operator,
      operatorId,
      success: true,
      detail: `orderNo=${order.out_trade_no} refundNo=${refundNo} amount=${order.amount}`
    });
  }

  /** 退款核心：真实/模拟微信退款 → 订单落库 refunded + 订阅降级（frozen） */
  private async performRefund(order: SubscriptionOrderRow, reason: string): Promise<string> {
    const amountFen = Math.round(Number(order.amount) * 100);
    const refundNo = this.wxPayService.generateNo('R');

    if (this.wxPayService.isConfigured()) {
      await this.wxPayService.refund({
        outTradeNo: order.out_trade_no,
        refundNo,
        reason,
        refundFen: amountFen,
        totalFen: amountFen
      });
    }

    await this.completeRefund(order, refundNo);
    return refundNo;
  }

  /** 退款落库 + 订阅降级（frozen，周期内权益保留，到期只读） */
  private async completeRefund(order: SubscriptionOrderRow, refundNo: string): Promise<void> {
    await this.dataSource.query(
      'UPDATE `subscription_order` SET `status` = ?, `refund_time` = ? WHERE `out_trade_no` = ? AND `status` = ?',
      ['refunded', new Date(), order.out_trade_no, 'paid']
    );
    await this.entitlementService.cancelSubscription(order.family_id, `订单退款（${refundNo}），订阅已取消`);
  }

  // ==================== 校验 ====================

  /**
   * 提取写语句影响行数。
   * TypeORM mysql driver 对 UPDATE/INSERT 返回 ResultSetHeader 对象；
   * 兼容数组形态（[ResultSetHeader, fields]）以防御 driver 行为差异。
   */
  private affectedRows(result: unknown): number {
    const header = Array.isArray(result) ? result[0] : result;
    return (header as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
  }

  /** 用户是否属于该家族（family_permission 记录或家族创建者） */
  private async assertFamilyMember(userId: string, familyId: number): Promise<void> {
    const [perm] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_permission` WHERE `family_id` = ? AND `user_id` = ? AND `status` = 1',
      [familyId, userId]
    );
    if (perm) return;

    const [family] = await this.dataSource.query<{ creator_user_id: string | null }[]>(
      'SELECT `creator_user_id` FROM `family` WHERE `id` = ? AND `status` = 1',
      [familyId]
    );
    if (!family || family.creator_user_id !== userId) {
      throw new HttpException('您不属于该家族，无权操作', HttpStatus.FORBIDDEN);
    }
  }
}
