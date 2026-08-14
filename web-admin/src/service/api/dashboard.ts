import { request } from '../request';

export interface SurnameStat {
  surname: string;
  ranking: number;
  familyCount: number;
  memberCount: number;
}

export interface DashboardStats {
  totalFamilies: number;
  totalMembers: number;
  content: {
    dynamics: number;
    photos: number;
    documents: number;
    events: number;
  };
  surnames: SurnameStat[];
}

/** 获取系统仪表盘统计数据 */
export function fetchDashboardStats() {
  return request<DashboardStats>({ url: '/dashboard/stats' });
}
