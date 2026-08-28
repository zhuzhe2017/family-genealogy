import { type PaginationResult, type DataRow, type QueryValues } from '../../common/types/common';

/** 家族权限记录 */
export interface FamilyPermissionRow extends DataRow {
  id: number;
  family_id: number;
  user_id: string;
  member_name: string;
  role: string;
  status: number;
  create_time: string;
  update_time: string;
}

/** 租户管理员可切换的家族（已拥有管理权限的家族） */
export interface TenantFamilyItem {
  familyId: number;
  name: string;
  logo: string;
  role: 'admin' | 'creator' | 'member';
  status: number;
}

/** 租户侧成员列表查询参数 */
export interface TenantMemberQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  generation?: number;
  gender?: string;
  sort?: string;
}

/** 租户侧成员列表结果 */
export type TenantMemberListResult = PaginationResult<DataRow>;

export type { DataRow, QueryValues, PaginationResult };
