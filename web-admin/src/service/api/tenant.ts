import { request } from '../request';

export interface TenantItem {
  id: number;
  surname_id: number;
  surname_name?: string;
  generation_table_id?: string;
  generation_table_surname?: string;
  generation_table_founder?: string;
  generation_sequence?: string[];
  name: string;
  logo: string;
  founder: string;
  hall_name?: string;
  origin: string;
  description: string;
  is_public: number;
  allow_join: number;
  member_count: number;
  gen_count: number;
  seed_share_code?: string;
  creator_id?: number;
  creator_user_id?: string;
  status: number;
  create_time: string;
  update_time: string;
  // 关联统计
  realMemberCount?: number;
  eventCount?: number;
  photoCount?: number;
  documentCount?: number;
  dynamicCount?: number;
  adminCount?: number;
}

export interface TenantListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: number;
  isPublic?: number;
}

export interface TenantListResult {
  list: TenantItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdateTenantData {
  name?: string;
  logo?: string;
  founder?: string;
  hallName?: string;
  origin?: string;
  description?: string;
  isPublic?: number;
  allowJoin?: number;
  status?: number;
}

/** 租户（家族）分页列表 */
export function fetchTenantList(params: TenantListParams) {
  return request<TenantListResult>({ url: '/family/list', params });
}

/** 租户详情 */
export function fetchTenantById(id: number) {
  return request<TenantItem>({ url: `/family/${id}` });
}

/** 更新租户 */
export function fetchUpdateTenant(id: number, data: UpdateTenantData) {
  return request<{ success: boolean }>({ url: `/family/update/${id}`, method: 'put', data });
}

/** 删除租户（软删除） */
export function fetchDeleteTenant(id: number) {
  return request<{ success: boolean }>({ url: `/family/delete/${id}`, method: 'delete' });
}

/** 切换公开状态 */
export function fetchToggleTenantPublic(id: number) {
  return request<{ id: number; isPublic: number }>({ url: `/family/toggle-public/${id}`, method: 'post' });
}

/** 恢复租户 */
export function fetchRestoreTenant(id: number) {
  return request<{ success: boolean }>({ url: `/family/restore/${id}`, method: 'post' });
}
