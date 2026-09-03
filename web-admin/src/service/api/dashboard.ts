import { request } from '../request';

export interface SurnameStat {
  surname: string;
  ranking: number;
  familyCount: number;
  memberCount: number;
}

export interface DashboardStats {
  /** 总用户数 */
  totalUsers: number;
  /** 今日新增用户 */
  todayNewUsers: number;
  /** 家族总数 */
  totalFamilies: number;
  /** 今日新增家族数 */
  todayNewFamilies: number;
  /** 待审核内容总数 */
  pendingAuditContents: number;
  /** 付费家族数 */
  paidFamilies: number;
  /** 成员总数（跨所有家族分表） */
  totalMembers: number;
  /** 内容统计 */
  content: {
    /** 动态总数 */
    dynamics: number;
    /** 相册总数 */
    photos: number;
    /** 文档总数 */
    documents: number;
    /** 事件总数 */
    events: number;
  };
  /** 姓氏统计 */
  surnames: SurnameStat[];
}

/** 订阅增长趋势点 */
export interface SubscriptionGrowthPoint {
  date: string;
  newSubscriptions: number;
  totalSubscriptions: number;
}

/** 收入趋势点 */
export interface RevenuePoint {
  date: string;
  amount: number;
}

/** 转化率趋势点 */
export interface ConversionPoint {
  date: string;
  familyCount: number;
  paidCount: number;
  conversionRate: number;
}

/** 关键业务指标 */
export interface SubscriptionKpis {
  /** 区间总收入（元） */
  totalRevenue: number;
  /** 区间付费订单数 */
  totalOrders: number;
  /** 区间累计付费家族数 */
  totalPaidFamilies: number;
  /** 区间整体转化率（%） */
  conversionRate: number;
}

/** 订阅/商业化统计 */
export interface SubscriptionStats {
  subscriptionGrowth: SubscriptionGrowthPoint[];
  revenue: RevenuePoint[];
  conversion: ConversionPoint[];
  kpis: SubscriptionKpis;
}

/** 获取系统仪表盘统计数据 */
export function fetchDashboardStats() {
  return request<DashboardStats>({ url: '/dashboard/stats' });
}

/** 获取订阅与商业化统计数据 */
export function fetchDashboardSubscriptionStats(params: { startDate: string; endDate: string }) {
  return request<SubscriptionStats>({
    url: '/dashboard/subscription-stats',
    params
  });
}
