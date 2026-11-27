import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** 历史事件 CRUD Admin Service（直接用 DataSource.query） */
@Injectable()
export class HistoryEventsAdminService {
  private readonly logger = new Logger(HistoryEventsAdminService.name);

  constructor(private readonly dataSource: DataSource) {}

  /** 分页列表：支持 yearRange / category / keyword / status 过滤 */
  async getList(params: {
    page: number;
    pageSize: number;
    yearFrom?: number;
    yearTo?: number;
    category?: string;
    keyword?: string;
    status?: number;
  }) {
    const clauses: string[] = [];
    const q: any[] = [];

    if (params.status !== undefined) { clauses.push('`status` = ?'); q.push(params.status); }
    if (params.yearFrom !== undefined)   { clauses.push('`year` >= ?'); q.push(params.yearFrom); }
    if (params.yearTo !== undefined)     { clauses.push('`year` <= ?'); q.push(params.yearTo); }
    if (params.category)                 { clauses.push('`category` = ?'); q.push(params.category); }
    if (params.keyword) {
      clauses.push('(`title` LIKE ? OR `description` LIKE ? OR `dynasty` LIKE ?)');
      q.push(`%${params.keyword}%`, `%${params.keyword}%`, `%${params.keyword}%`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const totalRow = await this.dataSource.query<any[]>(
      `SELECT COUNT(*) AS cnt FROM \`history_events\` ${where}`, q
    );
    const total = Number(totalRow[0]?.cnt || 0);

    const list = await this.dataSource.query<any[]>(
      `SELECT * FROM \`history_events\` ${where}
       ORDER BY \`year\` ASC, \`sort_order\` DESC, \`id\` ASC
       LIMIT ? OFFSET ?`,
      [...q, params.pageSize, (params.page - 1) * params.pageSize]
    );

    return {
      list,
      total,
      page: params.page,
      pageSize: params.pageSize
    };
  }

  /** 详情 */
  async getById(id: number) {
    const rows = await this.dataSource.query<any[]>(
      `SELECT * FROM \`history_events\` WHERE \`id\` = ? LIMIT 1`, [id]
    );
    if (!rows.length) throw new NotFoundException(`历史事件 id=${id} 不存在`);
    return rows[0];
  }

  /** 新增 */
  async create(data: any) {
    const r = await this.dataSource.query<any>(
      `INSERT INTO \`history_events\`
        (\`year\`, \`title\`, \`dynasty\`, \`description\`, \`category\`, \`region\`, \`keywords\`, \`sort_order\`, \`status\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(data.year),
        data.title,
        data.dynasty || '',
        data.description || '',
        data.category || 'society',
        data.region || '',
        data.keywords || '',
        data.sort_order !== undefined ? Number(data.sort_order) : 0,
        data.status !== undefined ? Number(data.status) : 1
      ]
    );
    const id = Number(r?.insertId ?? r);
    await this.clearCache();
    return { id, ...data };
  }

  /** 编辑 */
  async update(id: number, data: any) {
    await this.getById(id); // 存在性校验
    await this.dataSource.query(
      `UPDATE \`history_events\` SET
        \`year\` = ?, \`title\` = ?, \`dynasty\` = ?, \`description\` = ?,
        \`category\` = ?, \`region\` = ?, \`keywords\` = ?,
        \`sort_order\` = ?, \`status\` = ?
       WHERE \`id\` = ?`,
      [
        Number(data.year),
        data.title,
        data.dynasty || '',
        data.description || '',
        data.category || 'society',
        data.region || '',
        data.keywords || '',
        data.sort_order !== undefined ? Number(data.sort_order) : 0,
        data.status !== undefined ? Number(data.status) : 1,
        id
      ]
    );
    await this.clearCache();
    return { id, ...data };
  }

  /** 删除（软删除：status = 0） */
  async delete(id: number) {
    await this.getById(id);
    await this.dataSource.query(
      `UPDATE \`history_events\` SET \`status\` = 0 WHERE \`id\` = ?`, [id]
    );
    await this.clearCache();
    return { id, ok: true };
  }

  /** 启用/禁用 */
  async toggleStatus(id: number, status: number) {
    await this.getById(id);
    await this.dataSource.query(
      `UPDATE \`history_events\` SET \`status\` = ? WHERE \`id\` = ?`, [status, id]
    );
    await this.clearCache();
    return { id, status, ok: true };
  }

  /** 清理 timeline_map_cache（改了历史事件后，小程序消费端的聚合缓存要失效） */
  private async clearCache() {
    try {
      await this.dataSource.query(`DELETE FROM \`timeline_map_cache\``, []);
    } catch { /* 缓存表不存在时忽略 */ }
  }
}
