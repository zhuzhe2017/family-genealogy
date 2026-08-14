import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Response } from 'express';
import {
  type SysLogRow,
  type SystemLogWriteData,
  type SystemLogQueryParams,
  type SystemLogCleanParams
} from './types/system-log.types';
import { type QueryValues } from '../common/types/common';

/** 日志类型 -> 展示名 */
export const LOG_TYPE_NAMES: Record<string, string> = {
  operation: '操作日志',
  error: '错误日志',
  access: '访问日志'
};

/** 从请求路径推断模块名 */
export function inferModule(path: string): string {
  const m = path.replace(/^\/api\//, '').split('/')[0] || '';
  return m;
}

/** 根据方法与路径推断操作动作 */
export function describeAction(method: string, path: string): string {
  const p = path.toLowerCase();

  if (p.includes('login')) return '登录';
  if (p.includes('refresh')) return '刷新令牌';
  if (p.includes('update-password')) return '修改密码';
  if (p.includes('verify-password')) return '二次验证';
  if (p.includes('captcha')) return '获取验证码';
  if (p.includes('toggle-status')) return '切换状态';
  if (p.includes('batch-import')) return '批量导入';
  if (p.includes('save-batch')) return '批量保存';
  if (p.includes('reset')) return '恢复默认';
  if (p.includes('clean')) return '清理日志';
  if (p.includes('bind-family')) return '绑定家族';
  if (p.includes('export')) return '导出';

  if (method === 'POST') return '新增';
  if (method === 'PUT') return '编辑';
  if (method === 'PATCH') return '更新';
  if (method === 'DELETE') return '删除';
  if (method === 'GET') return '查询';
  return '操作';
}

@Injectable()
export class SystemLogService {
  constructor(private readonly dataSource: DataSource) {}

  /** 写入一条日志（调用方通常 fire-and-forget） */
  async write(data: SystemLogWriteData): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO \`sys_log\`
         (\`log_type\`, \`module\`, \`action\`, \`method\`, \`path\`, \`operator\`, \`operator_id\`, \`ip\`, \`user_agent\`, \`status\`, \`success\`, \`detail\`, \`cost_time\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.logType,
          (data.module || '').slice(0, 50),
          (data.action || '').slice(0, 100),
          (data.method || '').slice(0, 10),
          (data.path || '').slice(0, 200),
          (data.operator || 'anonymous').slice(0, 50),
          data.operatorId ?? null,
          (data.ip || '').slice(0, 64),
          (data.userAgent || '').slice(0, 255),
          data.status ?? 200,
          data.success === false ? 0 : 1,
          (data.detail || '').slice(0, 4000),
          data.costTime ?? 0
        ]
      );
    } catch (err: unknown) {
      // 日志写入失败不影响主流程
      const message = err instanceof Error ? err.message : 'unknown';
      // eslint-disable-next-line no-console
      console.warn('[system-log] 日志写入失败:', message);
    }
  }

  /** fire-and-forget 写入 */
  writeAsync(data: SystemLogWriteData): void {
    void this.write(data);
  }

  /** 构建查询条件 */
  private buildWhere(params: SystemLogQueryParams): { where: string[]; values: QueryValues } {
    const where: string[] = [];
    const values: QueryValues = [];

    if (params.logType) {
      where.push('`log_type` = ?');
      values.push(params.logType);
    }
    if (params.module) {
      where.push('`module` = ?');
      values.push(params.module);
    }
    if (params.operator) {
      where.push('`operator` LIKE ?');
      values.push(`%${params.operator}%`);
    }
    if (params.keyword) {
      where.push('(`action` LIKE ? OR `path` LIKE ? OR `detail` LIKE ?)');
      values.push(`%${params.keyword}%`, `%${params.keyword}%`, `%${params.keyword}%`);
    }
    if (params.startTime) {
      where.push('`create_time` >= ?');
      values.push(params.startTime);
    }
    if (params.endTime) {
      where.push('`create_time` <= ?');
      values.push(params.endTime);
    }

    return { where, values };
  }

  /** 分页查询 */
  async getList(params: SystemLogQueryParams) {
    const { page, pageSize } = params;
    const offset = (page - 1) * pageSize;
    const { where, values } = this.buildWhere(params);
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`sys_log\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<SysLogRow[]>(
      `SELECT \`id\`, \`log_type\`, \`module\`, \`action\`, \`method\`, \`path\`, \`operator\`, \`ip\`, \`user_agent\`, \`status\`, \`success\`, \`detail\`, \`cost_time\`, \`create_time\`
       FROM \`sys_log\` ${whereClause}
       ORDER BY \`id\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return { list, total, page, pageSize };
  }

  /** 获取单条日志 */
  async getById(id: number) {
    const [row] = await this.dataSource.query<SysLogRow[]>(
      'SELECT * FROM `sys_log` WHERE `id` = ?',
      [id]
    );
    if (!row) {
      throw new HttpException('日志不存在', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  /** 各类型数量统计（用于标签页角标） */
  async getStats() {
    const rows = await this.dataSource.query<{ log_type: string; cnt: number }[]>(
      'SELECT `log_type`, COUNT(*) AS cnt FROM `sys_log` GROUP BY `log_type`'
    );
    const stats: Record<string, number> = { operation: 0, error: 0, access: 0 };
    for (const r of rows) {
      stats[r.log_type] = Number(r.cnt) || 0;
    }
    return stats;
  }

  /**
   * 流式导出日志为 CSV
   *
   * 通过 id 游标分页（每批 batchSize 行）边查边写，避免一次性加载全部行并整体拼接，
   * 内存占用恒定（≈单批数据量），防止大日志量导出时 OOM。
   */
  async exportToCsv(res: Response, params: SystemLogQueryParams): Promise<void> {
    const { where, values } = this.buildWhere(params);
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const condition = whereClause ? `${whereClause} AND \`id\` < ?` : 'WHERE `id` < ?';
    const batchSize = 1000;
    const maxRows = 10_000;

    const header = ['ID', '类型', '模块', '动作', '方法', '路径', '操作人', 'IP', '状态码', '是否成功', '耗时(ms)', '时间', '详情'];
    res.write('\uFEFF'); // BOM，保证 Excel 打开中文不乱码
    res.write(header.map(cell => SystemLogService.csvEscape(cell)).join(',') + '\r\n');

    let lastId = Number.MAX_SAFE_INTEGER; // ORDER BY id DESC 游标起点
    let total = 0;
    while (total < maxRows) {
      const rows = await this.dataSource.query<SysLogRow[]>(
        `SELECT \`id\`, \`log_type\`, \`module\`, \`action\`, \`method\`, \`path\`, \`operator\`, \`ip\`, \`status\`, \`success\`, \`cost_time\`, \`create_time\`, \`detail\`
         FROM \`sys_log\` ${condition}
         ORDER BY \`id\` DESC
         LIMIT ?`,
        [...values, lastId, Math.min(batchSize, maxRows - total)]
      );
      if (rows.length === 0) break;

      for (const row of rows) {
        res.write(
          [
            row.id,
            LOG_TYPE_NAMES[row.log_type] || row.log_type,
            row.module,
            row.action,
            row.method,
            row.path,
            row.operator,
            row.ip,
            row.status,
            row.success === 1 ? '成功' : '失败',
            row.cost_time,
            row.create_time,
            row.detail
          ]
            .map(cell => SystemLogService.csvEscape(String(cell ?? '')))
            .join(',') + '\r\n'
        );
        total++;
      }

      lastId = rows[rows.length - 1].id;
      if (rows.length < batchSize) break;
    }
    res.end();
  }

  /** CSV 单元格转义（防公式注入） */
  static csvEscape(value: string): string {
    let v = value.replace(/"/g, '""');
    // 防止 CSV 公式注入
    if (/^[=+\-@]/.test(v)) {
      v = "'" + v;
    }
    return `"${v}"`;
  }

  /** 删除日志（支持按类型/时间范围清理） */
  async clean(params: SystemLogCleanParams) {
    const where: string[] = [];
    const values: QueryValues = [];

    if (params.logType) {
      where.push('`log_type` = ?');
      values.push(params.logType);
    }
    if (params.startTime) {
      where.push('`create_time` >= ?');
      values.push(params.startTime);
    }
    if (params.endTime) {
      where.push('`create_time` <= ?');
      values.push(params.endTime);
    }

    if (where.length === 0) {
      // 不允许无条件全表清理，避免误操作
      throw new HttpException('请至少指定一个清理条件（类型或时间范围）', HttpStatus.BAD_REQUEST);
    }

    const result = await this.dataSource.query<{ affectedRows: number }>(
      `DELETE FROM \`sys_log\` WHERE ${where.join(' AND ')}`,
      values
    );
    return { success: true, deleted: result.affectedRows ?? 0 };
  }

  /** 删除单条日志 */
  async delete(id: number) {
    const [row] = await this.dataSource.query<Pick<SysLogRow, 'id'>[]>(
      'SELECT `id` FROM `sys_log` WHERE `id` = ?',
      [id]
    );
    if (!row) {
      throw new HttpException('日志不存在', HttpStatus.NOT_FOUND);
    }
    await this.dataSource.query('DELETE FROM `sys_log` WHERE `id` = ?', [id]);
    return { success: true };
  }
}
