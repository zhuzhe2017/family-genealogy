import { type DataRow, type QueryValues, type PaginationResult, type IdResult, type SuccessResult } from '../../common/types/common';

/** 姓氏表记录 */
export interface SurnameRow extends DataRow {
  id: number;
  surname: string;
  pinyin: string;
  initial: string;
  ranking: number;
  totem: string;
  origin: string;
  population: number;
  description: string | null;
  status: number;
  create_time: string;
  update_time: string;
  create_by?: string;
}

/** 姓氏创建数据 */
export interface SurnameCreateData {
  surname: string;
  pinyin?: string;
  initial?: string;
  ranking?: number;
  totem?: string;
  origin?: string;
  population?: number;
  description?: string;
  createBy?: string;
}

/** 姓氏更新数据 */
export interface SurnameUpdateData {
  surname?: string;
  pinyin?: string;
  initial?: string;
  ranking?: number;
  totem?: string;
  origin?: string;
  population?: number;
  description?: string;
  status?: number;
}

/** 姓氏列表查询参数 */
export interface SurnameQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  initial?: string;
  status?: number;
}

/** 姓氏全部查询参数 */
export interface SurnameAllQueryParams {
  keyword?: string;
  initial?: string;
  status?: number;
}

export type { DataRow, QueryValues, PaginationResult, IdResult, SuccessResult };
