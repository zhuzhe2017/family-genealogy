import { type DataRow, type QueryValues, type IdResult, type SuccessResult } from '../../common/types/common';

/** 管理员记录 */
export interface AdminRow extends DataRow {
  id: number;
  username: string;
  password: string;
  nickname: string;
  avatar_url: string;
  phone: string;
  email: string;
  role: string;
  status: number;
  last_login_time: string;
  create_time: string;
}

/** 管理员简要信息 */
export interface AdminSimple {
  id: number;
  username: string;
  nickname: string;
  role: string;
  status: number;
}

/** 管理员绑定家族记录 */
export interface AdminFamilyRow extends DataRow {
  family_id: number;
}

/** 管理员登录响应 */
export interface AdminLoginResult {
  token: string;
  refreshToken: string;
}

/** 管理员创建数据 */
export interface AdminCreateData {
  username: string;
  password: string;
  nickname?: string;
  phone?: string;
  email?: string;
  role?: string;
}

/** 管理员更新数据 */
export interface AdminUpdateData {
  nickname?: string;
  phone?: string;
  email?: string;
  role?: string;
  status?: number;
}

/** 管理员信息响应 */
export interface AdminProfileResult {
  userId: string;
  userName: string;
  nickname: string;
  avatarUrl: string;
  phone: string;
  email: string;
  roles: string[];
  buttons: string[];
  familyIds: number[];
}

export type { DataRow, QueryValues, IdResult, SuccessResult };
