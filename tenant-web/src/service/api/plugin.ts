import { request } from '../request';

/** 应用插件项（管理视图） */
export interface AdminPluginItem {
  id: number;
  code: string;
  name: string;
  icon: string;
  description: string;
  entryType: 'page' | 'url';
  entryValue: string;
  sortOrder: number;
  status: number;
  creatorUserId: string;
  createTime: string;
  updateTime: string;
}

/** 应用插件分页结果 */
export interface AdminPluginListResult {
  list: AdminPluginItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 新增/编辑入参 */
export interface AdminPluginPayload {
  code: string;
  name: string;
  icon: string;
  description?: string;
  entryType: 'page' | 'url';
  entryValue: string;
  sortOrder?: number;
  status?: number;
}

/** 应用插件分页列表 */
export function fetchAdminPluginList(params: {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: number;
}) {
  return request<AdminPluginListResult>({ url: '/plugin/list', params });
}

/** 新增应用插件 */
export function fetchCreateAdminPlugin(data: AdminPluginPayload) {
  return request<{ success: boolean }>({ url: '/plugin', method: 'post', data });
}

/** 编辑应用插件 */
export function fetchUpdateAdminPlugin(id: number, data: AdminPluginPayload) {
  return request<{ success: boolean }>({ url: `/plugin/${id}`, method: 'put', data });
}

/** 删除应用插件 */
export function fetchDeleteAdminPlugin(id: number) {
  return request<{ success: boolean }>({ url: `/plugin/${id}`, method: 'delete' });
}
