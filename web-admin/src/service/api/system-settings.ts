import axios from 'axios';
import { request } from '../request';
import { getServiceBaseURL } from '@/utils/service';
import { getAuthorization } from '../request/shared';

/** 系统配置项（sys_config） */
export interface SystemConfigItem {
  id: number;
  configKey: string;
  configName: string;
  configValue: string | number | boolean | unknown;
  valueType: 'string' | 'number' | 'boolean' | 'json';
  group: 'basic' | 'security' | 'log' | string;
  remark: string;
  sortOrder: number;
  status: number;
  isSystem: number;
}

/** 按分组返回的配置集合 */
export interface SystemConfigGroups {
  basic: SystemConfigItem[];
  security: SystemConfigItem[];
  log: SystemConfigItem[];
}

/** 密码策略 */
export interface PasswordPolicy {
  minLength: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  expireDays: number;
}

/** 敏感操作二次验证配置 */
export interface SensitiveVerifyConfig {
  enabled: boolean;
  timeout: number;
}

/** 批量保存条目 */
export interface SystemConfigSaveItem {
  id: number;
  configValue: string | number | boolean;
}

/** 按分组获取配置（基础/安全/日志） */
export function fetchSystemConfigGroups() {
  return request<SystemConfigGroups>({ url: '/system-config/groups' });
}

/** 站点基础配置（公开）：系统名称/LOGO/版权信息 */
export function fetchSiteConfig() {
  return request<{ systemName: string; systemLogo: string; copyright: string }>({
    url: '/system-config/site'
  });
}

/** 获取配置列表 */
export function fetchSystemConfigList(params?: { page?: number; pageSize?: number; keyword?: string; group?: string }) {
  return request<{ list: SystemConfigItem[]; total: number; page: number; pageSize: number }>({
    url: '/system-config/list',
    params
  });
}

/** 更新单条配置 */
export function fetchUpdateSystemConfig(id: number, data: { configValue?: string; configName?: string; remark?: string; sortOrder?: number; status?: number }) {
  return request({ url: `/system-config/update/${id}`, method: 'put', data });
}

/** 批量保存配置 */
export function fetchSaveSystemConfigBatch(items: SystemConfigSaveItem[]) {
  return request<{ success: boolean; updated: number }>({ url: '/system-config/save-batch', method: 'post', data: { items } });
}

/** 恢复配置默认值 */
export function fetchResetSystemConfig(id: number) {
  return request({ url: `/system-config/reset/${id}`, method: 'post' });
}

/** 获取当前密码策略 */
export function fetchPasswordPolicy() {
  return request<PasswordPolicy>({ url: '/system-security/password-policy' });
}

/** 获取敏感操作二次验证配置 */
export function fetchSensitiveVerifyConfig() {
  return request<SensitiveVerifyConfig>({ url: '/system-security/sensitive-config' });
}

/** 敏感操作二次验证（校验当前管理员密码） */
export function fetchVerifyPassword(password: string) {
  return request<{ verified: boolean; expiresIn: number }>({ url: '/system-security/verify-password', method: 'post', data: { password } });
}

/** 获取登录页配置（公开） */
export function fetchLoginConfig() {
  return request<{ captchaEnabled: boolean }>({ url: '/system-security/login-config' });
}

/** 获取图形验证码（公开） */
export function fetchCaptcha() {
  return request<{ token: string; svg: string }>({ url: '/system-security/captcha' });
}

/** 系统日志项 */
export interface SystemLogItem {
  id: number;
  logType: 'operation' | 'error' | 'access';
  module: string;
  action: string;
  method: string;
  path: string;
  operator: string;
  ip: string;
  status: number;
  success: number;
  detail: string | null;
  costTime: number;
  createTime: string;
}

/** 日志类型统计 */
export interface SystemLogStats {
  operation: number;
  error: number;
  access: number;
}

/** 日志查询参数 */
export interface SystemLogQueryParams {
  page: number;
  pageSize: number;
  logType?: string;
  module?: string;
  keyword?: string;
  operator?: string;
  startTime?: string;
  endTime?: string;
}

/** 查询日志列表 */
export function fetchSystemLogList(params: SystemLogQueryParams) {
  return request<{ list: SystemLogItem[]; total: number; page: number; pageSize: number }>({
    url: '/system-log/list',
    params
  });
}

/** 各类型日志数量统计 */
export function fetchSystemLogStats() {
  return request<SystemLogStats>({ url: '/system-log/stats' });
}

/** 日志详情 */
export function fetchSystemLogDetail(id: number) {
  return request<SystemLogItem>({ url: `/system-log/${id}` });
}

/** 导出日志 CSV（直接下载 blob） */
export async function fetchSystemLogExport(params?: Omit<SystemLogQueryParams, 'page' | 'pageSize'>) {
  const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === 'Y';
  const { baseURL } = getServiceBaseURL(import.meta.env, isHttpProxy);

  const res = await axios.get<Blob>(`${baseURL}/system-log/export`, {
    params,
    responseType: 'blob',
    headers: { Authorization: getAuthorization() }
  });
  return res.data;
}

/** 清理日志 */
export function fetchSystemLogClean(params?: { logType?: string; startTime?: string; endTime?: string }) {
  return request<{ success: boolean; deleted: number }>({ url: '/system-log/clean', method: 'delete', params });
}

/** 删除单条日志 */
export function fetchDeleteSystemLog(id: number) {
  return request({ url: `/system-log/${id}`, method: 'delete' });
}
