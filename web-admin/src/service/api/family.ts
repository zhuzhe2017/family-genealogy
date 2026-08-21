import { request } from '../request';

export interface FamilyItem {
  id: number;
  surname_id: number;
  surname_name?: string;
  generation_table_id?: string;
  generation_table_surname?: string;
  generation_table_founder?: string;
  generation_sequence?: string[];
  name: string;
  logo: string;
  founder: string;
  origin: string;
  description: string;
  is_public: number;
  allow_join: number;
  member_count: number;
  gen_count: number;
  seed_share_code?: string;
  creator_id: number;
  status: number;
  create_time: string;
  update_time: string;
  // 关联统计（列表/详情返回，由后端 service 附加，保持 camelCase）
  realMemberCount?: number;
  eventCount?: number;
  photoCount?: number;
  documentCount?: number;
  dynamicCount?: number;
  adminCount?: number;
}

export interface FamilyListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: number;
  isPublic?: number;
}

export interface FamilyListResult {
  list: FamilyItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateFamilyData {
  surnameId?: number | null;
  generationTableId?: string | null;
  name: string;
  logo?: string;
  founder?: string;
  origin?: string;
  description?: string;
  isPublic?: number;
  allowJoin?: number;
  creatorId?: number;
}

export interface UpdateFamilyData {
  surnameId?: number | null;
  generationTableId?: string | null;
  name?: string;
  logo?: string;
  founder?: string;
  origin?: string;
  description?: string;
  isPublic?: number;
  allowJoin?: number;
  status?: number;
}

/** 分页列表 */
export function fetchFamilyList(params: FamilyListParams) {
  return request<FamilyListResult>({ url: '/family/list', params });
}

/** 获取全部家族（不分页，用于下拉选择） */
export function fetchAllFamilies(params?: { keyword?: string; status?: number }) {
  return request<FamilyItem[]>({ url: '/family/all', params });
}

/** 获取单条 */
export function fetchFamilyById(id: number) {
  return request<FamilyItem>({ url: `/family/${id}` });
}

/** 创建 */
export function fetchCreateFamily(data: CreateFamilyData) {
  return request<{ id: number; seedShareCode?: string }>({ url: '/family/create', method: 'post', data });
}

/** 更新 */
export function fetchUpdateFamily(id: number, data: UpdateFamilyData) {
  return request<{ success: boolean }>({ url: `/family/update/${id}`, method: 'put', data });
}

/** 删除（软删除） */
export function fetchDeleteFamily(id: number) {
  return request<{ success: boolean }>({ url: `/family/delete/${id}`, method: 'delete' });
}

/** 切换公开状态 */
export function fetchToggleFamilyPublic(id: number) {
  return request<{ id: number; isPublic: number }>({ url: `/family/toggle-public/${id}`, method: 'post' });
}
