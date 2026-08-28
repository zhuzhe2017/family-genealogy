import { request } from '../request';

/** 广告轮播项（管理视图） */
export interface AdminBannerItem {
  id: number;
  familyId: number;
  title: string;
  imageUrl: string;
  linkType: 'none' | 'page' | 'url';
  linkUrl: string;
  clickCount: number;
  sortOrder: number;
  status: number;
  startTime: string | null;
  endTime: string | null;
  creatorUserId: string;
  createTime: string;
  updateTime: string;
}

/** 广告轮播分页结果 */
export interface AdminBannerListResult {
  list: AdminBannerItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 新增/编辑入参 */
export interface AdminBannerPayload {
  familyId: number;
  title: string;
  imageUrl: string;
  linkType: 'none' | 'page' | 'url';
  linkUrl?: string;
  sortOrder?: number;
  status?: number;
  startTime?: string | null;
  endTime?: string | null;
}

/** 广告轮播分页列表 */
export function fetchAdminBannerList(params: {
  page: number;
  pageSize: number;
  familyId?: number;
  keyword?: string;
  status?: number;
}) {
  return request<AdminBannerListResult>({ url: '/banner/list', params });
}

/** 新增广告 */
export function fetchCreateAdminBanner(data: AdminBannerPayload) {
  return request<{ success: boolean }>({ url: '/banner', method: 'post', data });
}

/** 编辑广告 */
export function fetchUpdateAdminBanner(id: number, data: AdminBannerPayload) {
  return request<{ success: boolean }>({ url: `/banner/${id}`, method: 'put', data });
}

/** 删除广告 */
export function fetchDeleteAdminBanner(id: number) {
  return request<{ success: boolean }>({ url: `/banner/${id}`, method: 'delete' });
}
