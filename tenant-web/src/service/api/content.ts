import { request } from '../request';

/** 内容类型 */
export type ContentType = 'dynamic' | 'photo' | 'document' | 'event';

/** 审核状态 0-待审核 1-已通过 2-已下架 */
export type AuditStatus = 0 | 1 | 2;

export interface ContentListItem {
  id: string;
  family_id: number;
  status: number;
  audit_status: number;
  create_time: string;
  update_time: string;
  // 动态
  content?: string;
  user_name?: string;
  user_id?: string;
  like_count?: number;
  comment_count?: number;
  // 照片
  url?: string;
  title?: string;
  description?: string;
  year?: string;
  uploader_name?: string;
  category_id?: string;
  // 文档
  name?: string;
  volume?: string;
  page_count?: number;
  file_url?: string;
  cover_url?: string;
  // 事件
  type?: string;
  type_name?: string;
  month?: number;
  day?: number;
}

export interface ContentListParams {
  page?: number;
  pageSize?: number;
  familyId?: number;
  auditStatus?: number;
  keyword?: string;
}

export interface ContentListResult {
  list: ContentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 内容列表 */
export function fetchContentList(type: ContentType, params: ContentListParams) {
  return request<ContentListResult>({ url: `/content/${type}/list`, params });
}

/** 审核 */
export function fetchContentAudit(type: ContentType, id: string, auditStatus: AuditStatus) {
  return request<{ id: string; auditStatus: number }>({
    url: `/content/${type}/audit/${id}`,
    method: 'post',
    data: { auditStatus }
  });
}

/** 下架/上架切换 */
export function fetchContentToggle(type: ContentType, id: string) {
  return request<{ id: string; auditStatus: number }>({
    url: `/content/${type}/toggle/${id}`,
    method: 'post'
  });
}

/** 删除（软删除） */
export function fetchContentDelete(type: ContentType, id: string) {
  return request<{ success: boolean }>({
    url: `/content/${type}/${id}`,
    method: 'delete'
  });
}
