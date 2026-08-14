import { type DataRow, type QueryValues, type IdResult, type SuccessResult } from '../../common/types/common';

/** 菜单记录 */
export interface MenuRow extends DataRow {
  id: number;
  parent_id: number;
  name: string;
  type: string;
  path: string;
  component: string;
  route_name: string;
  icon: string;
  permission: string;
  sort_order: number;
  status: number;
  visible: number;
  keep_alive: number;
  operator: string;
  create_time: string;
  update_time: string;
  parentName?: string;
}

/** 菜单创建数据 */
export interface MenuCreateData {
  parentId: number;
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

/** 菜单更新数据 */
export interface MenuUpdateData {
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

/** elegant-router 路由节点 */
export interface ElegantRoute {
  id: string;
  name: string;
  path: string;
  component?: string;
  children?: ElegantRoute[];
  meta: {
    title: string;
    order: number;
    hideInMenu: boolean;
    keepAlive: boolean;
    icon?: string;
    permissions?: string[];
  };
}

/** 排序项 */
export interface MenuSortItem {
  id: number;
  sortOrder: number;
}

export type { DataRow, QueryValues, IdResult, SuccessResult };
