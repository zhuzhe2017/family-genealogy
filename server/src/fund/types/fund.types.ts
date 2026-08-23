/**
 * 家族基金模块类型定义
 * 数据库行记录为 snake_case，接口入参/出参使用 camelCase（与 gathering 模块一致）
 */

/** 家族基金主表行记录 */
export interface FundRow {
  id: number;
  family_id: number;
  name: string;
  logo_url: string;
  description: string;
  total_amount: string | number;
  single_deposit_limit: string | number;
  single_withdraw_limit: string | number;
  daily_deposit_limit: string | number;
  daily_withdraw_limit: string | number;
  monthly_deposit_limit: string | number;
  monthly_withdraw_limit: string | number;
  withdraw_approval_threshold: string | number;
  need_approval: number;
  status: number;
  creator_user_id: string;
  dissolved_at: string | null;
  dissolve_reason: string;
  create_time: string;
  update_time: string;
}

/** 基金成员行记录 */
export interface FundMemberRow {
  id: number;
  fund_id: number;
  family_id: number;
  user_id: string;
  member_id: string;
  name: string;
  role: string;
  permissions: string | string[] | null;
  balance: string | number;
  status: number;
  create_time: string;
  update_time: string;
}

/** 资金交易流水行记录 */
export interface FundTxRow {
  id: number;
  fund_id: number;
  family_id: number;
  type: string;
  amount: string | number;
  direction: number;
  operator_user_id: string;
  target_user_id: string;
  payment_method: string;
  status: number;
  remark: string;
  balance_after: string | number;
  approve_user_id: string;
  approve_time: string | null;
  approve_remark: string;
  create_time: string;
}

/** 慈善榜单聚合行（按捐赠者分组：累计金额/次数） */
export interface RankTotalRow {
  userId: string;
  donorName: string;
  totalAmount: string | number;
  donationCount: number | string;
}

/** 慈善榜单最近一次捐赠行（项目/时间） */
export interface RankLatestRow {
  userId: string;
  project: string;
  lastTime: string;
}

/** 交易类型常量 */
export const TX_TYPE = {
  INIT: 'init',
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  TRANSFER: 'transfer',
  ADJUST: 'adjust'
} as const;

/** 交易状态: 1-成功 0-失败 2-待审批 3-已驳回 */
export const TX_STATUS = {
  FAILED: 0,
  SUCCESS: 1,
  PENDING: 2,
  REJECTED: 3
} as const;

/** 权限码 */
export const FUND_PERMS = {
  deposit: 'deposit', // 存入
  withdraw: 'withdraw', // 取出
  transfer: 'transfer', // 成员间转账
  viewAll: 'view_all', // 查看全部明细
  approve: 'approve', // 审批大额取出
  manageMember: 'manage_member', // 成员权限管理
  manageRule: 'manage_rule', // 规则/设置管理
  dissolve: 'dissolve' // 解散基金
} as const;

export type FundPerm = (typeof FUND_PERMS)[keyof typeof FUND_PERMS];

/** 各角色默认权限 */
export const DEFAULT_PERMS: Record<string, FundPerm[]> = {
  leader: ['deposit', 'withdraw', 'transfer', 'view_all', 'approve', 'manage_member', 'manage_rule', 'dissolve'],
  admin: ['deposit', 'withdraw', 'transfer', 'view_all', 'approve', 'manage_member'],
  member: ['deposit']
};

/** 角色中文名 */
export const ROLE_LABELS: Record<string, string> = {
  leader: '族长',
  admin: '管理员',
  member: '普通成员'
};

/** 交易类型中文名 */
export const TX_TYPE_LABELS: Record<string, string> = {
  init: '初始资金',
  deposit: '存入',
  withdraw: '取出',
  transfer: '转账',
  adjust: '调账'
};

/** 资金渠道中文名 */
export const PAYMENT_LABELS: Record<string, string> = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  bank: '银行转账'
};

/** 创建基金入参 */
export interface FundCreateData {
  name?: string;
  logoUrl?: string;
  description?: string;
  initAmount?: number;
  singleDepositLimit?: number;
  singleWithdrawLimit?: number;
  dailyDepositLimit?: number;
  dailyWithdrawLimit?: number;
  monthlyDepositLimit?: number;
  monthlyWithdrawLimit?: number;
  withdrawApprovalThreshold?: number;
  needApproval?: number | boolean;
}

/** 更新基金设置入参（与创建共用，全字段可空） */
export type FundUpdateData = Partial<FundCreateData>;

/** 资金操作入参（存取/转账/调账共用） */
export interface FundOpData {
  amount?: number | string;
  paymentMethod?: string;
  targetUserId?: string;
  direction?: number;
  remark?: string;
}

/** 添加/更新成员入参 */
export interface FundMemberData {
  userId?: string;
  memberId?: string;
  name?: string;
  role?: string;
  permissions?: string[];
}

/** 审批入参 */
export interface FundApproveData {
  approved?: boolean;
  remark?: string;
}

/** 解散入参 */
export interface FundDissolveData {
  reason?: string;
}
