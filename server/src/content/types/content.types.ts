import { type DataRow, type QueryValues, type PaginationResult, type SuccessResult } from '../../common/types/common';

export type ContentType = 'dynamic' | 'photo' | 'document' | 'event';

/** 内容配置 */
export interface ContentConfig {
  table: string;
  fields: string[];
  searchFields: string[];
}

/** 内容记录 */
export interface ContentRow extends DataRow {
  id: string;
  family_id: number;
  audit_status: number;
  status: number;
  create_time: string;
  update_time: string;
}

/** 内容列表查询参数 */
export interface ContentQueryParams {
  page: number;
  pageSize: number;
  familyId?: number;
  auditStatus?: number;
  keyword?: string;
}

/** 事件扩展属性（family_event_detail 行） */
export interface EventDetailData {
  label: string;
  value: string;
}

/** 事件关联成员（family_event_member 行） */
export interface EventMemberData {
  id: string;
  name: string;
  gender?: string;
  relation?: string;
}

/** 文档章节（family_document_chapter 行） */
export interface DocumentChapterData {
  id: number;
  number: string;
  title: string;
  startPage?: number;
  endPage?: number;
  sortOrder?: number;
}

/** 内容创建/更新数据（dynamic/photo/event 三类公共可空字段合并） */
export interface ContentCreateData {
  familyId: number;
  /** dynamic 专用 */
  content?: string;
  images?: string[];
  userId?: string;
  userName?: string;
  userGender?: string;
  /** photo 专用 */
  url?: string;
  title?: string;
  description?: string;
  year?: string;
  categoryId?: string;
  uploaderId?: string;
  uploaderName?: string;
  /** document 专用 */
  name?: string;
  volume?: string;
  pageCount?: number;
  fileUrl?: string;
  coverUrl?: string;
  /** event 专用 */
  month?: number;
  day?: number;
  type?: string;
  typeName?: string;
  /** event 专用：发布者用户ID */
  creatorId?: string;
  /** event 关联数据（detail/member/photo） */
  details?: EventDetailData[];
  relatedMembers?: EventMemberData[];
  photos?: string[];
}

export type { DataRow, QueryValues, PaginationResult, SuccessResult };
