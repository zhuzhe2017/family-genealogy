import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  Capability,
  type ExpireScanResult,
  type FamilyQuotaRow,
  type FamilySubscriptionRow,
  type PlanView,
  type ResultSetHeaderLike,
  type StorageUsageRow,
  type SubscriptionPlanRow,
  type SubscriptionView
} from './types/membership.types';
import { EntitlementException, ENTITLEMENT_ERRORS } from './membership.exception';

/** 订阅/套餐缓存有效期（毫秒），支付回调等场景主动失效保证即时生效 */
const CACHE_TTL = 60_000;
/** 宽限期天数 */
const GRACE_DAYS = 7;
/** 免费版存储上限（500MB），与迁移脚本种子数据一致 */
const FREE_STORAGE_LIMIT = 500 * 1024 * 1024;

@Injectable()
export class EntitlementService implements OnModuleInit {
  private readonly logger = new Logger(EntitlementService.name);
  private readonly planCache = new Map<string, { value: PlanView; expires: number }>();
  private readonly subCache = new Map<number, { value: SubscriptionView; expires: number }>();
  /** 到期扫描执行间隔（6 小时一次，覆盖「每日定时任务」要求且能及时流转状态） */
  private static readonly SCAN_INTERVAL = 6 * 60 * 60 * 1000;
  /** 扫描中标志，防止 DB 卡顿时 setInterval 叠加并发执行 */
  private scanRunning = false;

  constructor(private readonly dataSource: DataSource) {}

  /** 应用启动后注册到期扫描定时任务（active→grace→expired 状态机自动流转） */
  onModuleInit() {
    setInterval(() => void this.runExpireScan(), EntitlementService.SCAN_INTERVAL);
  }

