import axios from 'axios';
import { request } from '../request';
import { getServiceBaseURL } from '@/utils/service';
import { getAuthorization } from '../request/shared';

export interface FamilyMemberItem {
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
  /** 成员照片URL数组（详情接口返回） */
  photos?: string[];
}

export interface FatherCandidate {
  id: string;
  name: string;
  gender: string;
  generation: number;
  generation_name: string;
  /** 配偶（母亲）姓名摘要，用于同名父亲区分，如 "张氏、李氏" */
  spouse_names?: string;
}

export interface FatherSpouse {
  name: string;
  birthDate?: string;
  deathDate?: string;
  deathPlace?: string;
  bio?: string;
  isAlive?: number;
}

export interface FamilyMemberListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  generation?: number;
  gender?: string;
  status?: number;
}

export interface FamilyMemberListResult {
  list: FamilyMemberItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateFamilyMemberData {
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
  /** 成员照片URL数组（最多9张，编辑时传空数组表示清空） */
  photos?: string[];
  fatherId?: string;
  motherId?: string;
  spouseInfo?: unknown;
  sortOrder?: number;
}

export interface UpdateFamilyMemberData {
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
  /** 成员照片URL数组（最多9张，编辑时传空数组表示清空） */
  photos?: string[];
  fatherId?: string;
  motherId?: string;
  spouseInfo?: unknown;
  sortOrder?: number;
  status?: number;
}

/** 分页列表 */
export function fetchMemberList(familyId: number, params: FamilyMemberListParams) {
  return request<FamilyMemberListResult>({ url: `/family-member/${familyId}/list`, params });
}

/** 获取全部成员（不分页） */
export function fetchAllMembers(familyId: number, params?: { keyword?: string; generation?: number; status?: number }) {
  return request<FamilyMemberItem[]>({ url: `/family-member/${familyId}/all`, params });
}

/** 获取单条 */
export function fetchMemberById(familyId: number, memberId: string) {
  return request<FamilyMemberItem>({ url: `/family-member/${familyId}/${memberId}` });
}

/** 查询父亲候选（上一代男性成员，按姓名模糊匹配） */
export function fetchFatherCandidates(familyId: number, generation: number, keyword: string) {
  return request<FatherCandidate[]>({
    url: `/family-member/${familyId}/father-candidates`,
    params: { generation, keyword }
  });
}

/** 获取指定父亲的配偶列表（候选母亲） */
export function fetchFatherSpouses(familyId: number, fatherId: string) {
  return request<FatherSpouse[]>({ url: `/family-member/${familyId}/father-spouses/${fatherId}` });
}

/** 检查同一父亲下是否存在同名成员 */
export function checkDuplicateMember(familyId: number, params: { name: string; fatherId: string; excludeId?: string }) {
  return request<{ exists: boolean }>({
    url: `/family-member/${familyId}/check-duplicate`,
    params
  });
}

/** 创建 */
export function fetchCreateMember(familyId: number, data: CreateFamilyMemberData) {
  return request<{ id: string }>({ url: `/family-member/${familyId}/create`, method: 'post', data });
}

/** 更新 */
export function fetchUpdateMember(familyId: number, memberId: string, data: UpdateFamilyMemberData) {
  return request<{ success: boolean }>({ url: `/family-member/${familyId}/update/${memberId}`, method: 'put', data });
}

/** 删除（软删除） */
export function fetchDeleteMember(familyId: number, memberId: string) {
  return request<{ success: boolean }>({ url: `/family-member/${familyId}/delete/${memberId}`, method: 'delete' });
}

/** 切换在世/已故状态 */
export function fetchToggleMemberAlive(familyId: number, memberId: string) {
  return request<{ id: string; isAlive: number }>({ url: `/family-member/${familyId}/toggle-alive/${memberId}`, method: 'post' });
}

/** 批量导入成员数据（支持通过 refId / fatherRefId / motherRefId 一次性导入父子关系） */
export interface FamilyMemberImportItem {
  /** 外部行号/原表ID，用于父子关系引用（仅作为关系映射键，不落库）；同一批内必须唯一 */
  refId?: string;
  /** 父亲在导入表中的 refId */
  fatherRefId?: string;
  /** 母亲在导入表中的 refId */
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
  sortOrder?: number;
}

export interface FamilyMemberBatchImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  total: number;
}

/** 文件批量导入结果报告 */
export interface MemberImportFileResult {
  fileName: string;
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
}

/** 批量导入（JSON 数组） */
export function fetchBatchImportMembers(familyId: number, items: FamilyMemberImportItem[]) {
  return request<FamilyMemberBatchImportResult>({ url: `/family-member/${familyId}/batch-import`, method: 'post', data: { items } });
}

/** 文件批量导入（Excel/CSV），支持上传进度回调（0-100） */
export async function fetchImportMembersFile(
  familyId: number,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ data?: MemberImportFileResult; error?: any }> {
  const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === 'Y';
  const { baseURL } = getServiceBaseURL(import.meta.env, isHttpProxy);

  const form = new FormData();
  form.append('file', file);

  try {
    const response = await axios.post<App.Service.Response<MemberImportFileResult>>(
      `${baseURL}/family-member/${familyId}/import`,
      form,
      {
        headers: {
          Authorization: getAuthorization() || '',
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: progressEvent => {
          const total = progressEvent.total || 0;
          const percent = total > 0 ? Math.round((progressEvent.loaded * 100) / total) : 0;
          onProgress?.(percent);
        }
      }
    );
    const body = response.data;
    if (String(body.code) === import.meta.env.VITE_SERVICE_SUCCESS_CODE) {
      return { data: body.data };
    }
    return { error: new Error(body.msg || '导入失败') };
  } catch (error: any) {
    const msg = error?.response?.data?.msg || error?.message || '导入失败';
    return { error: new Error(msg) };
  }
}

/** 下载 CSV 导入模板 */
export async function fetchMemberImportTemplate(familyId: number): Promise<{ data?: Blob; error?: any }> {
  const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === 'Y';
  const { baseURL } = getServiceBaseURL(import.meta.env, isHttpProxy);

  try {
    const response = await axios.get<Blob>(`${baseURL}/family-member/${familyId}/import-template`, {
      headers: { Authorization: getAuthorization() || '' },
      responseType: 'blob'
    });
    // 防御：若服务端返回 JSON 错误（如鉴权失败），blob 内容不是 CSV
    const contentType = response.data.type || '';
    if (contentType.includes('json')) {
      const text = await response.data.text();
      try {
        const err = JSON.parse(text);
        return { error: new Error(err?.msg || err?.message || '模板下载失败') };
      } catch {
        return { error: new Error('模板下载失败') };
      }
    }
    return { data: response.data };
  } catch (error: any) {
    const msg = error?.response?.data?.msg || error?.message || '模板下载失败';
    return { error: new Error(msg) };
  }
}
