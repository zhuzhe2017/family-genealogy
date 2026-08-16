/**
 * 订阅管理后台类型定义（admin）
 * 覆盖：套餐管理、家族订阅列表与开通/冻结、订单记录查询。
 */

/** subscription_plan 管理视图行 */
export interface AdminPlanRow {
  id: number;
  code: string;
  name: string;
  price_annual: string | number;
  capabilities: string;
  storage_limit: number;
  quota_rules: string;
  sort_order: number;
  status: number;
  create_time: string;
  update_time: string;
}

/** 创建/更新套餐入参（controller 已做 Number/JSON 转换） */
export interface PlanUpsertData {
  code?: string;
  name?: string;
  priceAnnual?: number;
  capabilities?: string[];
  storageLimit?: number;
  quotaRules?: Record<string, number>;
  sortOrder?: number;
  status?: number;
}

/** 家族订阅列表行（join family / family_subscription / family_quota） */
export interface AdminFamilySubscriptionRow {
  family_id: number;
  family_name: string;
  plan_code: string;
  plan_name: string;
  status: string;
  owner_user_id: string;
  owner_nickname: string;
  auto_renew: number;
  paid_at: Date | string | null;
  expire_at: Date | string | null;
  grace_until: Date | string | null;
  cancel_reason: string;
  storage_used: number | null;
  ai_restore_used: number | null;
  worship_pro_used: number | null;
  quota_period_end: string | null;
}

/** 开通/续费入参 */
export interface ActivateData {
  familyId: number;
  planCode: string;
  months?: number;
  ownerUserId?: string;
}

/** 冻结入参 */
export interface FreezeData {
  familyId: number;
  reason?: string;
}

/** 订单列表行（join family） */
export interface AdminOrderRow {
  id: number;
  order_no: string;
  out_trade_no: string;
  family_id: number;
  family_name: string;
  user_id: string;
  user_nickname: string;
  plan_code: string;
  plan_name: string;
  amount: string | number;
  period_months: number;
  status: string;
  transaction_id: string;
  pay_time: Date | string | null;
  refund_time: Date | string | null;
  create_time: Date | string;
}
