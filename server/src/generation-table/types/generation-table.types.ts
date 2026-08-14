import { type DataRow } from '../../common/types/common';

/** 字辈表记录 */
export interface GenerationTableRow extends DataRow {
  id: string;
  surname: string;
  founder: string;
  generation_sequence: string | string[];
  common_regions: string | string[];
  create_by: string;
  status: number;
  create_time: string;
  update_time: string;
}

/** 字辈表业务数据 */
export interface GenerationTableData {
  surname?: string;
  founder?: string;
  generationSequence?: string[];
  commonRegions?: string[];
  createBy?: string;
  status?: number;
}

/** 字辈表列表查询参数 */
export interface GenerationTableQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  region?: string;
  status?: number;
}

/** 字辈表导出查询参数 */
export interface GenerationTableAllQueryParams {
  keyword?: string;
  region?: string;
  status?: number;
}

/** 字辈表导入结果 */
export interface BatchImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  total: number;
}

/** 字辈表控制器批量导入请求 */
export interface BatchImportBody {
  items: GenerationTableData[];
}
