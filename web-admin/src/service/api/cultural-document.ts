import { request } from '../request';

/** 文档类型常量 */
export type DocumentType = 'genealogy' | 'ancient' | 'handwritten';

/** 文档状态 */
export type DocumentStatus = 0 | 1;
export type DocAuditStatus = 0 | 1 | 2;

/** 文化文档列表项（snake_case，后端原样返回） */
export interface CulturalDocItem {
  id: string;
  family_id: number | null;
  type: DocumentType;
  title: string;
  subtitle: string;
  author: string;
  dynasty: string;
  cover_url: string;
  summary: string | null;
  tag_json: string | string[] | null;
  view_count: number;
  sort_order: number;
  status: DocumentStatus;
  audit_status: DocAuditStatus;
  create_by: string;
  create_time: string;
  update_time: string;
}

/** 创建文档请求（camelCase） */
export interface CreateCulturalDocData {
  /** genealogy=家族谱 ancient=公共古籍 handwritten=手写稿 */
  type: DocumentType;
  title: string;
  subtitle?: string;
  author?: string;
  dynasty?: string;
  coverUrl?: string;
  originalText?: string;
  annotatedText?: string;
  translatedText?: string;
  summary?: string;
  tags?: string[];
  sortOrder?: number;
}

/** 更新文档请求（全部可选） */
export interface UpdateCulturalDocData {
  title?: string;
  subtitle?: string;
  type?: DocumentType;
  author?: string;
  dynasty?: string;
  coverUrl?: string;
  originalText?: string;
  annotatedText?: string;
  translatedText?: string;
  summary?: string;
  tags?: string[];
  sortOrder?: number;
  status?: DocumentStatus;
  auditStatus?: DocAuditStatus;
}

/** 原页图片项 */
export interface DocPageItem {
  page_no: number;
  image_url: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  ocr_text?: string;
}

/** 章节树节点 */
export interface ChapterTreeNode {
  id: number;
  parentId: number;
  title: string;
  pageStart: number;
  pageEnd: number;
  sortOrder: number;
  children: ChapterTreeNode[];
}

/** 分页返回通用结构 */
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

// =================================================================
// API 函数
// =================================================================

/** 查询参数（家族私有 + 公共古籍管理通用） */
interface ListParams {
  page: number;
  pageSize: number;
  type?: DocumentType;
  keyword?: string;
  dynasty?: string;
}

/** 家族文档列表 */
export function fetchCulturalDocList(familyId: number, params: ListParams) {
  return request<PageResult<CulturalDocItem>>({
    url: `/cultural-doc/${familyId}/list`,
    params
  });
}

/** 公共古籍列表（公开端点，管理端可直接访问） */
export function fetchPublicDocList(params: ListParams) {
  return request<PageResult<CulturalDocItem>>({
    url: '/cultural-doc/public/list',
    params
  });
}

/** 家族文档详情 */
export function fetchCulturalDocById(familyId: number, id: string) {
  return request<CulturalDocItem>({ url: `/cultural-doc/${familyId}/${id}` });
}

/** 公共古籍详情 */
export function fetchPublicDocById(id: string) {
  return request<CulturalDocItem>({ url: `/cultural-doc/public/${id}` });
}

/** 家族文档章节树 */
export function fetchCulturalDocChapters(familyId: number, id: string) {
  return request<ChapterTreeNode[]>({ url: `/cultural-doc/${familyId}/${id}/chapters` });
}

/** 公共古籍章节树 */
export function fetchPublicDocChapters(id: string) {
  return request<ChapterTreeNode[]>({ url: `/cultural-doc/public/${id}/chapters` });
}

/** 家族文档原页图片 */
export function fetchCulturalDocPages(familyId: number, id: string) {
  return request<DocPageItem[]>({ url: `/cultural-doc/${familyId}/${id}/pages` });
}

/** 公共古籍原页图片 */
export function fetchPublicDocPages(id: string) {
  return request<DocPageItem[]>({ url: `/cultural-doc/public/${id}/pages` });
}

/** 创建家族文档 */
export function fetchCreateCulturalDoc(familyId: number, data: CreateCulturalDocData) {
  return request<{ id: string }>({
    url: `/cultural-doc/${familyId}/create`,
    method: 'post',
    data
  });
}

/** 创建公共古籍 */
export function fetchCreatePublicDoc(data: CreateCulturalDocData) {
  return request<{ id: string }>({
    url: '/cultural-doc/admin/public/create',
    method: 'post',
    data
  });
}

/** 更新家族文档 */
export function fetchUpdateCulturalDoc(familyId: number, id: string, data: UpdateCulturalDocData) {
  return request<{ success: boolean }>({
    url: `/cultural-doc/${familyId}/update/${id}`,
    method: 'put',
    data
  });
}

/** 更新公共古籍 */
export function fetchUpdatePublicDoc(id: string, data: UpdateCulturalDocData) {
  return request<{ success: boolean }>({
    url: `/cultural-doc/admin/public/update/${id}`,
    method: 'put',
    data
  });
}

/** 删除家族文档 */
export function fetchDeleteCulturalDoc(familyId: number, id: string) {
  return request<{ success: boolean }>({
    url: `/cultural-doc/${familyId}/delete/${id}`,
    method: 'delete'
  });
}

/** 删除公共古籍 */
export function fetchDeletePublicDoc(id: string) {
  return request<{ success: boolean }>({
    url: `/cultural-doc/admin/public/delete/${id}`,
    method: 'delete'
  });
}

/** 上传/覆盖原页图片（家族） */
export function fetchUploadCulturalDocPages(familyId: number, id: string, pages: DocPageItem[]) {
  return request<{ count: number }>({
    url: `/cultural-doc/${familyId}/${id}/pages`,
    method: 'post',
    data: { pages }
  });
}

/** 上传/覆盖原页图片（公共古籍） */
export function fetchUploadPublicDocPages(id: string, pages: DocPageItem[]) {
  return request<{ count: number }>({
    url: `/cultural-doc/admin/public/${id}/pages`,
    method: 'post',
    data: { pages }
  });
}

/** 文档类型选项 */
export const DOCUMENT_TYPE_OPTIONS: { label: string; value: DocumentType }[] = [
  { label: '家族谱', value: 'genealogy' },
  { label: '公共古籍', value: 'ancient' },
  { label: '手写稿', value: 'handwritten' }
];
