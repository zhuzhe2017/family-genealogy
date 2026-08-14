import { type DataRow, type QueryValues, type IdResult, type SuccessResult } from '../../common/types/common';

/** 角色记录 */
export interface RoleRow extends DataRow {
  id: number;
  name: string;
  code: string;
  status: number;
  create_time: string;
  update_time: string;
  permissions?: PermissionRow[];
  permissionIds?: number[];
}

/** 权限记录 */
export interface PermissionRow extends DataRow {
  role_id?: number;
  id: number;
  name: string;
  code: string;
  status: number;
  create_time: string;
  update_time: string;
}

/** 角色创建数据 */
export interface RoleCreateData {
  name: string;
  code: string;
  status?: number;
}

/** 角色更新数据 */
export interface RoleUpdateData {
  name?: string;
  code?: string;
  status?: number;
}

/** 权限创建数据 */
export interface PermissionCreateData {
  name: string;
  code: string;
  status?: number;
}

/** 权限更新数据 */
export interface PermissionUpdateData {
  name?: string;
  code?: string;
  status?: number;
}

export type { DataRow, QueryValues, IdResult, SuccessResult };
