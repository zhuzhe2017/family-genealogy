import { type DataRow, type QueryValues } from '../../common/types/common';

/** 用户表记录 */
export interface UserRow extends DataRow {
  id: string;
  nickname: string;
  avatar_url: string;
  phone: string;
  password: string;
  gender: number;
  openid: string;
  unionid: string;
  /** 关联家族支系ID（会员所属家族支系） */
  family_id: number | null;
  /** 关联成员ID（会员与家族成员的绑定关系） */
  member_id: string;
  /** 分享码（家族邀请/加入） */
  share_code: string | null;
  status: number;
  create_time: string;
  update_time: string;
}

/** JWT 用户信息 */
export interface UserInfo {
  id: string;
  nickName: string;
  avatarUrl: string;
  gender: number;
  phone?: string;
  /** 关联家族支系ID */
  familyId?: number | null;
  /** 关联成员ID */
  memberId?: string;
  /** 分享码 */
  shareCode?: string | null;
}

/** 登录响应 */
export interface UserLoginResult {
  token: string;
  userInfo: UserInfo;
}

/** 用户认证绑定表记录（多端账号统一） */
export interface UserAuthIdentityRow extends DataRow {
  id: number;
  user_id: string;
  provider: string;
  provider_uid: string;
  unionid: string;
  extra: string | null;
  status: number;
  create_time: string;
  update_time: string;
}

/** 发送短信验证码响应 */
export interface SendSmsCodeResult {
  success: boolean;
  /** 开发模式(mock)下返回验证码，生产环境为空串 */
  devCode?: string;
}

export type { DataRow, QueryValues };
