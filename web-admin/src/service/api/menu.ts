import { request } from '../request';

export interface SysMenu {
  id: number;
  parentId: number;
  name: string;
  type: 'directory' | 'menu' | 'button';
  path: string;
  component: string;
  routeName: string;
  icon: string;
  permission: string;
  sortOrder: number;
  status: number;
  visible: number;
  keepAlive: number;
  operator?: string;
  createTime: string;
  parentName?: string;
  children?: SysMenu[];
}

export interface MenuListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: number;
  type?: string;
}

export interface MenuListResult {
  list: SysMenu[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateMenuData {
  parentId?: number | null;
  name: string;
  type: string;
  path?: string;
  component?: string;
  routeName?: string;
  icon?: string;
  permission?: string;
  sortOrder?: number;
  visible?: number;
  keepAlive?: number;
}

export interface UpdateMenuData {
  parentId?: number;
  name?: string;
  type?: string;
  path?: string;
  component?: string;
  routeName?: string;
  icon?: string;
  permission?: string;
  sortOrder?: number;
  status?: number;
  visible?: number;
  keepAlive?: number;
}

/** 获取菜单树 */
export function fetchMenuTree() {
  return request<SysMenu[]>({ url: '/menu/tree' });
}

/** 获取菜单列表（分页） */
export function fetchMenuList(params: MenuListParams) {
  return request<MenuListResult>({ url: '/menu/list', params });
}

/** 创建菜单 */
export function fetchCreateMenu(data: CreateMenuData) {
  return request<{ id: number }>({ url: '/menu/create', method: 'post', data });
}

/** 更新菜单 */
export function fetchUpdateMenu(id: number, data: UpdateMenuData) {
  return request<{ success: boolean }>({ url: `/menu/update/${id}`, method: 'put', data });
}

/** 删除菜单 */
export function fetchDeleteMenu(id: number) {
  return request<{ success: boolean }>({ url: `/menu/delete/${id}`, method: 'delete' });
}

/** 切换菜单状态 */
export function fetchToggleStatus(id: number) {
  return request<{ id: number; status: number }>({ url: `/menu/toggle-status/${id}`, method: 'post' });
}

/** 批量更新排序 */
export function fetchUpdateSort(list: { id: number; sortOrder: number }[]) {
  return request<{ success: boolean }>({ url: '/menu/update-sort', method: 'post', data: { list } });
}

/** 获取单条菜单 */
export function fetchMenuById(id: number) {
  return request<SysMenu>({ url: `/menu/${id}` });
}
