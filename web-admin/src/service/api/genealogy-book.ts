import axios from 'axios';
import { request } from '../request';
import { getServiceBaseURL } from '@/utils/service';
import { getAuthorization } from '../request/shared';

/** 家谱模板类型 */
export type BookTemplate = 'european' | 'su_style' | 'modern' | 'classical';

/** 模板信息 */
export interface TemplateInfo {
  key: BookTemplate;
  name: string;
  description: string;
  features: string[];
}

/** 家谱成书记录 */
export interface GenealogyBookItem {
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

/** 创建数据 */
export interface CreateGenealogyBookData {
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
}

/** 更新数据 */
export interface UpdateGenealogyBookData {
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

/** 预览节点 */
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

/** 预览响应 */
export interface BookPreviewResponse {
  bookTitle: string;
  familyName: string;
  template: BookTemplate;
  generationCount: number;
  memberCount: number;
  generationLabels: { generation: number; label: string; members: BookPreviewNode[] }[];
}

/** 分页列表 */
export function fetchGenealogyBookList(familyId: number, params: { page: number; pageSize: number }) {
  return request<{ list: GenealogyBookItem[]; total: number; page: number; pageSize: number }>({
    url: `/genealogy-book/${familyId}/list`,
    params
  });
}

/** 获取单条 */
export function fetchGenealogyBookById(familyId: number, id: number) {
  return request<GenealogyBookItem>({ url: `/genealogy-book/${familyId}/${id}` });
}

/** 获取模板列表 */
export function fetchGenealogyBookTemplates(familyId: number) {
  return request<TemplateInfo[]>({ url: `/genealogy-book/${familyId}/templates` });
}

/** 创建 */
export function fetchCreateGenealogyBook(familyId: number, data: CreateGenealogyBookData) {
  return request<{ id: number }>({ url: `/genealogy-book/${familyId}/create`, method: 'post', data });
}

/** 更新 */
export function fetchUpdateGenealogyBook(familyId: number, id: number, data: UpdateGenealogyBookData) {
  return request<{ success: boolean }>({ url: `/genealogy-book/${familyId}/update/${id}`, method: 'put', data });
}

/** 删除 */
export function fetchDeleteGenealogyBook(familyId: number, id: number) {
  return request<{ success: boolean }>({ url: `/genealogy-book/${familyId}/delete/${id}`, method: 'delete' });
}

/** 切换状态 */
export function fetchToggleGenealogyBookStatus(familyId: number, id: number) {
  return request<{ id: number; status: number }>({ url: `/genealogy-book/${familyId}/toggle-status/${id}`, method: 'post' });
}

/** 预览 */
export function fetchGenealogyBookPreview(familyId: number, id: number) {
  return request<BookPreviewResponse>({ url: `/genealogy-book/${familyId}/preview/${id}` });
}

/** 导出 HTML 并触发浏览器下载 */
export async function exportGenealogyBook(familyId: number, id: number) {
  const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === 'Y';
  const { baseURL } = getServiceBaseURL(import.meta.env, isHttpProxy);
  const response = await axios.get<Blob>(`${baseURL}/genealogy-book/${familyId}/export/${id}`, {
    responseType: 'blob',
    headers: {
      Authorization: getAuthorization() || '',
      Accept: 'text/html; charset=utf-8'
    }
  });

  // 从 Content-Disposition 提取文件名
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
  const filename = match ? decodeURIComponent(match[1]) : `genealogy-book-${id}.html`;

  const url = window.URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
