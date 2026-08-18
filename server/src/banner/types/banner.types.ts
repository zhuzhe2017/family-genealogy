/** 广告跳转类型 */
export type BannerLinkType = 'none' | 'page' | 'url';

/** 小程序端轮播项 */
export interface BannerItem {
  id: number;
  familyId: number;
  title: string;
  imageUrl: string;
  linkType: BannerLinkType;
  linkUrl: string;
  sortOrder: number;
  startTime: string | null;
  endTime: string | null;
  createTime: string;
}

/** 后台管理轮播项（含创建人与状态） */
export interface AdminBannerItem extends BannerItem {
  status: number;
  creatorUserId: string;
  updateTime: string;
}

/** 小程序端轮播列表结果（含自动切换间隔） */
export interface BannerListResult {
  list: BannerItem[];
  interval: number;
}

/** 后台分页结果 */
export interface AdminBannerListResult {
  list: AdminBannerItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** family_banner 表行（snake_case） */
export interface BannerRow {
  id: number;
  family_id: number;
  title: string;
  image_url: string;
  link_type: string;
  link_url: string;
  sort_order: number;
  status: number;
  start_time: string | null;
  end_time: string | null;
  creator_user_id: string;
  create_time: string;
  update_time: string;
}

/** 后台新增/编辑入参 */
export interface BannerUpsertData {
  familyId?: number;
  title?: string;
  imageUrl?: string;
  linkType?: BannerLinkType;
  linkUrl?: string;
  sortOrder?: number;
  status?: number;
  startTime?: string | null;
  endTime?: string | null;
}

/** 后台查询参数 */
export interface AdminBannerQueryParams {
  page: number;
  pageSize: number;
  familyId?: number;
  keyword?: string;
  status?: number;
}
