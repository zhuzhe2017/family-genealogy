/** 系统日志类型 */
export type SystemLogType = 'operation' | 'error' | 'access';

/** 系统日志行（sys_log 表，DB 列名 snake_case） */
export interface SysLogRow {
  id: number;
  log_type: string;
  module: string;
  action: string;
  method: string;
  path: string;
  operator: string;
  operator_id: number | null;
  ip: string;
  user_agent: string;
  status: number;
  success: number;
  detail: string | null;
  cost_time: number;
  create_time: string;
}

/** 日志写入数据 */
export interface SystemLogWriteData {
  logType: SystemLogType;
  module?: string;
  action?: string;
  method?: string;
  path?: string;
  operator?: string;
  operatorId?: number | null;
  ip?: string;
  userAgent?: string;
  status?: number;
  success?: boolean;
  detail?: string;
  costTime?: number;
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

/** 日志清理参数 */
export interface SystemLogCleanParams {
  logType?: string;
  startTime?: string;
  endTime?: string;
}
