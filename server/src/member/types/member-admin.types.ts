/**
 * 会员管理后台类型定义（admin）
 * 覆盖：会员信息 CRUD、会员等级、积分规则、积分变动记录、消费记录与统计、Excel 导出。
 */

/** 会员列表/详情行（join member_level） */
export interface MemberRow {
  id: number;
  member_no: string;
  name: string;
  phone: string | null;
  gender: number;
  birthday: Date | string | null;
  level_id: number;
  level_name: string;
  points: number;
  total_consume: string | number;
  consume_count: number;
  status: number;
  remark: string;
  create_time: Date | string;
  update_time: Date | string;
}

/** 创建会员入参 */
export interface MemberCreateData {
  name: string;
  phone?: string | null;
  gender?: number;
  birthday?: string | null;
  levelId?: number;
  points?: number;
  status?: number;
  remark?: string;
}

/** 更新会员入参 */
export interface MemberUpdateData {
  name?: string;
  phone?: string | null;
  gender?: number;
  birthday?: string | null;
  levelId?: number;
  status?: number;
  remark?: string;
}

/** 会员等级行 */
export interface LevelRow {
  id: number;
  name: string;
  code: string;
  points_min: number;
  points_max: number;
  discount_rate: string | number;
  sort_order: number;
  status: number;
  remark: string;
  create_time: Date | string;
  update_time: Date | string;
}

/** 创建/更新等级入参 */
export interface LevelUpsertData {
  name?: string;
  code?: string;
  pointsMin?: number;
  pointsMax?: number;
  discountRate?: number;
  sortOrder?: number;
  status?: number;
  remark?: string;
}

/** 积分规则行 */
export interface PointsRuleRow {
  id: number;
  name: string;
  code: string;
  points: number;
  points_per_amount: string | number;
  enabled: number;
  sort_order: number;
  remark: string;
  create_time: Date | string;
  update_time: Date | string;
}

/** 创建/更新积分规则入参 */
export interface PointsRuleUpsertData {
  name?: string;
  code?: string;
  points?: number;
  pointsPerAmount?: number;
  enabled?: number;
  sortOrder?: number;
  remark?: string;
}

/** 积分变动记录行（join member） */
export interface PointsRecordRow {
  id: number;
  member_id: number;
  member_name: string;
  member_no: string;
  change_points: number;
  balance_points: number;
  biz_type: string;
  source_id: string;
  remark: string;
  operator: string;
  create_time: Date | string;
}

/** 消费记录行（join member） */
export interface ConsumeRow {
  id: number;
  order_no: string;
  member_id: number;
  member_name: string;
  member_no: string;
  consume_type: string;
  amount: string | number;
  points_gained: number;
  pay_time: Date | string;
  status: number;
  operator: string;
  remark: string;
  create_time: Date | string;
}

/** 创建消费记录入参 */
export interface ConsumeCreateData {
  orderNo?: string;
  memberId: number;
  consumeType?: string;
  amount: number;
  payTime?: string;
  remark?: string;
}

/** 人工调整积分入参 */
export interface PointsAdjustData {
  memberId: number;
  changePoints: number;
  remark?: string;
}

/** 统计总览 */
export interface MemberStatsOverview {
  memberCount: number;
  activeCount: number;
  totalConsume: number;
  monthConsume: number;
  totalPoints: number;
  levelDistribution: { levelId: number; levelName: string; count: number }[];
  typeDistribution: { consumeType: string; count: number; amount: number }[];
}

/** 消费趋势统计 */
export interface ConsumeTrendItem {
  month: string;
  amount: number;
  count: number;
}
