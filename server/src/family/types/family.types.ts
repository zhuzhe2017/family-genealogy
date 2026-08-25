import { type DataRow, type QueryValues, type PaginationResult, type IdResult, type SuccessResult } from '../../common/types/common';

/** 家族表记录 */
export interface FamilyRow extends DataRow {
  id: number;
  surname_id?: number;
  surname_name?: string;
  generation_table_id?: string;
  generation_table_surname?: string;
  generation_table_founder?: string;
  generation_sequence?: string | string[];
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
}

/** 家族列表查询参数 */
export interface FamilyQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: number;
  isPublic?: number;
}

/** 家族全部查询参数 */
export interface FamilyAllQueryParams {
  keyword?: string;
  status?: number;
}

/** 家族创建数据 */
export interface FamilyCreateData {
  surnameId?: number | null;
  generationTableId?: string | null;
  name: string;
  logo?: string;
  founder?: string;
  hallName?: string;
  origin?: string;
  description?: string;
  isPublic?: number;
  allowJoin?: number;
  creatorId?: number;
  /** 小程序用户创建者ID（32位hex），由服务端令牌注入，防客户端伪造 */
  creatorUserId?: string;
  /**
   * 家族种子分享码，创建时由服务端自动生成。
   * 用于创建者自身加入家族，也可作为家族专属邀请凭证。
   */
  seedShareCode?: string;
}

/** 家族更新数据 */
export interface FamilyUpdateData {
  surnameId?: number | null;
  generationTableId?: string | null;
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

export type { DataRow, QueryValues, PaginationResult, IdResult, SuccessResult };
