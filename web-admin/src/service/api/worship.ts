import { request } from '../request';

/** 祭祀记录项（管理视图） */
export interface AdminWorshipRecordItem {
  id: number;
  familyId: number;
  familyName: string;
  userId: string;
  userName: string;
  type: 'incense' | 'pray' | 'offer' | 'wish';
  content: string;
  createTime: string;
}

/** 祭祀记录分页结果 */
export interface AdminWorshipRecordListResult {
  list: AdminWorshipRecordItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 纪念对象项（管理视图） */
export interface AdminWorshipMemorialItem {
  id: number;
  familyId: number;
  familyName: string;
  memberId: string;
  memberName: string;
  avatarUrl: string;
  epitaph: string;
  creatorUserId: string;
  createTime: string;
}

/** 纪念对象分页结果 */
export interface AdminWorshipMemorialListResult {
  list: AdminWorshipMemorialItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 祭祀记录分页列表 */
export function fetchAdminWorshipRecordList(params: {
  page: number;
  pageSize: number;
  familyId?: number;
  type?: string;
  keyword?: string;
}) {
  return request<AdminWorshipRecordListResult>({ url: '/worship/records/list', params });
}

/** 删除祭祀记录 */
export function fetchDeleteAdminWorshipRecord(id: number) {
  return request<{ success: boolean }>({ url: `/worship/records/${id}`, method: 'delete' });
}

/** 纪念对象分页列表 */
export function fetchAdminWorshipMemorialList(params: {
  page: number;
  pageSize: number;
  familyId?: number;
  keyword?: string;
}) {
  return request<AdminWorshipMemorialListResult>({ url: '/worship/memorials/list', params });
}

/** 删除纪念对象 */
export function fetchDeleteAdminWorshipMemorial(id: number) {
  return request<{ success: boolean }>({ url: `/worship/memorials/${id}`, method: 'delete' });
}
