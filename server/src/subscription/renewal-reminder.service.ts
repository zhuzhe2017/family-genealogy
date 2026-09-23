import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type DataRow, type QueryValues } from '../common/types/common';
import { SmsService } from '../user/sms.service';
import { WxSubscribeMessageService } from '../user/wx-subscribe-message.service';

/** 将 unknown 值安全转换为字符串（null/undefined → ''，字符串原样返回，其余 JSON 序列化） */
function toStr(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return JSON.stringify(value) ?? '';
}

/** 提醒节点：到期前 N 天 / 宽限期第 N 天 */
export type RemindNode = 'T-30' | 'T-14' | 'T-7' | 'T-1' | 'G-3';

interface RemindTarget {
  familyId: number;
  familyName: string;
  planCode: string;
  planName: string;
  ownerUserId: string;
  ownerPhone: string;
  expireAt: Date;
  graceUntil: Date | null;
}

/**
 * 订阅续费提醒服务
 * 在到期扫描（EntitlementService.expireScan）后联动执行：
 * - 对临近到期的 active 订阅按 T-30/T-14/T-7/T-1 推送续费提醒
 * - 对已进 grace 的订阅在 G-3（宽限第 3 天）推送最后提醒
 * - 每个家族每个节点仅推送一次（subscription_renewal_reminder 幂等表）
 *
 * 发送渠道（优先级从高到低）：
 * 1. 微信订阅消息（有授权记录时优先，零成本触达）
 * 2. 短信（已绑定手机号的订阅支付人，复用 SmsService）
 * 两者都无 → 记录日志并跳过
 */
@Injectable()
export class RenewalReminderService {
  private readonly logger = new Logger(RenewalReminderService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly smsService: SmsService,
    private readonly wxSubscribeMessageService: WxSubscribeMessageService
  ) {}

