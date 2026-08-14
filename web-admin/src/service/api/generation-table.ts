import { request } from '../request';

/** 字辈表项（对应 generation_table 表行，DB 列名为 snake_case） */
export interface GenerationTableItem {
  id: string;
  surname: string;
  founder: string;
  generation_sequence: string[];
  common_regions: string[];
  create_by: string;
  status: number;
  create_time: string;
  update_time: string;
}

export interface GenerationTableListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  region?: string;
  status?: number;
}

export interface GenerationTableListResult {
  list: GenerationTableItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 创建参数（与后端 CreateGenerationTableDto 一致，使用 camelCase） */
export interface CreateGenerationTableData {
  surname: string;
  founder: string;
  generationSequence: string[];
  commonRegions: string[];
  createBy?: string;
}

/** 更新参数（partial，camelCase） */
export interface UpdateGenerationTableData {
  surname?: string;
  founder?: string;
  generationSequence?: string[];
  commonRegions?: string[];
  status?: number;
}

export interface GenerationTableBatchImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  total: number;
}

/** 分页列表 */
export function fetchGenerationTableList(params: GenerationTableListParams) {
  return request<GenerationTableListResult>({ url: '/generation-table/list', params });
}

/** 获取全部（不分页，用于导出） */
export function fetchAllGenerationTables(params?: { keyword?: string; region?: string; status?: number }) {
  return request<GenerationTableItem[]>({ url: '/generation-table/all', params });
}

/** 获取单条 */
export function fetchGenerationTableById(id: string) {
  return request<GenerationTableItem>({ url: `/generation-table/${id}` });
}

/** 创建 */
export function fetchCreateGenerationTable(data: CreateGenerationTableData) {
  return request<{ id: string }>({ url: '/generation-table/create', method: 'post', data });
}

/** 更新 */
export function fetchUpdateGenerationTable(id: string, data: UpdateGenerationTableData) {
  return request<{ success: boolean }>({ url: `/generation-table/update/${id}`, method: 'put', data });
}

/** 删除 */
export function fetchDeleteGenerationTable(id: string) {
  return request<{ success: boolean }>({ url: `/generation-table/delete/${id}`, method: 'delete' });
}

/** 批量导入 */
export function fetchBatchImportGenerationTables(items: CreateGenerationTableData[]) {
  return request<GenerationTableBatchImportResult>({ url: '/generation-table/batch-import', method: 'post', data: { items } });
}

/** 切换状态 */
export function fetchToggleGenerationTableStatus(id: string) {
  return request<{ id: string; status: number }>({ url: `/generation-table/toggle-status/${id}`, method: 'post' });
}
