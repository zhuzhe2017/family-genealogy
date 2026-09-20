import { type DataRow, type QueryValues } from '../../common/types/common';

/** 家谱成书模板类型 */
export type BookTemplate = 'european' | 'su_style' | 'modern' | 'classical';

/** 家谱成书记录（genealogy_book 表） */
export interface GenealogyBookRow extends DataRow {
  id: number;
  family_id: number;
  title: string;
  subtitle: string;
  template: BookTemplate;
  preface: string;
  introduction: string;
  clan_rules: string;
  generation_poem: string;
  appendix: string;
  cover_style: string;
  font_family: string;
  paper_size: string;
  include_generation_table: number;
  include_member_bio: number;
  include_tree_chart: number;
  include_index: number;
  sort_order: number;
  status: number;
  create_by: string;
  create_time: string;
  update_time: string;
}

/** 创建家谱成书数据 */
export interface GenealogyBookCreateData {
  familyId: number;
  title: string;
  subtitle?: string;
  template?: BookTemplate;
  preface?: string;
  introduction?: string;
  clanRules?: string;
  generationPoem?: string;
  appendix?: string;
  coverStyle?: string;
  fontFamily?: string;
  paperSize?: string;
  includeGenerationTable?: number;
  includeMemberBio?: number;
  includeTreeChart?: number;
  includeIndex?: number;
  sortOrder?: number;
  createBy?: string;
}

/** 更新家谱成书数据 */
export interface GenealogyBookUpdateData {
  title?: string;
  subtitle?: string;
  template?: BookTemplate;
  preface?: string;
  introduction?: string;
  clanRules?: string;
  generationPoem?: string;
  appendix?: string;
  coverStyle?: string;
  fontFamily?: string;
  paperSize?: string;
  includeGenerationTable?: number;
  includeMemberBio?: number;
  includeTreeChart?: number;
  includeIndex?: number;
  sortOrder?: number;
  status?: number;
}

/** 预览请求参数 */
export interface BookPreviewParams {
  template?: BookTemplate;
  preface?: string;
  introduction?: string;
  clanRules?: string;
  generationPoem?: string;
  appendix?: string;
  includeGenerationTable?: number;
  includeMemberBio?: number;
  includeTreeChart?: number;
  includeIndex?: number;
}

/** 预览响应：按世代分组的成员节点 */
export interface BookPreviewNode {
  id: string;
  name: string;
  gender: string;
  generation: number;
  generationName: string;
  birthDate: string;
  birthPlace: string;
  isAlive: number;
  deathDate: string;
  bio: string;
  fatherId: string;
  motherId: string;
  spouseNames: string[];
  sortOrder: number;
  childrenIds: string[];
}

export interface BookPreviewResponse {
  bookTitle: string;
  familyName: string;
  template: BookTemplate;
  generationCount: number;
  memberCount: number;
  generationLabels: { generation: number; label: string; members: BookPreviewNode[] }[];
}

/** 模板描述 */
export interface TemplateInfo {
  key: BookTemplate;
  name: string;
  description: string;
  features: string[];
}

/** 导出格式 */
export type ExportFormat = 'pdf' | 'docx' | 'html';

export type { DataRow, QueryValues };
