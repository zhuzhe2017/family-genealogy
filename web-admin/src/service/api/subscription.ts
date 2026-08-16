import { request } from '../request';

/** 套餐项（管理视图） */
export interface AdminPlanItem {
  id: number;
  code: string;
  name: string;
  priceAnnual: number;
  capabilities: string[];
  storageLimit: number;
  quotaRules: Record<string, number>;
  sortOrder: number;
  status: number;
  createTime: string;
  updateTime: string;
}

/** 套餐分页结果 */
export interface AdminPlanListResult {
  list: AdminPlanItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 创建/更新套餐入参 */
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

/** 家族订阅项 */
export interface AdminFamilySubscriptionItem {
  familyId: number;
  familyName: string;
  planCode: string;
  planName: string;
  status: string;
  ownerUserId: string;
  ownerNickname: string;
  autoRenew: number;
  paidAt: string | null;
  expireAt: string | null;
  graceUntil: string | null;
  cancelReason: string;
  storageUsed: number;
  aiRestoreUsed: number;
  worshipProUsed: number;
  quotaPeriodEnd: string | null;
}

/** 家族订阅分页结果 */
export interface AdminFamilySubscriptionListResult {
  list: AdminFamilySubscriptionItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 订阅订单项 */
export interface AdminOrderItem {
  id: number;
  orderNo: string;
  outTradeNo: string;
  familyId: number;
  familyName: string;
  userId: string;
  userNickname: string;
  planCode: string;
  planName: string;
  amount: number;
  periodMonths: number;
  status: string;
  transactionId: string;
  payTime: string | null;
  refundTime: string | null;
  createTime: string;
}

/** 订单分页结果 */
export interface AdminOrderListResult {
  list: AdminOrderItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 套餐分页列表 */
export function fetchAdminPlanList(params: { page: number; pageSize: number; keyword?: string; status?: number }) {
  return request<AdminPlanListResult>({ url: '/subscription/plans/list', params });
}

/** 创建套餐 */
export function fetchCreateAdminPlan(data: PlanUpsertData) {
  return request<{ code: string }>({ url: '/subscription/plans/create', method: 'post', data });
}

/** 更新套餐 */
export function fetchUpdateAdminPlan(code: string, data: PlanUpsertData) {
  return request<{ success: boolean }>({ url: `/subscription/plans/update/${code}`, method: 'put', data });
}

/** 家族订阅分页列表 */
export function fetchAdminFamilySubscriptionList(params: {
  page: number;
  pageSize: number;
  keyword?: string;
  planCode?: string;
  status?: string;
}) {
  return request<AdminFamilySubscriptionListResult>({ url: '/subscription/families/list', params });
}

/** 后台开通/升级/续费家族订阅 */
export function fetchAdminActivateFamily(data: { familyId: number; planCode: string; months?: number; ownerUserId?: string }) {
  return request<{ success: boolean }>({ url: '/subscription/families/activate', method: 'post', data });
}

/** 后台冻结家族订阅 */
export function fetchAdminFreezeFamily(data: { familyId: number; reason?: string }) {
  return request<{ success: boolean }>({ url: '/subscription/families/freeze', method: 'post', data });
}

/** 订阅订单分页列表 */
export function fetchAdminOrderList(params: { page: number; pageSize: number; keyword?: string; status?: string; familyId?: number }) {
  return request<AdminOrderListResult>({ url: '/subscription/orders/list', params });
}
