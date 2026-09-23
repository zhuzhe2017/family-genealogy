/** 系统配置行（sys_config 表，DB 列名 snake_case） */
export interface SysConfigRow {
  id: number;
  config_key: string;
  config_name: string;
  config_value: string | null;
  value_type: string;
  group: string;
  remark: string;
  sort_order: number;
  status: number;
  is_system: number;
  operator: string;
  create_time: string;
  update_time: string;
}

/** 系统配置 API 输出（camelCase） */
export interface SysConfigItem {
  id: number;
  configKey: string;
  configName: string;
  configValue: string | number | boolean | unknown[];
  valueType: string;
  group: string;
  remark: string;
  sortOrder: number;
  status: number;
  isSystem: number;
  operator: string;
  createTime: string;
  updateTime: string;
}

/** 配置查询参数 */
export interface SysConfigQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  group?: string;
  status?: number;
}

/** 配置更新数据（camelCase 入参） */
export interface SysConfigUpdateData {
  configValue?: string;
  configName?: string;
  remark?: string;
  sortOrder?: number;
  status?: number;
}

/** 批量保存条目 */
export interface SysConfigSaveItem {
  id: number;
  configValue: string | number | boolean;
}
