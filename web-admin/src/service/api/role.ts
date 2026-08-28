import { request } from '../request';

export interface RoleItem {
  id: number;
  name: string;
  code: string;
  status: number;
  createTime: string;
  updateTime: string;
  permissions?: PermissionItem[];
  permissionIds?: number[];
}

export interface PermissionItem {
  id: number;
  name: string;
  code: string;
  status: number;
  createTime: string;
  updateTime: string;
}

/** 获取角色列表 */
export function fetchRoleList() {
  return request<RoleItem[]>({ url: '/role/list' });
}

/** 获取角色详情 */
export function fetchRoleById(id: number) {
  return request<RoleItem>({ url: `/role/${id}` });
}

/** 创建角色 */
export function fetchCreateRole(data: { name: string; code: string; status?: number }) {
  return request<{ id: number }>({ url: '/role/create', method: 'post', data });
}

/** 更新角色 */
export function fetchUpdateRole(id: number, data: { name?: string; code?: string; status?: number }) {
  return request<{ success: boolean }>({ url: `/role/update/${id}`, method: 'put', data });
}

/** 删除角色 */
export function fetchDeleteRole(id: number) {
  return request<{ success: boolean }>({ url: `/role/delete/${id}`, method: 'delete' });
}

/** 为角色分配权限 */
export function fetchAssignPermissions(id: number, permissionIds: number[]) {
  return request<{ success: boolean }>({ url: `/role/assign-permissions/${id}`, method: 'post', data: { permissionIds } });
}

/** 获取角色已绑定权限ID列表 */
export function fetchRolePermissions(id: number) {
  return request<number[]>({ url: `/role/${id}/permissions` });
}

/** 获取权限列表 */
export function fetchPermissionList() {
  return request<PermissionItem[]>({ url: '/permission/list' });
}

/** 创建权限 */
export function fetchCreatePermission(data: { name: string; code: string; status?: number }) {
  return request<{ id: number }>({ url: '/permission/create', method: 'post', data });
}

/** 更新权限 */
export function fetchUpdatePermission(id: number, data: { name?: string; code?: string; status?: number }) {
  return request<{ success: boolean }>({ url: `/permission/update/${id}`, method: 'put', data });
}

/** 删除权限 */
export function fetchDeletePermission(id: number) {
  return request<{ success: boolean }>({ url: `/permission/delete/${id}`, method: 'delete' });
}

/** 获取管理员角色 */
export function fetchAdminRoles(adminId: number) {
  return request<RoleItem[]>({ url: `/admin-role/${adminId}` });
}

/** 为管理员分配角色 */
export function fetchAssignAdminRoles(adminId: number, roleIds: number[]) {
  return request<{ success: boolean }>({ url: `/admin-role/assign/${adminId}`, method: 'post', data: { roleIds } });
}
