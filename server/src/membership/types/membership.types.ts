/**
 * 会员系统类型定义（M1）
 * 设计：能力点（Capability）权益模型，成员数量不设限。
 * 详见 docs/membership-tech-design.md
 */

/** 能力点枚举：权益以能力点为最小单位，版本 = 能力点集合 */
export enum Capability {
  /** 拦截型：数据备份 */
  Backup = 'backup',
  /** 拦截型：谱牒数据导出 */
  Export = 'export',
  /** 拦截型：高级权限/多管理员 */
  Permission = 'permission',
  /** 拦截型：纪念日/生日推送 */
  Reminder = 'reminder',
  /** 拦截型：家族简报 */
  Digest = 'digest',
  /** 展示型：家族主页/封面定制 */
  Theme = 'theme',
  /** 展示型：家族徽章/荣誉体系 */
  Badge = 'badge',
  /** 额度型：AI 老照片修复（按张） */
  AiRestore = 'ai_restore',
  /** 额度型：祭祀增值（按次） */
  WorshipPro = 'worship_pro',
  /** 非拦截：谱牒印刷折扣 */
  Print = 'print',
  /** 非拦截：专业修谱顾问 */
  Advisor = 'advisor',
  /** 非拦截：专属客服 */
  Support = 'support',
  /** 非拦截：去广告 */
  NoAds = 'no_ads'
}

/** 订阅状态 */
export type SubscriptionStatus = 'active' | 'grace' | 'frozen' | 'expired';

/** 订阅套餐（解析后的视图） */
export interface PlanView {
  code: string;
  name: string;
  priceAnnual: number;
  capabilities: string[];
  /** 存储上限（字节），0 = 不限 */
  storageLimit: number;
  /** 按次额度规则，如 { ai_restore: 10 } */
  quotaRules: Record<string, number>;
}

/** 家族订阅视图（校验入口） */
export interface SubscriptionView {
  familyId: number;
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  capabilities: string[];
  storageLimit: number;
  quotaRules: Record<string, number>;
  expireAt: string | null;
  graceUntil: string | null;
}

/** 到期扫描结果 */
export interface ExpireScanResult {
  toGrace: number;
  toExpired: number;
}

/** subscription_plan 行（snake_case） */
export interface SubscriptionPlanRow {
  id: number;
  code: string;
  name: string;
  price_annual: string | number;
  /** mysql2 对 JSON 列可能返回解析后的数组，也可能返回字符串 */
  capabilities: string | unknown[];
  storage_limit: number;
  /** mysql2 对 JSON 列可能返回解析后的对象，也可能返回字符串 */
  quota_rules: string | Record<string, unknown> | null;
  sort_order: number;
  status: number;
}

/** family_subscription 行（snake_case） */
export interface FamilySubscriptionRow {
  id: number;
  family_id: number;
  plan_code: string;
  status: SubscriptionStatus;
  owner_user_id: string;
  auto_renew: number;
  paid_at: Date | string | null;
  expire_at: Date | string | null;
  grace_until: Date | string | null;
  cancel_reason: string;
}

/** family_quota 行（snake_case） */
export interface FamilyQuotaRow {
  id: number;
  family_id: number;
  storage_used: number;
  ai_restore_used: number;
  worship_pro_used: number;
  quota_period_start: string | null;
  quota_period_end: string | null;
}

/** 存储占用明细行（snake_case） */
export interface StorageUsageRow {
  id: number;
  family_id: number;
  file_key: string;
  file_size: number;
  biz_type: string;
  biz_id: string;
  user_id: string;
  status: number;
}

/** mysql2 ResultSetHeader 形状（用于 affectedRows） */
export interface ResultSetHeaderLike {
  affectedRows?: number;
  insertId?: number;
}
