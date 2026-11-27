import { request } from '@/service/request';

/** 历史事件列表项（对应 history_events 表） */
export interface HistoryEventItem {
  id: number;
  year: number;
  title: string;
  dynasty: string;
  description: string;
  category: string;
  region: string;
  keywords: string;
  sort_order: number;
  status: number;
  create_time: string;
  update_time: string;
}

/** 列表请求参数 */
export interface HistoryEventListParams {
  page?: number;
  pageSize?: number;
  yearFrom?: number;
  yearTo?: number;
  category?: string;
  keyword?: string;
  status?: number;
}

/** 新增/编辑 payload */
export interface HistoryEventPayload {
  year: number;
  title: string;
  dynasty?: string;
  description?: string;
  category?: string;
  region?: string;
  keywords?: string;
  sort_order?: number;
  status?: number;
}

/** 列表响应 */
export interface HistoryEventListData {
  list: HistoryEventItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 分页列表 */
export function fetchAdminHistoryEventList(params: HistoryEventListParams) {
  return request<HistoryEventListData>({ url: '/history-events-admin/list', params });
}

/** 详情 */
export function fetchAdminHistoryEventDetail(id: number) {
  return request<HistoryEventItem>({ url: `/history-events-admin/${id}` });
}

/** 新增 */
export function fetchCreateAdminHistoryEvent(data: HistoryEventPayload) {
  return request<{ id: number }>({ url: '/history-events-admin', method: 'post', data });
}

/** 编辑 */
export function fetchUpdateAdminHistoryEvent(id: number, data: HistoryEventPayload) {
  return request<{ id: number }>({ url: `/history-events-admin/${id}`, method: 'put', data });
}

/** 删除（软删除） */
export function fetchDeleteAdminHistoryEvent(id: number) {
  return request<{ ok: boolean }>({ url: `/history-events-admin/${id}`, method: 'delete' });
}

/** 切换启用/禁用 */
export function fetchToggleAdminHistoryEventStatus(id: number, status: number) {
  return request<{ ok: boolean }>({
    url: `/history-events-admin/${id}/toggle`,
    method: 'post',
    data: { status }
  });
}
