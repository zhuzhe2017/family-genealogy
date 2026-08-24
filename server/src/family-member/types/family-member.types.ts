import { type DataRow, type QueryValues, type PaginationResult, type IdResult, type SuccessResult } from '../../common/types/common';

/** 家族成员表记录 */
export interface FamilyMemberRow extends DataRow {
  id: string;
  family_id: number;
  name: string;
  gender: string;
  generation: number;
  generation_name: string;
  birth_date: string;
  birth_place: string;
  is_alive: number;
  death_date: string;
  death_place: string;
  longitude: number | null;
  latitude: number | null;
  bio: string | null;
  avatar_url: string;
  father_id: string;
  mother_id: string;
  spouse_info: string | null;
  sort_order: number;
  status: number;
  create_time: string;
  update_time: string;
  /** 成员照片URL数组（getById 附加，来源于成员照片分表） */
  photos?: string[];
}

/** 家族成员创建数据 */
export interface FamilyMemberCreateData {
  name: string;
  gender?: string;
  generation?: number;
  generationName?: string;
  birthDate?: string;
  birthPlace?: string;
  isAlive?: number;
  deathDate?: string;
  deathPlace?: string;
  longitude?: number;
  latitude?: number;
  bio?: string;
  /** 头像URL（/uploads/xxx 或 http(s) 完整地址，最多500字符） */
  avatarUrl?: string;
  fatherId?: string;
  motherId?: string;
  spouseInfo?: unknown;
  sortOrder?: number;
  /** 成员照片URL数组 */
  photos?: string[];
}

/** 家族成员更新数据 */
export interface FamilyMemberUpdateData {
  name?: string;
  gender?: string;
  generation?: number;
  generationName?: string;
  birthDate?: string;
  birthPlace?: string;
  isAlive?: number;
  deathDate?: string;
  deathPlace?: string;
  longitude?: number;
  latitude?: number;
  bio?: string;
  /** 头像URL（/uploads/xxx 或 http(s) 完整地址，最多500字符） */
  avatarUrl?: string;
  fatherId?: string;
  motherId?: string;
  spouseInfo?: unknown;
  sortOrder?: number;
  status?: number;
  /** 成员照片URL数组（传入即整体替换） */
  photos?: string[];
}

/** 家族成员列表查询参数 */
export interface FamilyMemberQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  generation?: number;
  gender?: string;
  status?: number;
}

/** 父亲候选成员。携带其父（爷爷）姓名与配偶姓名摘要，用于同名父亲区分 */
export interface FatherCandidate {
  id: string;
  name: string;
  gender: string;
  generation: number;
  generation_name: string;
  /** 配偶姓名列表，按 JSON 数组顺序拼接，如 "张氏、李氏" */
  spouse_names?: string;
  /** 其父姓名（爷爷），前端展示为"XX之子"锚点 */
  father_name?: string;
}

/** 父亲配偶（候选母亲）。数组下标即配偶序号（从0开始），用作母亲ID */
export interface FatherSpouse {
  name: string;
  birthDate?: string;
  deathDate?: string;
  deathPlace?: string;
  bio?: string;
  isAlive?: number;
}

/** 家族成员批量导入数据（支持通过 refId / fatherRefId / motherRefId 一次性导入父子关系） */
export interface FamilyMemberImportItem {
  /** 外部行号/原表ID，用于父子关系引用（仅作为关系映射键，不落库）；同一批内必须唯一 */
  refId?: string;
  /** 父亲在导入表中的 refId（不落库，导入时换算为系统生成的成员ID） */
  fatherRefId?: string;
  /** 母亲ID：父亲配偶数组中的序号（数字，从0开始），非成员ID */
  motherRefId?: string;
  name: string;
  gender?: string;
  generation?: number;
  generationName?: string;
  birthDate?: string;
  birthPlace?: string;
  isAlive?: number;
  deathDate?: string;
  deathPlace?: string;
  longitude?: number;
  latitude?: number;
  bio?: string;
  /** 配偶数组（[{name}]），数组顺序即配偶序号，对应母亲ID */
  spouseInfo?: { name: string }[];
  sortOrder?: number;
}

export type { DataRow, QueryValues, PaginationResult, IdResult, SuccessResult };
