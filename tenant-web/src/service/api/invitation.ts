import { request } from '../request';

/** 家族邀请项（管理视图） */
export interface AdminInvitationItem {
  id: number;
  familyId: number;
  familyName: string;
  inviterUserId: string;
  inviterNickname: string;
  inviteeUserId: string | null;
  inviteeNickname: string;
  inviteePhone: string;
  inviteeEmail: string;
  inviteCode: string;
  inviteLink: string;
  channel: string;
  posterUrl: string;
  shareCount: number;
  joinedCount: number;
  role: string;
  status: number;
  expiresAt: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  remark: string;
  createTime: string;
}

/** 家族邀请分页结果 */
export interface AdminInvitationListResult {
  list: AdminInvitationItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 家族邀请分页列表 */
export function fetchAdminInvitationList(params: {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: number;
  familyId?: number;
}) {
  return request<AdminInvitationListResult>({ url: '/invitation/list', params });
}

/** 删除家族邀请 */
export function fetchDeleteAdminInvitation(id: number) {
  return request<{ success: boolean }>({ url: `/invitation/${id}`, method: 'delete' });
}

/** 批量删除家族邀请 */
export function fetchBatchDeleteAdminInvitation(ids: number[]) {
  return request<{ success: boolean; deletedCount: number }>({
    url: '/invitation/batch',
    method: 'delete',
    data: { ids }
  });
}
