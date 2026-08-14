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
}

/** 登录响应 */
export interface UserLoginResult {
  token: string;
  userInfo: UserInfo;
}

export type { DataRow, QueryValues };
