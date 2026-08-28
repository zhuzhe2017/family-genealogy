import axios from 'axios';
import { request } from '../request';
import { getServiceBaseURL } from '@/utils/service';
import { getAuthorization } from '../request/shared';

/** 会员信息项 */
export interface MemberItem {
  id: number;
  memberNo: string;
  name: string;
  phone: string;
  gender: number;
  birthday: string | null;
  levelId: number;
  levelName: string;
  points: number;
  totalConsume: number;
  consumeCount: number;
  status: number;
  remark: string;
  createTime: string;
  updateTime: string;
}

/** 会员详情（含消费概览） */
export interface MemberDetail extends MemberItem {
  consumeStats: {
    count: number;
    amount: number;
    lastPayTime: string | null;
  };
}

/** 会员分页结果 */
export interface MemberListResult {
  list: MemberItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 创建/更新会员入参 */
export interface MemberUpsertData {
  name?: string;
  phone?: string | null;
  gender?: number;
  birthday?: string | null;
  levelId?: number;
  points?: number;
  status?: number;
  remark?: string;
}

/** 会员等级项 */
export interface LevelItem {
  id: number;
  name: string;
  code: string;
  pointsMin: number;
  pointsMax: number;
  discountRate: number;
  sortOrder: number;
  status: number;
  remark: string;
  createTime: string;
  updateTime: string;
}

/** 等级列表结果 */
export interface LevelListResult {
  list: LevelItem[];
  total: number;
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

/** 积分规则项 */
export interface PointsRuleItem {
  id: number;
  name: string;
  code: string;
  points: number;
  pointsPerAmount: number;
  enabled: number;
  sortOrder: number;
  remark: string;
  createTime: string;
  updateTime: string;
}

/** 积分规则列表结果 */
export interface PointsRuleListResult {
  list: PointsRuleItem[];
  total: number;
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

/** 积分变动记录项 */
export interface PointsRecordItem {
  id: number;
  memberId: number;
  memberName: string;
  memberNo: string;
  changePoints: number;
  balancePoints: number;
  bizType: string;
  sourceId: string;
  remark: string;
  operator: string;
  createTime: string;
}

/** 积分记录分页结果 */
export interface PointsRecordListResult {
  list: PointsRecordItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 消费记录项 */
export interface ConsumeItem {
  id: number;
  orderNo: string;
  memberId: number;
  memberName: string;
  memberNo: string;
  consumeType: string;
  amount: number;
  pointsGained: number;
  payTime: string;
  status: number;
  operator: string;
  remark: string;
  createTime: string;
}

/** 消费记录分页结果 */
export interface ConsumeListResult {
  list: ConsumeItem[];
  total: number;
  page: number;
  pageSize: number;
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

/** 消费趋势项 */
export interface ConsumeTrendItem {
  month: string;
  amount: number;
  count: number;
}

// ==================== 会员信息 ====================

/** 会员分页列表 */
export function fetchAdminMemberList(params: { page: number; pageSize: number; keyword?: string; levelId?: number; status?: number }) {
  return request<MemberListResult>({ url: '/member/members/list', params });
}

/** 会员详情 */
export function fetchAdminMemberDetail(id: number) {
  return request<MemberDetail>({ url: `/member/members/${id}` });
}

/** 创建会员 */
export function fetchAdminMemberCreate(data: MemberUpsertData) {
  return request<{ id: number; memberNo: string }>({ url: '/member/members/create', method: 'post', data });
}

/** 更新会员 */
export function fetchAdminMemberUpdate(id: number, data: MemberUpsertData) {
  return request<{ success: boolean }>({ url: `/member/members/update/${id}`, method: 'put', data });
}

/** 删除会员 */
export function fetchAdminMemberDelete(id: number) {
  return request<{ success: boolean }>({ url: `/member/members/delete/${id}`, method: 'delete' });
}

// ==================== 会员等级 ====================

/** 等级列表 */
export function fetchLevelList() {
  return request<LevelListResult>({ url: '/member/levels/list' });
}

/** 新增等级 */
export function fetchCreateLevel(data: LevelUpsertData) {
  return request<{ success: boolean }>({ url: '/member/levels/create', method: 'post', data });
}

/** 更新等级 */
export function fetchUpdateLevel(id: number, data: LevelUpsertData) {
  return request<{ success: boolean }>({ url: `/member/levels/update/${id}`, method: 'put', data });
}

/** 删除等级 */
export function fetchDeleteLevel(id: number) {
  return request<{ success: boolean }>({ url: `/member/levels/delete/${id}`, method: 'delete' });
}

// ==================== 积分规则 ====================

/** 积分规则列表 */
export function fetchPointsRuleList() {
  return request<PointsRuleListResult>({ url: '/member/points-rules/list' });
}

/** 新增积分规则 */
export function fetchCreatePointsRule(data: PointsRuleUpsertData) {
  return request<{ success: boolean }>({ url: '/member/points-rules/create', method: 'post', data });
}

/** 更新积分规则 */
export function fetchUpdatePointsRule(id: number, data: PointsRuleUpsertData) {
  return request<{ success: boolean }>({ url: `/member/points-rules/update/${id}`, method: 'put', data });
}

/** 删除积分规则 */
export function fetchDeletePointsRule(id: number) {
  return request<{ success: boolean }>({ url: `/member/points-rules/delete/${id}`, method: 'delete' });
}

// ==================== 积分变动记录 ====================

/** 积分变动记录分页列表 */
export function fetchPointsRecordList(params: { page: number; pageSize: number; memberId?: number; bizType?: string; keyword?: string }) {
  return request<PointsRecordListResult>({ url: '/member/points-records/list', params });
}

/** 人工调整积分 */
export function fetchAdjustPoints(data: { memberId: number; changePoints: number; remark?: string }) {
  return request<{ success: boolean; balancePoints: number }>({ url: '/member/points/adjust', method: 'post', data });
}

// ==================== 消费记录 ====================

/** 消费记录分页列表 */
export function fetchConsumeList(params: {
  page: number;
  pageSize: number;
  memberId?: number;
  consumeType?: string;
  status?: number;
  keyword?: string;
  startTime?: string;
  endTime?: string;
}) {
  return request<ConsumeListResult>({ url: '/member/consume/list', params });
}

/** 新增消费记录 */
export function fetchCreateConsume(data: ConsumeCreateData) {
  return request<{ success: boolean; orderNo: string; pointsGained: number }>({ url: '/member/consume/create', method: 'post', data });
}

/** 作废消费记录 */
export function fetchDeleteConsume(id: number) {
  return request<{ success: boolean }>({ url: `/member/consume/delete/${id}`, method: 'delete' });
}

// ==================== 统计 ====================

/** 统计总览 */
export function fetchMemberStatsOverview() {
  return request<MemberStatsOverview>({ url: '/member/stats/overview' });
}

/** 消费趋势（近 N 个月） */
export function fetchConsumeTrend(months = 6) {
  return request<ConsumeTrendItem[]>({ url: '/member/stats/trend', params: { months } });
}

// ==================== Excel 导出 ====================

/** 导出会员信息 Excel（直接下载 blob） */
export async function fetchMemberExport(params?: { keyword?: string; levelId?: number; status?: number }) {
  const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === 'Y';
  const { baseURL } = getServiceBaseURL(import.meta.env, isHttpProxy);

  const res = await axios.get<Blob>(`${baseURL}/member/export/members`, {
    params,
    responseType: 'blob',
    headers: { Authorization: getAuthorization() }
  });
  return res.data;
}

/** 导出消费记录 Excel（直接下载 blob） */
export async function fetchConsumeExport(params?: {
  memberId?: number;
  consumeType?: string;
  status?: number;
  keyword?: string;
  startTime?: string;
  endTime?: string;
}) {
  const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === 'Y';
  const { baseURL } = getServiceBaseURL(import.meta.env, isHttpProxy);

  const res = await axios.get<Blob>(`${baseURL}/member/export/consume`, {
    params,
    responseType: 'blob',
    headers: { Authorization: getAuthorization() }
  });
  return res.data;
}
