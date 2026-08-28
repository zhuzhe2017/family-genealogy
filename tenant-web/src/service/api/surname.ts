import { request } from '../request';

export interface SysSurname {
  id: number;
  surname: string;
  pinyin: string;
  initial: string;
  ranking: number;
  totem: string;
  origin: string;
  population: number;
  description: string;
  status: number;
  createBy: string;
  createTime: string;
  updateTime: string;
}

export interface SurnameListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  initial?: string;
  status?: number;
}

export interface SurnameListResult {
  list: SysSurname[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateSurnameData {
  surname: string;
  pinyin?: string;
  initial?: string;
  ranking?: number;
  totem?: string;
  origin?: string;
  population?: number;
  description?: string;
}

export interface BatchImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  total: number;
}

/** 分页列表 */
export function fetchSurnameList(params: SurnameListParams) {
  return request<SurnameListResult>({ url: '/surname/list', params });
}

/** 获取全部（不分页，用于导出） */
export function fetchAllSurnames(params?: { keyword?: string; initial?: string; status?: number }) {
  return request<SysSurname[]>({ url: '/surname/all', params });
}

/** 获取单条 */
export function fetchSurnameById(id: number) {
  return request<SysSurname>({ url: `/surname/${id}` });
}

/** 创建 */
export function fetchCreateSurname(data: CreateSurnameData) {
  return request<{ id: number }>({ url: '/surname/create', method: 'post', data });
}

/** 更新 */
export function fetchUpdateSurname(id: number, data: Partial<CreateSurnameData & { status: number }>) {
  return request<{ success: boolean }>({ url: `/surname/update/${id}`, method: 'put', data });
}

/** 删除 */
export function fetchDeleteSurname(id: number) {
  return request<{ success: boolean }>({ url: `/surname/delete/${id}`, method: 'delete' });
}

/** 批量导入 */
export function fetchBatchImportSurnames(items: CreateSurnameData[]) {
  return request<BatchImportResult>({ url: '/surname/batch-import', method: 'post', data: { items } });
}

/** 切换状态 */
export function fetchToggleSurnameStatus(id: number) {
  return request<{ id: number; status: number }>({ url: `/surname/toggle-status/${id}`, method: 'post' });
}
