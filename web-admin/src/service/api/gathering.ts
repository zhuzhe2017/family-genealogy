import { request } from '../request';

/** 宗亲聚会（管理视图） */
export interface AdminGatheringItem {
  id: number;
  familyId: number;
  familyName: string;
  title: string;
  location: string;
  startTime: string | null;
  endTime: string | null;
  capacity: number;
  status: number;
  signedTotal: number;
  checkinTotal: number;
  organizerUserId: string;
  createTime: string;
}

/** 聚会分页结果 */
export interface AdminGatheringListResult {
  list: AdminGatheringItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 聚会场次 */
export interface AdminGatheringSession {
  id?: number;
  name: string;
  startTime?: string | null;
  endTime?: string | null;
  capacity: number;
  signedCount?: number;
}

/** 议程项 */
export interface AdminAgendaItem {
  time: string;
  item: string;
  remark?: string;
}

/** 新增/编辑入参 */
export interface AdminGatheringPayload {
  familyId: number;
  title: string;
  description?: string;
  coverImage?: string;
  location?: string;
  addressDetail?: string;
  startTime?: string | null;
  endTime?: string | null;
  signupDeadline?: string | null;
  agenda?: AdminAgendaItem[];
  capacity?: number;
  status?: number;
  sessions?: AdminGatheringSession[];
}

/** 报名名单项 */
export interface AdminRegistrationItem {
  id: number;
  sessionName: string;
  name: string;
  phone: string;
  dietType: string;
  dietLabel: string;
  dietNote: string;
  specialNeed: string;
  guestCount: number;
  status: number;
  checkinCode: string;
  checkinTime: string | null;
  checkinMethod: string;
  createTime: string;
}

/** 聚会详情 */
export interface AdminGatheringDetail extends AdminGatheringPayload {
  id: number;
  familyName: string;
  sessions: AdminGatheringSession[];
  createTime: string;
}

/** 参会统计 */
export interface AdminGatheringStats {
  gatheringId: number;
  capacity: number;
  total: number;
  checkedIn: number;
  cancelled: number;
  totalGuest: number;
  sessions: { name: string; count: number; checkedIn: number }[];
  diets: { type: string; label: string; count: number }[];
}

/** 聚会分页列表 */
export function fetchAdminGatheringList(params: {
  page: number;
  pageSize: number;
  keyword?: string;
  familyId?: number;
  status?: number;
}) {
  return request<AdminGatheringListResult>({ url: '/gathering/list', params });
}

/** 聚会详情 */
export function fetchAdminGatheringDetail(id: number) {
  return request<AdminGatheringDetail>({ url: `/gathering/${id}` });
}

/** 新增聚会 */
export function fetchCreateAdminGathering(data: AdminGatheringPayload) {
  return request<{ success: boolean; id: number }>({ url: '/gathering', method: 'post', data });
}

/** 编辑聚会 */
export function fetchUpdateAdminGathering(id: number, data: AdminGatheringPayload) {
  return request<{ success: boolean }>({ url: `/gathering/${id}`, method: 'put', data });
}

/** 状态流转 */
export function fetchUpdateAdminGatheringStatus(id: number, status: number) {
  return request<{ success: boolean }>({ url: `/gathering/${id}/status`, method: 'put', data: { status } });
}

/** 删除聚会 */
export function fetchDeleteAdminGathering(id: number) {
  return request<{ success: boolean }>({ url: `/gathering/${id}`, method: 'delete' });
}

/** 报名名单 */
export function fetchAdminGatheringRegistrations(
  id: number,
  params: { page: number; pageSize: number; status?: number; keyword?: string }
) {
  return request<{ list: AdminRegistrationItem[]; total: number; page: number; pageSize: number }>({
    url: `/gathering/${id}/registrations`,
    params
  });
}

/** 参会统计分析 */
export function fetchAdminGatheringStats(id: number) {
  return request<AdminGatheringStats>({ url: `/gathering/${id}/stats` });
}

/** 归档资料项 */
export interface AdminArchiveItem {
  id: number;
  gatheringId: number;
  title: string;
  fileUrl: string;
  fileType: string;
  description: string;
  createTime: string;
}

/** 归档资料列表 */
export function fetchAdminGatheringArchives(id: number) {
  return request<{ list: AdminArchiveItem[] }>({ url: `/gathering/${id}/archives` });
}

/** 新增归档资料 */
export function fetchCreateAdminGatheringArchive(id: number, data: { title: string; fileUrl?: string; fileType?: string; description?: string }) {
  return request<{ success: boolean; id: number }>({ url: `/gathering/${id}/archives`, method: 'post', data });
}

/** 删除归档资料 */
export function fetchDeleteAdminGatheringArchive(id: number, archiveId: number) {
  return request<{ success: boolean }>({ url: `/gathering/${id}/archives/${archiveId}`, method: 'delete' });
}
