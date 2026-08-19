import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type AdminPluginItem,
  type AdminPluginListResult,
  type AdminPluginQueryParams,
  type PluginRow,
  type PluginUpsertData
} from './types/plugin.types';
import { type QueryValues } from '../common/types/common';

const ENTRY_TYPES = ['page', 'url'];
const CODE_PATTERN = /^[a-z0-9_-]{2,64}$/;

/**
 * 应用插件后台管理服务
 * - 分页列表（keyword/status 筛选）
 * - 新增 / 编辑 / 删除（物理删除），code 唯一校验
 */
@Injectable()
export class PluginAdminService {
  constructor(private readonly dataSource: DataSource) {}

  /** 分页列表 */
  async getList(params: AdminPluginQueryParams): Promise<AdminPluginListResult> {
    const { page, pageSize, keyword, status } = params;
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const values: QueryValues = [];

    if (status !== undefined) {
      where.push('`status` = ?');
      values.push(status);
    }
    if (keyword) {
      where.push('(`name` LIKE ? OR `code` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`app_plugin\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<PluginRow[]>(
      `SELECT \`id\`, \`code\`, \`name\`, \`icon\`, \`description\`, \`entry_type\`, \`entry_value\`, \`sort_order\`, \`status\`, \`creator_user_id\`, \`create_time\`, \`update_time\`
       FROM \`app_plugin\` ${whereClause}
       ORDER BY \`sort_order\` ASC, \`id\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return {
      list: list.map((r) => this.toItem(r)),
      total,
      page,
      pageSize
    };
  }

  /** 新增 */
  async create(data: PluginUpsertData, operator: string) {
    const clean = this.validate(data);
    const [exist] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `app_plugin` WHERE `code` = ?',
      [clean.code]
    );
    if (exist) {
      throw new HttpException('插件编码已存在', HttpStatus.BAD_REQUEST);
    }

    await this.dataSource.query(
      `INSERT INTO \`app_plugin\`
       (\`code\`, \`name\`, \`icon\`, \`description\`, \`entry_type\`, \`entry_value\`, \`sort_order\`, \`status\`, \`creator_user_id\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clean.code,
        clean.name,
        clean.icon,
        clean.description,
        clean.entryType,
        clean.entryValue,
        clean.sortOrder,
        clean.status,
        operator
      ]
    );
    return { success: true };
  }

  /** 编辑 */
  async update(id: number, data: PluginUpsertData) {
    const [exist] = await this.dataSource.query<{ id: number; code: string }[]>(
      'SELECT `id`, `code` FROM `app_plugin` WHERE `id` = ?',
      [id]
    );
    if (!exist) {
      throw new HttpException('插件不存在或已删除', HttpStatus.NOT_FOUND);
    }

    const clean = this.validate(data, true);

    // code 唯一性（排除自身）
    if (clean.code !== undefined && clean.code !== exist.code) {
      const [dup] = await this.dataSource.query<{ id: number }[]>(
        'SELECT `id` FROM `app_plugin` WHERE `code` = ? AND `id` <> ?',
        [clean.code, id]
      );
      if (dup) {
        throw new HttpException('插件编码已存在', HttpStatus.BAD_REQUEST);
      }
    }

    const fields: string[] = [];
    const values: QueryValues = [];

    if (clean.code !== undefined) { fields.push('`code` = ?'); values.push(clean.code); }
    if (clean.name !== undefined) { fields.push('`name` = ?'); values.push(clean.name); }
    if (clean.icon !== undefined) { fields.push('`icon` = ?'); values.push(clean.icon); }
    if (clean.description !== undefined) { fields.push('`description` = ?'); values.push(clean.description); }
    if (clean.entryType !== undefined) { fields.push('`entry_type` = ?'); values.push(clean.entryType); }
    if (clean.entryValue !== undefined) { fields.push('`entry_value` = ?'); values.push(clean.entryValue); }
    if (clean.sortOrder !== undefined) { fields.push('`sort_order` = ?'); values.push(clean.sortOrder); }
    if (clean.status !== undefined) { fields.push('`status` = ?'); values.push(clean.status); }

    if (fields.length === 0) {
      throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);
    }

    fields.push('`update_time` = NOW()');
    values.push(id);
    await this.dataSource.query(
      `UPDATE \`app_plugin\` SET ${fields.join(', ')} WHERE \`id\` = ?`,
      values
    );
    return { success: true };
  }

  /** 删除（物理删除） */
  async delete(id: number) {
    const result = await this.dataSource.query<{ affectedRows?: number } | { affectedRows?: number }[]>(
      'DELETE FROM `app_plugin` WHERE `id` = ?',
      [id]
    );
    // TypeORM query 对 DELETE 返回 OkPacket 对象（mysql2 driver 可能包装为数组），兼容两种形态
    const affected = Array.isArray(result)
      ? Number(result[0]?.affectedRows ?? 0)
      : Number(result?.affectedRows ?? 0);
    if (affected === 0) {
      throw new HttpException('插件不存在或已删除', HttpStatus.NOT_FOUND);
    }
    return { success: true };
  }

  /** 参数校验与归一化（partial=true 时允许缺省字段） */
  private validate(data: PluginUpsertData, partial = false) {
    const clean: {
      code?: string;
      name?: string;
      icon?: string;
      description?: string;
      entryType?: string;
      entryValue?: string;
      sortOrder?: number;
      status?: number;
    } = {};

    if (data.code !== undefined) {
      clean.code = String(data.code).trim();
      if (!CODE_PATTERN.test(clean.code)) {
        throw new HttpException('插件编码需为 2-64 位小写字母/数字/下划线/中划线', HttpStatus.BAD_REQUEST);
      }
    } else if (!partial) {
      throw new HttpException('缺少插件编码', HttpStatus.BAD_REQUEST);
    }

    if (data.name !== undefined) {
      clean.name = String(data.name).trim();
    } else if (!partial) {
      throw new HttpException('缺少插件名称', HttpStatus.BAD_REQUEST);
    }

    if (data.icon !== undefined) {
      clean.icon = String(data.icon).trim();
    } else if (!partial) {
      throw new HttpException('缺少插件图标', HttpStatus.BAD_REQUEST);
    }

    if (data.description !== undefined) {
      clean.description = String(data.description).trim();
    }

    if (data.entryType !== undefined) {
      const raw = String(data.entryType).trim();
      if (!ENTRY_TYPES.includes(raw)) {
        throw new HttpException('入口类型非法，仅支持 page/url', HttpStatus.BAD_REQUEST);
      }
      clean.entryType = raw;
    } else if (!partial) {
      clean.entryType = 'page';
    }

    if (data.entryValue !== undefined) {
      clean.entryValue = String(data.entryValue).trim();
    }

    if (data.sortOrder !== undefined) {
      clean.sortOrder = Number(data.sortOrder) || 0;
    }

    if (data.status !== undefined) {
      const s = Number(data.status);
      if (s !== 0 && s !== 1) {
        throw new HttpException('状态非法，仅支持 0/1', HttpStatus.BAD_REQUEST);
      }
      clean.status = s;
    }

    if (!partial) {
      if (!clean.code || !clean.name || !clean.icon) {
        throw new HttpException('插件编码、名称、图标均不能为空', HttpStatus.BAD_REQUEST);
      }
      if (!clean.entryValue) {
        throw new HttpException('缺少插件入口地址', HttpStatus.BAD_REQUEST);
      }
    } else {
      // 更新时若传入入口地址，不允许清空
      if (clean.entryValue !== undefined && clean.entryValue.length === 0) {
        throw new HttpException('插件入口地址不能为空', HttpStatus.BAD_REQUEST);
      }
      const hasChange =
        data.code !== undefined ||
        data.name !== undefined ||
        data.icon !== undefined ||
        data.description !== undefined ||
        data.entryType !== undefined ||
        data.entryValue !== undefined ||
        data.sortOrder !== undefined ||
        data.status !== undefined;
      if (!hasChange) {
        throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);
      }
    }

    return clean;
  }

  /** 行记录 → 对外条目 */
  private toItem(r: PluginRow): AdminPluginItem {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      icon: r.icon,
      description: r.description,
      entryType: (r.entry_type || 'page') as AdminPluginItem['entryType'],
      entryValue: r.entry_value || '',
      sortOrder: r.sort_order,
      status: r.status,
      creatorUserId: r.creator_user_id,
      createTime: r.create_time,
      updateTime: r.update_time
    };
  }
}