  /** 执行到期扫描并记录日志；单实例内防重入 */
  private async runExpireScan(): Promise<void> {
    if (this.scanRunning) return;
    this.scanRunning = true;
    try {
      const result = await this.expireScan();
      if (result.toGrace > 0 || result.toExpired > 0) {
        this.logger.log(`订阅到期扫描完成：${result.toGrace} 进入宽限，${result.toExpired} 过期`);
      }
      // 存储对账：以 storage_usage_record（status=1）明细为准，修正 family_quota.storage_used 偏差
      const reconciled = await this.reconcileStorage();
      if (reconciled > 0) {
        this.logger.log(`存储对账完成：修正 ${reconciled} 个家族存储用量偏差`);
      }
    } catch (err) {
      this.logger.error(`订阅到期扫描失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.scanRunning = false;
    }
  }

  // ==================== 套餐读取（缓存） ====================

  /** 读取套餐（含能力点/存储/按次额度），缓存 60s */
  async getPlan(planCode: string): Promise<PlanView> {
    const cached = this.planCache.get(planCode);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }

    const [row] = await this.dataSource.query<SubscriptionPlanRow[]>(
      'SELECT `code`, `name`, `price_annual`, `capabilities`, `storage_limit`, `quota_rules` FROM `subscription_plan` WHERE `code` = ? AND `status` = 1',
      [planCode]
    );
    if (!row) {
      throw new EntitlementException(ENTITLEMENT_ERRORS.GENERIC, `订阅套餐不存在: ${planCode}`);
    }

    const plan: PlanView = {
      code: row.code,
      name: row.name,
      priceAnnual: Number(row.price_annual) || 0,
      capabilities: this.parseStringArray(row.capabilities),
      storageLimit: Number(row.storage_limit) || 0,
      quotaRules: this.parseNumberMap(row.quota_rules)
    };
    this.planCache.set(planCode, { value: plan, expires: Date.now() + CACHE_TTL });
    return plan;
  }

  /** 使套餐缓存失效（管理后台调整套餐后调用） */
  invalidatePlanCache() {
    this.planCache.clear();
  }

  /** 全部启用中的套餐（按 sort_order 排序），会员中心展示用 */
  async getAllPlans(): Promise<PlanView[]> {
    const rows = await this.dataSource.query<SubscriptionPlanRow[]>(
      'SELECT `code`, `name`, `price_annual`, `capabilities`, `storage_limit`, `quota_rules` FROM `subscription_plan` WHERE `status` = 1 ORDER BY `sort_order` ASC, `id` ASC'
    );
    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      priceAnnual: Number(row.price_annual) || 0,
      capabilities: this.parseStringArray(row.capabilities),
      storageLimit: Number(row.storage_limit) || 0,
      quotaRules: this.parseNumberMap(row.quota_rules)
    }));
  }

  // ==================== 订阅读取（缓存） ====================

  /**
   * 获取家族订阅视图；无订阅记录时返回免费版视图。
   * 免费版不设到期时间，故永远不会进入 grace/expired。
   */
  async getSubscription(familyId: number): Promise<SubscriptionView> {
    const cached = this.subCache.get(familyId);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }

    const [row] = await this.dataSource.query<FamilySubscriptionRow[]>(
      'SELECT * FROM `family_subscription` WHERE `family_id` = ?',
      [familyId]
    );

    let view: SubscriptionView;
    if (!row || row.plan_code === 'free') {
      view = {
        familyId,
        planCode: 'free',
        planName: '免费版',
        status: 'active',
        capabilities: [],
        storageLimit: FREE_STORAGE_LIMIT,
        quotaRules: {},
        expireAt: null,
        graceUntil: null
      };
    } else {
      const plan = await this.getPlan(row.plan_code);
      view = {
        familyId,
        planCode: row.plan_code,
        planName: plan.name,
        status: row.status,
        capabilities: plan.capabilities,
        storageLimit: plan.storageLimit,
        quotaRules: plan.quotaRules,
        expireAt: this.toDateString(row.expire_at),
        graceUntil: this.toDateString(row.grace_until)
      };
    }

    this.subCache.set(familyId, { value: view, expires: Date.now() + CACHE_TTL });
    return view;
  }

  /** 使指定家族订阅缓存失效（支付回调/续费/后台调整后调用，保证即时生效） */
  invalidateSubscriptionCache(familyId: number) {
    this.subCache.delete(familyId);
  }

  // ==================== 拦截型能力点 ====================

  /**
   * 拦截型能力点校验：
   * - expired 或冻结周期已过 → 4004（数据只读，写操作拒绝）
   * - 套餐不含该能力点 → 4001（引导升级）
   */
  async assertCapability(familyId: number, capability: Capability): Promise<void> {
    const sub = await this.getSubscription(familyId);

    // 状态检查：frozen 时若当前周期（expire_at）已过则只读；grace 与 active 均放行
    if (sub.status === 'expired' || (sub.status === 'frozen' && this.isPast(sub.expireAt))) {
      throw new EntitlementException(ENTITLEMENT_ERRORS.SUBSCRIPTION_EXPIRED, '订阅已过期，数据为只读状态，请续费后继续使用');
    }

    if (!sub.capabilities.includes(capability)) {
      throw new EntitlementException(ENTITLEMENT_ERRORS.CAPABILITY_LOCKED, `该功能为会员专属权益，请升级套餐后使用（${sub.planName}）`);
    }
  }

  /**
   * 订阅可写校验：不检查具体能力点，仅校验订阅状态。
   * active/grace 可写；expired / frozen 到期只读。供不绑定能力点的基础写操作使用。
   */
  async assertWritable(familyId: number): Promise<void> {
    const sub = await this.getSubscription(familyId);
    if (sub.status === 'expired' || (sub.status === 'frozen' && this.isPast(sub.expireAt))) {
      throw new EntitlementException(ENTITLEMENT_ERRORS.SUBSCRIPTION_EXPIRED, '订阅已过期，数据为只读状态，请续费后继续使用');
    }
  }

  // ==================== 额度型能力点 ====================

  /**
   * 额度型能力点原子扣减（防并发超扣）：
   * - 额度型能力点是否可用以「配额规则」为准（quota_rules 存在该能力点即视为套餐包含），
   *   不要求 capabilities 数组同时列出——ai_restore/worship_pro 属额度型，从 quotaRules 判定。
   * - 状态检查与 assertCapability 一致：expired / 冻结且周期已过 → 4004。
   * - 条件更新 `used + delta <= limit`，影响行数为 0 即额度不足 → 4003。
   */
  async consumeQuota(familyId: number, capability: Capability, delta = 1): Promise<void> {
    const sub = await this.getSubscription(familyId);
    if (sub.status === 'expired' || (sub.status === 'frozen' && this.isPast(sub.expireAt))) {
      throw new EntitlementException(ENTITLEMENT_ERRORS.SUBSCRIPTION_EXPIRED, '订阅已过期，数据为只读状态，请续费后继续使用');
    }

    const limit = sub.quotaRules[capability];
    if (limit === undefined || limit === null || limit <= 0) {
      throw new EntitlementException(ENTITLEMENT_ERRORS.CAPABILITY_LOCKED, `该功能为会员专属权益，请升级套餐后使用（${sub.planName}）`);
    }

    const column = this.quotaColumn(capability);
    await this.ensureQuota(familyId);
    // column 来自白名单映射，非用户输入
    const result = await this.dataSource.query(
      `UPDATE \`family_quota\` SET \`${column}\` = \`${column}\` + ? WHERE \`family_id\` = ? AND \`${column}\` + ? <= ?`,
      [delta, familyId, delta, limit]
    );
    if (this.affectedRows(result) === 0) {
      throw new EntitlementException(ENTITLEMENT_ERRORS.QUOTA_EXHAUSTED, `本周期额度已用尽（${limit} 次）`);
    }
  }

  // ==================== 存储容量 ====================

  /** 上传前预检：剩余容量是否足够；storageLimit=0 表示不限 */
  async assertStorage(familyId: number, fileSize: number): Promise<void> {
    const sub = await this.getSubscription(familyId);
    if (sub.storageLimit === 0) return;

    const quota = await this.getQuota(familyId);
    const used = quota?.storage_used ?? 0;
    if (used + fileSize > sub.storageLimit) {
      const remainMb = Math.max(0, Math.floor((sub.storageLimit - used) / (1024 * 1024)));
      throw new EntitlementException(
        ENTITLEMENT_ERRORS.STORAGE_LIMIT,
        `家族存储空间不足（剩余 ${remainMb}MB），请升级套餐或清理空间`
      );
    }
  }

  /** 上传成功后记账：写入占用明细 + 累加 storage_used（业务保存失败时调用 releaseStorage 补偿） */
  async recordStorage(
    familyId: number,
    fileKey: string,
    fileSize: number,
    bizType: string,
    bizId = '',
    userId = ''
  ): Promise<void> {
    await this.ensureQuota(familyId);
    await this.dataSource.query(
      'INSERT INTO `storage_usage_record` (`family_id`, `file_key`, `file_size`, `biz_type`, `biz_id`, `user_id`, `status`) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [familyId, fileKey, fileSize, bizType, bizId, userId]
    );
    await this.dataSource.query(
      'UPDATE `family_quota` SET `storage_used` = `storage_used` + ? WHERE `family_id` = ?',
      [fileSize, familyId]
    );
  }

  /** 释放存储占用（业务删除/上传补偿），按 file_key 幂等释放 */
  async releaseStorage(fileKey: string): Promise<void> {
    const rows = await this.dataSource.query<Pick<StorageUsageRow, 'family_id' | 'file_size'>[]>(
      'SELECT `family_id`, `file_size` FROM `storage_usage_record` WHERE `file_key` = ? AND `status` = 1 LIMIT 1',
      [fileKey]
    );
    if (rows.length === 0) return;

    await this.dataSource.query(
      'UPDATE `storage_usage_record` SET `status` = 0 WHERE `file_key` = ? AND `status` = 1',
      [fileKey]
    );
    await this.dataSource.query(
      'UPDATE `family_quota` SET `storage_used` = GREATEST(0, `storage_used` - ?) WHERE `family_id` = ?',
      [rows[0].file_size, rows[0].family_id]
    );
  }

  // ==================== 订阅生命周期 ====================

  /**
   * 激活/续费订阅（支付成功后调用）：
   * - 已有订阅且未到期：到期时间顺延（max(now, expire_at) + months）
   * - 首次购买：从当前时间开始计
   * - 同时重置按次额度周期（ai_restore / worship_pro 归零）
   */
  async activateSubscription(
    familyId: number,
    planCode: string,
    months = 12,
    ownerUserId = ''
  ): Promise<void> {
    const plan = await this.getPlan(planCode); // 校验套餐存在且启用
    if (plan.code === 'free') {
      throw new EntitlementException(ENTITLEMENT_ERRORS.GENERIC, '免费版无需购买');
    }

    const now = new Date();
    const [existing] = await this.dataSource.query<FamilySubscriptionRow[]>(
      'SELECT `expire_at` FROM `family_subscription` WHERE `family_id` = ?',
      [familyId]
    );

    const base = existing?.expire_at && new Date(existing.expire_at) > now ? new Date(existing.expire_at) : now;
    const expire = this.addMonths(base, months);
    const periodEnd = expire.toISOString().slice(0, 10);

    if (existing) {
      await this.dataSource.query(
        'UPDATE `family_subscription` SET `plan_code` = ?, `status` = ?, `owner_user_id` = ?, `paid_at` = ?, `expire_at` = ?, `grace_until` = NULL, `cancel_reason` = ? WHERE `family_id` = ?',
        [planCode, 'active', ownerUserId, now, expire, '', familyId]
      );
    } else {
      await this.dataSource.query(
        'INSERT INTO `family_subscription` (`family_id`, `plan_code`, `status`, `owner_user_id`, `paid_at`, `expire_at`) VALUES (?, ?, ?, ?, ?, ?)',
        [familyId, planCode, 'active', ownerUserId, now, expire]
      );
    }

    // 重置按次额度周期
    await this.dataSource.query(
      'INSERT INTO `family_quota` (`family_id`, `ai_restore_used`, `worship_pro_used`, `quota_period_start`, `quota_period_end`) VALUES (?, 0, 0, CURDATE(), ?) ON DUPLICATE KEY UPDATE `ai_restore_used` = 0, `worship_pro_used` = 0, `quota_period_start` = CURDATE(), `quota_period_end` = ?',
      [familyId, periodEnd, periodEnd]
    );

    this.invalidateSubscriptionCache(familyId);
  }

  /** 到期扫描（每日定时任务）：active→grace（7天宽限），grace→expired */
  async expireScan(): Promise<ExpireScanResult> {
    const [toGrace] = await this.dataSource.query<ResultSetHeaderLike[]>(
      "UPDATE `family_subscription` SET `status` = 'grace', `grace_until` = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE `status` = 'active' AND `plan_code` != 'free' AND `expire_at` IS NOT NULL AND `expire_at` < NOW()",
      [GRACE_DAYS]
    );
    const [toExpired] = await this.dataSource.query<ResultSetHeaderLike[]>(
      "UPDATE `family_subscription` SET `status` = 'expired', `grace_until` = NULL WHERE `status` = 'grace' AND `grace_until` IS NOT NULL AND `grace_until` < NOW()"
    );

    const result: ExpireScanResult = {
      toGrace: this.affectedRows(toGrace),
      toExpired: this.affectedRows(toExpired)
    };
    if (result.toGrace > 0 || result.toExpired > 0) {
      this.subCache.clear(); // 状态批量变化，直接清空订阅缓存
    }
    return result;
  }

  /**
   * 取消订阅（退款等场景）：
   * 置为 frozen——当前周期内权益保留，周期结束后只读，数据永不删除。
   */
  async cancelSubscription(familyId: number, reason = ''): Promise<void> {
    await this.dataSource.query(
      "UPDATE `family_subscription` SET `status` = 'frozen', `cancel_reason` = ? WHERE `family_id` = ?",
      [reason, familyId]
    );
    this.invalidateSubscriptionCache(familyId);
  }

  /**
   * 存储对账：以 storage_usage_record（status=1）明细为准，修正 family_quota.storage_used 偏差。
   * 覆盖两类不一致：
   * - 明细求和 < 账户值（明细被软删/补偿遗漏）→ 下调
   * - 明细求和 > 账户值（记账中途失败等）→ 上调
   * 返回修正的家族数；随到期扫描任务每 6 小时执行一次。
   */
  async reconcileStorage(): Promise<number> {
    const [result] = await this.dataSource.query<ResultSetHeaderLike[]>(
      `UPDATE \`family_quota\` q
       LEFT JOIN (
         SELECT \`family_id\`, COALESCE(SUM(\`file_size\`), 0) AS actual
         FROM \`storage_usage_record\` WHERE \`status\` = 1
         GROUP BY \`family_id\`
       ) u ON u.\`family_id\` = q.\`family_id\`
       SET q.\`storage_used\` = COALESCE(u.actual, 0)
       WHERE COALESCE(u.actual, 0) <> q.\`storage_used\``
    );
    return this.affectedRows(result);
  }

  // ==================== 内部工具 ====================

  /** 确保额度账户存在（懒创建） */
  private async ensureQuota(familyId: number): Promise<void> {
    await this.dataSource.query(
      'INSERT IGNORE INTO `family_quota` (`family_id`) VALUES (?)',
      [familyId]
    );
  }

  private async getQuota(familyId: number): Promise<FamilyQuotaRow | null> {
    await this.ensureQuota(familyId);
    const rows = await this.dataSource.query<FamilyQuotaRow[]>(
      'SELECT * FROM `family_quota` WHERE `family_id` = ?',
      [familyId]
    );
    return rows[0] ?? null;
  }

  /** 查询家族额度使用情况（订阅状态接口使用）：存储用量 + 各按次额度当前消耗 */
  async getQuotaUsage(familyId: number): Promise<{
    storageUsed: number;
    aiRestoreUsed: number;
    worshipProUsed: number;
    quotaPeriodStart: string | null;
    quotaPeriodEnd: string | null;
  }> {
    const quota = await this.getQuota(familyId);
    return {
      storageUsed: Number(quota?.storage_used) || 0,
      aiRestoreUsed: Number(quota?.ai_restore_used) || 0,
      worshipProUsed: Number(quota?.worship_pro_used) || 0,
      quotaPeriodStart: this.toDateString(quota?.quota_period_start ?? null),
      quotaPeriodEnd: this.toDateString(quota?.quota_period_end ?? null)
    };
  }

  /** 能力点 → 额度列名（白名单映射，杜绝 SQL 注入） */
  private quotaColumn(capability: Capability): string {
    switch (capability) {
      case Capability.AiRestore:
        return 'ai_restore_used';
      case Capability.WorshipPro:
        return 'worship_pro_used';
      default:
        throw new EntitlementException(ENTITLEMENT_ERRORS.QUOTA_EXHAUSTED, '不支持的额度类型');
    }
  }

  /** 解析 mysql2 写语句结果，提取 affectedRows */
  private affectedRows(result: unknown): number {
    const header = Array.isArray(result) ? result[0] : result;
    return (header as ResultSetHeaderLike | undefined)?.affectedRows ?? 0;
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

  private toDateString(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private isPast(value: string | null): boolean {
    if (!value) return false;
    return new Date(value).getTime() < Date.now();
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }
}
