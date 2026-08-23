import { type Request } from 'express';

/** 数据查询占位符参数允许的基本类型 */
export type QueryValue = string | number | boolean | null | Date | undefined;

/** 通用 SQL 参数列表 */
export type QueryValues = QueryValue[];

/** 通用行记录：后端手写 SQL 返回的任意对象 */
export type DataRow = Record<string, unknown>;

/** 分页返回结构 */
export interface PaginationResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 标准操作成功响应 */
export interface SuccessResult {
  success: boolean;
}

/** 带 ID 的创建结果 */
export interface IdResult {
  id: number | string;
}

/** 字典/键值对 */
export interface Dictionary<T> {
  [key: string]: T;
}

/** 认证请求（JWT 验证后注入） */
export interface AuthenticatedRequest extends Request {
  user: {
    id: number | string;
    username?: string;
    role?: string;
    roles?: string[];
    permissions?: string[];
    /** 小程序用户令牌（user-jwt 策略注入） */
    nickname?: string;
    avatarUrl?: string;
    gender?: string;
  };
}

/** 微信 jscode2session 响应 */
export interface WxSessionResponse {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

/** 家族关联统计 */
export interface FamilyStats {
  memberCount: number;
  eventCount: number;
  photoCount: number;
  documentCount: number;
  dynamicCount: number;
  adminCount: number;
}

/** 家族成员配偶信息 */
export interface SpouseInfo {
  name?: string;
  birthDate?: string;
  deathDate?: string;
  bio?: string;
  longitude?: number;
  latitude?: number;
}
