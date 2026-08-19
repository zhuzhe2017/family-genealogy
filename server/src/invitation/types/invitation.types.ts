/** 邀请角色 */
export type InvitationRole = 'member' | 'admin';

/** 邀请状态: 1-待接受 2-已接受 3-已拒绝 4-已过期 0-已失效 */
export type InvitationStatus = 0 | 1 | 2 | 3 | 4;

/** 邀请渠道 */
export type InvitationChannel = 'link' | 'sms' | 'email' | 'wechat' | 'qrcode' | 'poster';

/** 数据库 invitation 行 */
export interface InvitationRow {
  id: number;
  family_id: number;
  inviter_user_id: string;
  invitee_user_id: string | null;
  invitee_phone: string;
  invitee_email: string;
  invite_code: string;
  invite_link: string;
  channel: InvitationChannel;
  poster_url: string;
  share_count: number;
  joined_count: number;
  role: InvitationRole;
  status: InvitationStatus;
  expires_at: Date | string;
  accepted_at: Date | string | null;
  rejected_at: Date | string | null;
  processed_by: string | null;
  remark: string;
  create_time: Date | string;
  update_time: Date | string;
}

/** 创建邀请请求 */
export interface CreateInvitationData {
  familyId: number;
  inviteePhone?: string;
  inviteeEmail?: string;
  role?: InvitationRole;
  /** 有效期天数，默认 7 天 */
  expireDays?: number;
  /** 渠道，默认 link */
  channel?: InvitationChannel;
}

/** 邀请列表查询参数 */
export interface InvitationQueryParams {
  page?: number;
  pageSize?: number;
  familyId?: number;
  status?: InvitationStatus;
  keyword?: string;
}

/** 邀请详情（对外返回） */
export interface InvitationView {
  id: number;
  familyId: number;
  inviterUserId: string;
  inviterNickname?: string;
  inviterAvatarUrl?: string;
  inviteeUserId?: string;
  inviteePhone?: string;
  inviteeEmail?: string;
  inviteCode: string;
  inviteLink: string;
  channel?: InvitationChannel;
  posterUrl?: string;
  shareCount: number;
  joinedCount: number;
  role: InvitationRole;
  status: InvitationStatus;
  statusText: string;
  expiresAt: string;
  acceptedAt?: string;
  rejectedAt?: string;
  remark?: string;
  createTime: string;
}

/** 处理邀请请求 */
export interface ProcessInvitationData {
  /** 邀请码 */
  inviteCode: string;
  /** 是否接受: true-接受 false-拒绝 */
  accept: boolean;
  /** 拒绝原因（拒绝时可选） */
  remark?: string;
}

/** 用户可加入家族的邀请信息（通过邀请码查询） */
export interface InvitationJoinInfo {
  familyId: number;
  familyName: string;
  familyLogo?: string;
  inviterNickname?: string;
  inviterAvatarUrl?: string;
  role: InvitationRole;
  expiresAt: string;
  /** 小程序码图片URL（微信配置后生成，供海报绘制） */
  qrCodeUrl?: string;
  /** 分享次数 */
  shareCount: number;
  /** 通过该邀请加入人数 */
  joinedCount: number;
}

/** 家族角色 */
export type FamilyRole = 'member' | 'admin' | 'creator';
