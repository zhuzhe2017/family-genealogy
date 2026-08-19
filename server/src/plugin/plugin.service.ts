import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type PluginItem, type PluginListResult, type PluginRow } from './types/plugin.types';

/**
 * 小程序端应用插件服务
 * - 返回启用中的插件（应用中心「应用」分区），按排序值升序
 * - 插件均为全局应用，无需登录/家族归属校验
 */
@Injectable()
export class PluginService {
  constructor(private readonly dataSource: DataSource) {}

  /** 启用中的插件列表 */
  async getActiveList(): Promise<PluginListResult> {
    const rows = await this.dataSource.query<PluginRow[]>(
      `SELECT \`id\`, \`code\`, \`name\`, \`icon\`, \`description\`, \`entry_type\`, \`entry_value\`, \`sort_order\`, \`create_time\`
       FROM \`app_plugin\`
       WHERE \`status\` = 1
       ORDER BY \`sort_order\` ASC, \`id\` DESC`
    );

    return { list: rows.map((r) => this.toItem(r)) };
  }

  /** 行记录 → 对外条目 */
  private toItem(r: PluginRow): PluginItem {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      icon: r.icon,
      description: r.description,
      entryType: (r.entry_type || 'page') as PluginItem['entryType'],
      entryValue: r.entry_value || '',
      sortOrder: r.sort_order
    };
  }
}
