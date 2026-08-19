/** 插件入口类型 */
export type PluginEntryType = 'page' | 'url';

/** 小程序端插件项（应用中心「应用」分区展示） */
export interface PluginItem {
  id: number;
  code: string;
  name: string;
  icon: string;
  description: string;
  entryType: PluginEntryType;
  entryValue: string;
  sortOrder: number;
}

/** 小程序端插件列表结果 */
export interface PluginListResult {
  list: PluginItem[];
}

/** 后台管理插件项（含状态与创建人） */
export interface AdminPluginItem extends PluginItem {
  status: number;
  creatorUserId: string;
  createTime: string;
  updateTime: string;
}

/** 后台分页结果 */
export interface AdminPluginListResult {
  list: AdminPluginItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** app_plugin 表行（snake_case） */
export interface PluginRow {
  id: number;
  code: string;
  name: string;
  icon: string;
  description: string;
  entry_type: string;
  entry_value: string;
  sort_order: number;
  status: number;
  creator_user_id: string;
  create_time: string;
  update_time: string;
}

/** 后台新增/编辑入参 */
export interface PluginUpsertData {
  code?: string;
  name?: string;
  icon?: string;
  description?: string;
  entryType?: PluginEntryType;
  entryValue?: string;
  sortOrder?: number;
  status?: number;
}

/** 后台查询参数 */
export interface AdminPluginQueryParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: number;
}
