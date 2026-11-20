/**
 * 文化文档模块类型定义
 * 对应表：cultural_document / cultural_document_page / cultural_document_chapter
 */

/** 文档类型常量 */
export const DOCUMENT_TYPES = ['genealogy', 'ancient', 'handwritten'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** cultural_document 表行（snake_case） */
export interface CulturalDocumentRow {
  id: string;
  family_id: number | null;
  type: DocumentType;
  title: string;
  subtitle: string;
  author: string;
  dynasty: string;
  cover_url: string;
  original_text: string | null;
  annotated_text: string | null;
  translated_text: string | null;
  summary: string | null;
  tag_json: string | string[] | null;
  view_count: number;
  sort_order: number;
  status: number;
  audit_status: number;
  create_by: string;
  create_time: Date | string;
  update_time: Date | string;
}

/** cultural_document_page 表行 */
export interface CulturalDocumentPageRow {
  id: number;
  document_id: string;
  page_no: number;
  image_url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  ocr_text: string | null;
  create_time: Date | string;
}

/** cultural_document_chapter 表行 */
export interface CulturalDocumentChapterRow {
  id: number;
  document_id: string;
  parent_id: number;
  title: string;
  content: string | null;
  translated: string | null;
  page_start: number;
  page_end: number;
  sort_order: number;
  create_time: Date | string;
}

/** 创建文档参数（camelCase） */
export interface CulturalDocumentCreateData {
  /** 必需 */
  familyId?: number;           // NULL = 公共古籍
  type: DocumentType;
  title: string;
  /** 可选 */
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
  createBy?: string;
}

/** 更新文档参数（全部可选） */
export interface CulturalDocumentUpdateData {
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
  status?: number;
  auditStatus?: number;
}

/** 列表查询参数 */
export interface CulturalDocumentListParams {
  page: number;
  pageSize: number;
  type?: DocumentType;
  keyword?: string;
  dynasty?: string;
  /** true = 只查公共（family_id IS NULL） */
  publicOnly?: boolean;
  /** familyId 存在时只查该家族 */
  familyId?: number;
}

/** 公开章节树节点（嵌套结构） */
export interface ChapterTreeNode {
  id: number;
  parentId: number;
  title: string;
  pageStart: number;
  pageEnd: number;
  sortOrder: number;
  children: ChapterTreeNode[];
}

/** 原页图片上传参数 */
export interface PageUploadItem {
  pageNo: number;
  imageUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  ocrText?: string;
}
