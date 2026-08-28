import { request } from '../request';

export interface AdminItem {
  id: number;
  username: string;
  nickname: string;
  avatarUrl: string;
  phone: string;
  email: string;
  role: string;
  status: number;
  lastLoginTime: string;
  createTime: string;
}

export interface AdminListData {
  list: AdminItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminCreateData {
  username: string;
  password: string;
  nickname?: string;
  phone?: string;
  email?: string;
  role?: string;
}

export interface AdminUpdateData {
  nickname?: string;
  phone?: string;
  email?: string;
  role?: string;
  status?: number;
}

export interface FamilyOption {
  id: number;
  name: string;
  surnameId: number;
  memberCount: number;
  genCount: number;
}

/** 获取管理员列表 */
export function fetchAdminList(page = 1, pageSize = 10) {
  return request<AdminListData>({ url: '/admin/list', params: { page, pageSize } });
}

/** 创建管理员 */
export function fetchCreateAdmin(data: AdminCreateData) {
  return request<{ id: number }>({ url: '/admin/create', method: 'post', data });
}

/** 更新管理员 */
export function fetchUpdateAdmin(id: number, data: AdminUpdateData) {
  return request<{ success: boolean }>({ url: `/admin/update/${id}`, method: 'put', data });
}

/** 修改管理员密码 */
export function fetchUpdateAdminPassword(oldPassword: string, newPassword: string) {
  return request<{ success: boolean }>({
    url: '/admin/update-password',
    method: 'post',
    data: { oldPassword, newPassword }
  });
}

/** 获取管理员可管理的家族列表 */
export function fetchAdminFamilies() {
  return request<FamilyOption[]>({ url: '/admin/families' });
}

/** 绑定管理员到家族 */
export function fetchBindAdminFamily(id: number, familyIds: number[]) {
  return request<{ success: boolean }>({
    url: `/admin/bind-family/${id}`,
    method: 'post',
    data: { familyIds }
  });
}
