import { request } from '../../request';

/** 家族管理员可切换的家族列表 */
export function fetchTenantFamilies() {
  return request<Api.Tenant.TenantFamilyItem[]>({ url: '/tenant/families' });
}

/** 家族概览 */
export function fetchTenantFamilyOverview(familyId: number) {
  return request<Api.Tenant.FamilyOverview>({ url: `/tenant/family/${familyId}/overview` });
}

/** 家族设置 */
export function fetchTenantFamilySettings(familyId: number) {
  return request<Api.Tenant.FamilySettings>({ url: `/tenant/family/${familyId}/settings` });
}

// ---------- 成员管理 ----------

/** 成员列表 */
export function fetchTenantMembers(familyId: number, params: Api.Tenant.MemberQueryParams) {
  return request<Api.Tenant.MemberListResult>({ url: `/tenant/family/${familyId}/members`, params });
}

/** 成员详情 */
export function fetchTenantMemberDetail(familyId: number, id: string) {
  return request<Api.Tenant.MemberDetail>({ url: `/tenant/family/${familyId}/members/${id}` });
}

/** 创建成员 */
export function createTenantMember(familyId: number, data: Api.Tenant.MemberCreateData) {
  return request<Api.Common.IdResult>({ url: `/tenant/family/${familyId}/members`, method: 'POST', data });
}

/** 更新成员 */
export function updateTenantMember(familyId: number, id: string, data: Api.Tenant.MemberUpdateData) {
  return request<Api.Common.IdResult>({ url: `/tenant/family/${familyId}/members/${id}`, method: 'PUT', data });
}

/** 删除成员 */
export function deleteTenantMember(familyId: number, id: string) {
  return request<Api.Common.SuccessResult>({ url: `/tenant/family/${familyId}/members/${id}`, method: 'DELETE' });
}

/** 切换在世状态 */
export function toggleTenantMemberAlive(familyId: number, id: string) {
  return request<Api.Tenant.MemberDetail>({ url: `/tenant/family/${familyId}/members/${id}/toggle-alive`, method: 'POST' });
}

/** 父亲候选 */
export function fetchTenantFatherCandidates(familyId: number, params: Api.Tenant.FatherCandidateQuery) {
  return request<Api.Tenant.FatherCandidateResult>({ url: `/tenant/family/${familyId}/father-candidates`, params });
}

/** 父亲配偶候选 */
export function fetchTenantFatherSpouses(familyId: number, fatherId: string) {
  return request<Api.Tenant.FatherSpouse[]>({ url: `/tenant/family/${familyId}/father-spouses/${fatherId}` });
}

// ---------- 内容管理 ----------

export type ContentType = 'photo' | 'document' | 'event';

/** 内容列表 */
export function fetchTenantContents(familyId: number, type: ContentType, params: Api.Tenant.ContentQueryParams) {
  return request<Api.Tenant.ContentListResult>({ url: `/tenant/family/${familyId}/content/${type}`, params });
}

/** 内容详情 */
export function fetchTenantContentDetail(familyId: number, type: ContentType, id: string) {
  return request<Api.Tenant.ContentDetail>({ url: `/tenant/family/${familyId}/content/${type}/${id}` });
}

/** 创建内容 */
export function createTenantContent(familyId: number, type: ContentType, data: Record<string, unknown>) {
  return request<Api.Common.IdResult>({ url: `/tenant/family/${familyId}/content/${type}`, method: 'POST', data });
}

/** 更新内容 */
export function updateTenantContent(familyId: number, type: ContentType, id: string, data: Record<string, unknown>) {
  return request<Api.Common.IdResult>({ url: `/tenant/family/${familyId}/content/${type}/${id}`, method: 'PUT', data });
}

/** 删除内容 */
export function deleteTenantContent(familyId: number, type: ContentType, id: string) {
  return request<Api.Common.SuccessResult>({ url: `/tenant/family/${familyId}/content/${type}/${id}`, method: 'DELETE' });
}

// ---------- 权限管理 ----------

export interface TenantPermissionItem {
  userId: string;
  nickname: string;
  avatarUrl: string;
  memberId: string;
  role: 'creator' | 'admin' | 'member';
  status: number;
  isCreator: boolean;
}

export interface TenantPermissionResult {
  familyId: number;
  familyName: string;
  creatorUserId: string;
  canManage: boolean;
  list: TenantPermissionItem[];
  total: number;
}

/** 获取家族管理员权限列表 */
export function fetchTenantPermissions(familyId: number) {
  return request<TenantPermissionResult>({ url: `/tenant/family/${familyId}/permissions` });
}

/** 设置家族成员角色 */
export function setTenantPermissionRole(familyId: number, targetUserId: string, role: 'admin' | 'member') {
  return request<Api.Common.SuccessResult>({
    url: `/tenant/family/${familyId}/permissions/${targetUserId}/role`,
    method: 'PUT',
    data: { role }
  });
}

/** 移除家族管理员权限 */
export function removeTenantPermission(familyId: number, targetUserId: string) {
  return request<Api.Common.SuccessResult>({
    url: `/tenant/family/${familyId}/permissions/${targetUserId}`,
    method: 'DELETE'
  });
}