  /**
   * 执行续费提醒扫描（由到期扫描任务联动调用，每 6 小时一次）
   * @returns 各节点推送数量
   */
  async scanAndRemind(): Promise<Record<RemindNode, number>> {
    const counts: Record<RemindNode, number> = { 'T-30': 0, 'T-14': 0, 'T-7': 0, 'T-1': 0, 'G-3': 0 };

    // 即将到期的 active 订阅（T-30/T-14/T-7/T-1）
    const expiring = await this.dataSource.query<DataRow[]>(
      `SELECT s.\`family_id\`, f.\`name\` AS family_name, s.\`plan_code\`, p.\`name\` AS plan_name,
              s.\`owner_user_id\`, s.\`expire_at\`,
              u.\`phone\` AS owner_phone
       FROM \`family_subscription\` s
       JOIN \`family\` f ON f.\`id\` = s.\`family_id\` AND f.\`status\` = 1
       LEFT JOIN \`subscription_plan\` p ON p.\`code\` = s.\`plan_code\`
       LEFT JOIN \`user\` u ON u.\`id\` = s.\`owner_user_id\` AND u.\`status\` = 1
       WHERE s.\`status\` = 'active'
         AND s.\`plan_code\` != 'free'
         AND s.\`expire_at\` IS NOT NULL
         AND s.\`expire_at\` > NOW()`
    );

    for (const row of expiring) {
      const target: RemindTarget = {
        familyId: Number(row.family_id),
        familyName: toStr(row.family_name),
        planCode: toStr(row.plan_code),
        planName: toStr(row.plan_name || row.plan_code),
        ownerUserId: toStr(row.owner_user_id),
        ownerPhone: toStr(row.owner_phone),
        expireAt: new Date(row.expire_at as string),
        graceUntil: null
      };
      const daysLeft = Math.ceil((target.expireAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      for (const node of ['T-30', 'T-14', 'T-7', 'T-1'] as RemindNode[]) {
        const threshold = Number(node.slice(2));
        // 到期前 N 天当天（daysLeft 在 threshold ~ threshold-1 之间）触发
        if (daysLeft <= threshold && daysLeft > threshold - 1) {
          if (await this.sendReminder(target, node)) counts[node]++;
        }
      }
    }

    // 宽限期内的 grace 订阅（G-3：宽限第 3 天推送最后提醒）
    const inGrace = await this.dataSource.query<DataRow[]>(
      `SELECT s.\`family_id\`, f.\`name\` AS family_name, s.\`plan_code\`, p.\`name\` AS plan_name,
              s.\`owner_user_id\`, s.\`expire_at\`, s.\`grace_until\`,
              u.\`phone\` AS owner_phone
       FROM \`family_subscription\` s
       JOIN \`family\` f ON f.\`id\` = s.\`family_id\` AND f.\`status\` = 1
       LEFT JOIN \`subscription_plan\` p ON p.\`code\` = s.\`plan_code\`
       LEFT JOIN \`user\` u ON u.\`id\` = s.\`owner_user_id\` AND u.\`status\` = 1
       WHERE s.\`status\` = 'grace'
         AND s.\`grace_until\` IS NOT NULL
         AND s.\`grace_until\` > NOW()`
    );

    for (const row of inGrace) {
      const target: RemindTarget = {
        familyId: Number(row.family_id),
        familyName: toStr(row.family_name),
        planCode: toStr(row.plan_code),
        planName: toStr(row.plan_name || row.plan_code),
        ownerUserId: toStr(row.owner_user_id),
        ownerPhone: toStr(row.owner_phone),
        expireAt: new Date(row.expire_at as string),
        graceUntil: new Date(row.grace_until as string)
      };
      const graceDaysLeft = Math.ceil((target.graceUntil.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      // 宽限截止前 3 天当天触发
      if (graceDaysLeft <= 3 && graceDaysLeft > 2) {
        if (await this.sendReminder(target, 'G-3')) counts['G-3']++;
      }
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total > 0) {
      this.logger.log(`续费提醒完成：T-30=${counts['T-30']} T-14=${counts['T-14']} T-7=${counts['T-7']} T-1=${counts['T-1']} G-3=${counts['G-3']}`);
    }
    return counts;
  }

  /**
   * 发送单条提醒（含幂等标记）：已发送过的节点直接跳过
   * 渠道优先级：微信订阅消息 > 短信
   * @returns 是否实际发送
   */
  private async sendReminder(target: RemindTarget, node: RemindNode): Promise<boolean> {
    const [existing] = await this.dataSource.query<DataRow[]>(
      'SELECT `id` FROM `subscription_renewal_reminder` WHERE `family_id` = ? AND `node` = ?',
      [target.familyId, node] as QueryValues
    );
    if (existing) return false; // 已发送过，幂等跳过

    const content = this.buildContent(target, node);

    // 渠道 1：微信订阅消息（有授权时优先，零成本）
    if (this.wxSubscribeMessageService.isConfigured()) {
      const sent = await this.wxSubscribeMessageService.send(target.ownerUserId, 'renewal_reminder', {
        familyName: target.familyName,
        planName: target.planName,
        expireDate: target.expireAt.toISOString().slice(0, 10),
        graceDate: target.graceUntil ? target.graceUntil.toISOString().slice(0, 10) : '',
        node
      });
      if (sent) {
        await this.markSent(target.familyId, node);
        this.logger.log(`[REMIND-${node}] 已向用户 ${target.ownerUserId} 发送微信订阅消息（家族 ${target.familyId}）`);
        return true;
      }
    }

    // 渠道 2：短信
    if (!target.ownerPhone) {
      this.logger.warn(`家族 ${target.familyId} 无绑定手机号且微信订阅消息未授权，无法发送 ${node} 续费提醒（owner=${target.ownerUserId}）`);
      await this.markSent(target.familyId, node);
      return false;
    }

    try {
      await this.sendSms(target.ownerPhone, content);
      await this.markSent(target.familyId, node);
      this.logger.log(`[REMIND-${node}] 已向 ${target.ownerPhone} 发送家族 ${target.familyId} 续费提醒`);
      return true;
    } catch (err) {
      this.logger.error(`家族 ${target.familyId} ${node} 续费提醒发送失败: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** 通过 SmsProvider 发送（SmsProvider 接口为验证码场景，此处扩展为通用文案发送） */
  private async sendSms(phone: string, content: string): Promise<void> {
    // SmsService 当前仅暴露验证码发送；此处直接复用其 provider 逻辑
    // 若 provider 不支持通用文案，Mock 模式会打印日志，真实模式需在 SmsProvider 接口扩展 sendNotice
    const provider = (this.smsService as unknown as { provider?: { send: (p: string, c: string) => Promise<void> } }).provider;
    if (provider && typeof provider.send === 'function') {
      // 将文案作为「验证码」参数透传；Mock 会打印完整文案，真实服务商需扩展支持通用模板
      await provider.send(phone, content);
    } else {
      this.logger.log(`[SMS] 向 ${phone} 发送续费提醒：${content}`);
    }
  }

  /** 标记节点已发送（幂等表，唯一键防重） */
  private async markSent(familyId: number, node: RemindNode): Promise<void> {
    await this.dataSource.query(
      'INSERT IGNORE INTO `subscription_renewal_reminder` (`family_id`, `node`) VALUES (?, ?)',
      [familyId, node] as QueryValues
    );
  }

  /** 生成提醒文案 */
  private buildContent(target: RemindTarget, node: RemindNode): string {
    const expireStr = target.expireAt.toISOString().slice(0, 10);
    if (node === 'G-3') {
      const graceStr = target.graceUntil ? target.graceUntil.toISOString().slice(0, 10) : '';
      return `【数字家谱】您家族「${target.familyName}」的${target.planName}已过期，宽限期至 ${graceStr}，请及时续费，逾期数据将转为只读。`;
    }
    return `【数字家谱】您家族「${target.familyName}」的${target.planName}将于 ${expireStr} 到期，提前续费可保留全部权益。`;
  }
}
