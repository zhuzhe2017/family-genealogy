import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EntitlementService } from '../membership/membership.service';
import { SystemLogService } from '../system-log/system-log.service';
import { type QueryValues } from '../common/types/common';
import {
  type ActivateData,
  type AdminFamilySubscriptionRow,
  type AdminOrderRow,
  type AdminPlanRow,
  type FreezeData,
  type PlanUpsertData
} from './types/subscription-admin.types';

/** 管理后台操作日志统一记录 */
interface OpLogParams {
  action: string;
  path: string;
  operator: string;
  operatorId: number | null;
  detail: string;
}

@Injectable()
export class SubscriptionAdminService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly entitlementService: EntitlementService,
    private readonly systemLogService: SystemLogService
  ) {}

  // ==================== 套餐管理 ====================

  /** 套餐分页列表（含停用套餐，供后台管理） */
  async getPlanList(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    status?: number;
  }) {
    const { page, pageSize, keyword, status } = params;
    const offset = (page - 1) * pageSize;
    const where: string[] = [];
    const values: QueryValues = [];

    if (keyword) {
      where.push('(`name` LIKE ? OR `code` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (status !== undefined && status !== null) {
      where.push('`status` = ?');
      values.push(status);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`subscription_plan\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<AdminPlanRow[]>(
      `SELECT \`id\`, \`code\`, \`name\`, \`price_annual\`, \`capabilities\`, \`storage_limit\`, \`quota_rules\`, \`sort_order\`, \`status\`, \`create_time\`, \`update_time\` FROM \`subscription_plan\` ${whereClause} ORDER BY \`sort_order\` ASC, \`id\` ASC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return {
      list: list.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        priceAnnual: Number(row.price_annual) || 0,
        capabilities: this.parseStringArray(row.capabilities),
        storageLimit: Number(row.storage_limit) || 0,
        quotaRules: this.parseNumberMap(row.quota_rules),
        sortOrder: row.sort_order,
        status: row.status,
        createTime: row.create_time,
        updateTime: row.update_time
      })),
      total,
      page,
      pageSize
    };
  }

  /** 创建套餐（code 唯一） */
  async createPlan(data: PlanUpsertData, operator: string, operatorId: number | null) {
    const code = (data.code || '').trim();
    if (!code) {
      throw new HttpException('套餐编码不能为空', HttpStatus.BAD_REQUEST);
    }
    if (!data.name) {
      throw new HttpException('套餐名称不能为空', HttpStatus.BAD_REQUEST);
    }

    const [exists] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `subscription_plan` WHERE `code` = ?',
      [code]
    );
    if (exists) {
      throw new HttpException(`套餐编码已存在: ${code}`, HttpStatus.BAD_REQUEST);
    }

    await this.dataSource.query(
      'INSERT INTO `subscription_plan` (`code`, `name`, `price_annual`, `capabilities`, `storage_limit`, `quota_rules`, `sort_order`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        code,
        data.name,
        data.priceAnnual ?? 0,
        JSON.stringify(data.capabilities || []),
        data.storageLimit ?? 0,
        JSON.stringify(data.quotaRules || {}),
        data.sortOrder ?? 0,
        data.status ?? 1
      ]
    );
    this.entitlementService.invalidatePlanCache();
    this.writeLog({
      action: '新增套餐',
      path: '/api/subscription/plans/create',
      operator,
      operatorId,
      detail: `plan=${code} name=${data.name} price=${data.priceAnnual}`
    });
    return { code };
  }

  /** 更新套餐（按 code） */
  async updatePlan(code: string, data: PlanUpsertData, operator: string, operatorId: number | null) {
    const [plan] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `subscription_plan` WHERE `code` = ?',
      [code]
    );
    if (!plan) {
      throw new HttpException(`套餐不存在: ${code}`, HttpStatus.NOT_FOUND);
    }

    const fields: string[] = [];
    const values: QueryValues = [];
    if (data.name !== undefined) { fields.push('`name` = ?'); values.push(data.name); }
    if (data.priceAnnual !== undefined) { fields.push('`price_annual` = ?'); values.push(data.priceAnnual); }
    if (data.capabilities !== undefined) { fields.push('`capabilities` = ?'); values.push(JSON.stringify(data.capabilities)); }
    if (data.storageLimit !== undefined) { fields.push('`storage_limit` = ?'); values.push(data.storageLimit); }
    if (data.quotaRules !== undefined) { fields.push('`quota_rules` = ?'); values.push(JSON.stringify(data.quotaRules || {})); }
    if (data.sortOrder !== undefined) { fields.push('`sort_order` = ?'); values.push(data.sortOrder); }
    if (data.status !== undefined) { fields.push('`status` = ?'); values.push(data.status); }

    if (fields.length === 0) {
      throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);
    }

    values.push(code);
    await this.dataSource.query(
      `UPDATE \`subscription_plan\` SET ${fields.join(', ')} WHERE \`code\` = ?`,
      values
    );
    this.entitlementService.invalidatePlanCache();
    this.writeLog({
      action: '更新套餐',
      path: `/api/subscription/plans/update/${code}`,
      operator,
      operatorId,
      detail: `plan=${code} fields=${fields.length}`
    });
    return { success: true };
  }

  // ==================== 家族订阅管理 ====================

  /** 家族订阅分页列表（join 家族/额度，含存储与按次用量） */
  async getFamilySubscriptionList(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    planCode?: string;
    status?: string;
  }) {
    const { page, pageSize, keyword, planCode, status } = params;
    const offset = (page - 1) * pageSize;
    const where: string[] = ['f.`status` = 1'];
    const values: QueryValues = [];

    if (keyword) {
      where.push('f.`name` LIKE ?');
      values.push(`%${keyword}%`);
    }
    if (planCode) {
      // 无订阅行的家族即免费版（隐式），需 COALESCE 归一化才能被 'free' 筛选命中
      where.push('COALESCE(fs.`plan_code`, \'free\') = ?');
      values.push(planCode);
    }
    if (status) {
      where.push('fs.`status` = ?');
      values.push(status);
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`family\` f
       LEFT JOIN \`family_subscription\` fs ON fs.\`family_id\` = f.\`id\`
       ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<AdminFamilySubscriptionRow[]>(
      `SELECT f.\`id\` AS \`family_id\`, f.\`name\` AS \`family_name\`,
              COALESCE(fs.\`plan_code\`, 'free') AS \`plan_code\`,
              fs.\`status\`, fs.\`owner_user_id\`, fs.\`auto_renew\`, fs.\`paid_at\`, fs.\`expire_at\`, fs.\`grace_until\`, fs.\`cancel_reason\`,
              u.\`nickname\` AS \`owner_nickname\`,
              fq.\`storage_used\`, fq.\`ai_restore_used\`, fq.\`worship_pro_used\`, fq.\`quota_period_end\`
       FROM \`family\` f
       LEFT JOIN \`family_subscription\` fs ON fs.\`family_id\` = f.\`id\`
       LEFT JOIN \`user\` u ON u.\`id\` = fs.\`owner_user_id\`
       LEFT JOIN \`family_quota\` fq ON fq.\`family_id\` = f.\`id\`
       ${whereClause}
       ORDER BY f.\`id\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    // 补充套餐名（免费版无 subscription 行时用默认名）
    const planRows = await this.dataSource.query<{ code: string; name: string }[]>(
      'SELECT `code`, `name` FROM `subscription_plan`'
    );
    const planNameMap = new Map(planRows.map((p) => [p.code, p.name]));
    planNameMap.set('free', '免费版');

    return {
      list: list.map((row) => ({
        familyId: row.family_id,
        familyName: row.family_name,
        planCode: row.plan_code || 'free',
        planName: planNameMap.get(row.plan_code || 'free') || row.plan_code || '免费版',
        status: row.status || 'active',
        ownerUserId: row.owner_user_id || '',
        ownerNickname: row.owner_nickname || '',
        autoRenew: Number(row.auto_renew) || 0,
        paidAt: row.paid_at,
        expireAt: row.expire_at,
        graceUntil: row.grace_until,
        cancelReason: row.cancel_reason || '',
        storageUsed: Number(row.storage_used) || 0,
        aiRestoreUsed: Number(row.ai_restore_used) || 0,
        worshipProUsed: Number(row.worship_pro_used) || 0,
        quotaPeriodEnd: row.quota_period_end
      })),
      total,
      page,
      pageSize
    };
  }

  /** 管理端开通/升级/续费家族订阅（走订阅生命周期，重置额度周期） */
  async activateFamily(data: ActivateData, operator: string, operatorId: number | null) {
    if (!data.familyId || data.familyId <= 0) {
      throw new HttpException('缺少家族ID', HttpStatus.BAD_REQUEST);
    }
    const [family] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family` WHERE `id` = ? AND `status` = 1',
      [data.familyId]
    );
    if (!family) {
      throw new HttpException('家族不存在或已停用', HttpStatus.NOT_FOUND);
    }
    const months = data.months && data.months > 0 ? data.months : 12;

    await this.entitlementService.activateSubscription(data.familyId, data.planCode, months, data.ownerUserId || '');
    this.writeLog({
      action: '后台开通/续费订阅',
      path: '/api/subscription/families/activate',
      operator,
      operatorId,
      detail: `family=${data.familyId} plan=${data.planCode} months=${months}`
    });
    return { success: true };
  }

  /** 管理端冻结家族订阅（周期内权益保留，到期只读） */
  async freezeFamily(data: FreezeData, operator: string, operatorId: number | null) {
    if (!data.familyId || data.familyId <= 0) {
      throw new HttpException('缺少家族ID', HttpStatus.BAD_REQUEST);
    }
    const [sub] = await this.dataSource.query<{ family_id: number }[]>(
      'SELECT `family_id` FROM `family_subscription` WHERE `family_id` = ?',
      [data.familyId]
    );
    if (!sub) {
      throw new HttpException('该家族暂无订阅记录', HttpStatus.BAD_REQUEST);
    }

    await this.entitlementService.cancelSubscription(data.familyId, data.reason || '管理员冻结');
    this.writeLog({
      action: '后台冻结订阅',
      path: '/api/subscription/families/freeze',
      operator,
      operatorId,
      detail: `family=${data.familyId} reason=${data.reason || ''}`
    });
    return { success: true };
  }

  // ==================== 订单记录 ====================

  /** 订阅订单分页列表（join 家族/用户/套餐） */
  async getOrderList(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    status?: string;
    familyId?: number;
  }) {
    const { page, pageSize, keyword, status, familyId } = params;
    const offset = (page - 1) * pageSize;
    const where: string[] = [];
    const values: QueryValues = [];

    if (keyword) {
      where.push('(o.`order_no` LIKE ? OR f.`name` LIKE ? OR u.`nickname` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (status) {
      where.push('o.`status` = ?');
      values.push(status);
    }
    if (familyId && familyId > 0) {
      where.push('o.`family_id` = ?');
      values.push(familyId);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`subscription_order\` o
       LEFT JOIN \`family\` f ON f.\`id\` = o.\`family_id\`
       LEFT JOIN \`user\` u ON u.\`id\` = o.\`user_id\`
       ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<AdminOrderRow[]>(
      `SELECT o.\`id\`, o.\`order_no\`, o.\`out_trade_no\`, o.\`family_id\`, f.\`name\` AS \`family_name\`,
              o.\`user_id\`, u.\`nickname\` AS \`user_nickname\`, o.\`plan_code\`, p.\`name\` AS \`plan_name\`,
              o.\`amount\`, o.\`period_months\`, o.\`status\`, o.\`transaction_id\`, o.\`pay_time\`, o.\`refund_time\`, o.\`create_time\`
       FROM \`subscription_order\` o
       LEFT JOIN \`family\` f ON f.\`id\` = o.\`family_id\`
       LEFT JOIN \`user\` u ON u.\`id\` = o.\`user_id\`
       LEFT JOIN \`subscription_plan\` p ON p.\`code\` = o.\`plan_code\`
       ${whereClause}
       ORDER BY o.\`id\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return {
      list: list.map((row) => ({
        id: row.id,
        orderNo: row.order_no,
        outTradeNo: row.out_trade_no,
        familyId: row.family_id,
        familyName: row.family_name,
        userId: row.user_id,
        userNickname: row.user_nickname,
        planCode: row.plan_code,
        planName: row.plan_name || row.plan_code,
        amount: Number(row.amount) || 0,
        periodMonths: row.period_months,
        status: row.status,
        transactionId: row.transaction_id,
        payTime: row.pay_time,
        refundTime: row.refund_time,
        createTime: row.create_time
      })),
      total,
      page,
      pageSize
    };
  }

  // ==================== 工具 ====================

  private writeLog(params: OpLogParams) {
    this.systemLogService.write({
      logType: 'operation',
      module: 'subscription',
      action: params.action,
      method: 'POST',
      path: params.path,
      operator: params.operator,
      operatorId: params.operatorId,
      success: true,
      detail: params.detail
    });
  }

  /** 解析能力点集合：兼容 mysql2 返回的数组对象与 JSON 字符串两种形态 */
  private parseStringArray(raw: string | unknown[]): string[] {
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === 'string') {
      try {
        const value = JSON.parse(raw);
        return Array.isArray(value) ? value.map(String) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  /** 解析按次额度规则：兼容 mysql2 返回的对象与 JSON 字符串两种形态 */
  private parseNumberMap(raw: string | Record<string, unknown> | null): Record<string, number> {
    if (raw && typeof raw === 'object') {
      const result: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw)) {
        result[k] = Number(v) || 0;
      }
      return result;
    }
    if (typeof raw === 'string' && raw) {
      try {
        const value = JSON.parse(raw) as unknown;
        if (typeof value !== 'object' || value === null) return {};
        const result: Record<string, number> = {};
        for (const [k, v] of Object.entries(value)) {
          result[k] = Number(v) || 0;
        }
        return result;
      } catch {
        return {};
      }
    }
    return {};
  }
}
