import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type SurnameRow,
  type SurnameCreateData,
  type SurnameUpdateData,
  type SurnameQueryParams,
  type SurnameAllQueryParams
} from './types/surname.types';
import { type QueryValues, type DataRow } from '../common/types/common';

@Injectable()
export class SurnameService {
  constructor(private readonly dataSource: DataSource) {}

  /** 分页列表 */
  async getList(params: SurnameQueryParams) {
    const { keyword, initial, status } = params;
    // 防御性校验：page 至少为 1，pageSize 限制 1-100，避免非法 OFFSET 导致 MySQL 报错
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(params.pageSize) || 10));
    const offset = (page - 1) * pageSize;
    const where: string[] = [];
    const values: QueryValues = [];

    if (keyword) {
      where.push('(`surname` LIKE ? OR `pinyin` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (initial) {
      where.push('`initial` = ?');
      values.push(initial.toUpperCase());
    }
    if (status !== undefined && status !== null) {
      where.push('`status` = ?');
      values.push(status);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`surname\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<SurnameRow[]>(
      `SELECT * FROM \`surname\` ${whereClause} ORDER BY \`ranking\` ASC, \`id\` ASC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return { list, total, page, pageSize };
  }

  /** 获取所有姓氏（不分页，用于导出） */
  async getAll(params: SurnameAllQueryParams) {
    const { keyword, initial, status } = params;
    const where: string[] = [];
    const values: QueryValues = [];

    if (keyword) {
      where.push('(`surname` LIKE ? OR `pinyin` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (initial) {
      where.push('`initial` = ?');
      values.push(initial.toUpperCase());
    }
    if (status !== undefined && status !== null) {
      where.push('`status` = ?');
      values.push(status);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    return this.dataSource.query<SurnameRow[]>(
      `SELECT * FROM \`surname\` ${whereClause} ORDER BY \`ranking\` ASC, \`id\` ASC`,
      values
    );
  }

  /** 获取单条 */
  async getById(id: number) {
    const [row] = await this.dataSource.query<SurnameRow[]>(
      'SELECT * FROM `surname` WHERE `id` = ?', [id]
    );
    if (!row) throw new HttpException('姓氏不存在', HttpStatus.NOT_FOUND);
    return row;
  }

  /** 创建 */
  async create(data: SurnameCreateData) {
    if (!data.surname || !data.surname.trim()) {
      throw new HttpException('姓氏不能为空', HttpStatus.BAD_REQUEST);
    }

    const [exist] = await this.dataSource.query<Pick<SurnameRow, 'id'>[]>(
      'SELECT `id` FROM `surname` WHERE `surname` = ?', [data.surname]
    );
    if (exist) throw new HttpException('该姓氏已存在', HttpStatus.BAD_REQUEST);

    const result = await this.dataSource.query<InsertResult>(
      'INSERT INTO `surname` (`surname`, `pinyin`, `initial`, `ranking`, `totem`, `origin`, `population`, `description`, `create_by`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [data.surname, data.pinyin || '', data.initial || '', data.ranking || 0, data.totem || '', data.origin || '', data.population || 0, data.description || null, data.createBy || '']
    );
    return { id: result.insertId };
  }

  /** 更新 */
  async update(id: number, data: SurnameUpdateData) {
    const [row] = await this.dataSource.query<Pick<SurnameRow, 'id'>[]>(
      'SELECT `id` FROM `surname` WHERE `id` = ?', [id]
    );
    if (!row) throw new HttpException('姓氏不存在', HttpStatus.NOT_FOUND);

    if (data.surname) {
      const [dup] = await this.dataSource.query<Pick<SurnameRow, 'id'>[]>(
        'SELECT `id` FROM `surname` WHERE `surname` = ? AND `id` != ?', [data.surname, id]
      );
      if (dup) throw new HttpException('该姓氏已存在', HttpStatus.BAD_REQUEST);
    }

    const fields: string[] = [];
    const values: QueryValues = [];
    if (data.surname !== undefined) { fields.push('`surname` = ?'); values.push(data.surname); }
    if (data.pinyin !== undefined) { fields.push('`pinyin` = ?'); values.push(data.pinyin); }
    if (data.initial !== undefined) { fields.push('`initial` = ?'); values.push(data.initial.toUpperCase()); }
    if (data.ranking !== undefined) { fields.push('`ranking` = ?'); values.push(data.ranking); }
    if (data.totem !== undefined) { fields.push('`totem` = ?'); values.push(data.totem); }
    if (data.origin !== undefined) { fields.push('`origin` = ?'); values.push(data.origin); }
    if (data.population !== undefined) { fields.push('`population` = ?'); values.push(data.population); }
    if (data.description !== undefined) { fields.push('`description` = ?'); values.push(data.description); }
    if (data.status !== undefined) { fields.push('`status` = ?'); values.push(data.status); }

    if (fields.length === 0) throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);

    values.push(id);
    await this.dataSource.query(
      `UPDATE \`surname\` SET ${fields.join(', ')} WHERE \`id\` = ?`,
      values
    );
    return { success: true };
  }

  /** 删除 */
  async delete(id: number) {
    const [row] = await this.dataSource.query<Pick<SurnameRow, 'id'>[]>(
      'SELECT `id` FROM `surname` WHERE `id` = ?', [id]
    );
    if (!row) throw new HttpException('姓氏不存在', HttpStatus.NOT_FOUND);
    await this.dataSource.query('DELETE FROM `surname` WHERE `id` = ?', [id]);
    return { success: true };
  }

  /** 批量导入 */
  async batchImport(items: SurnameCreateData[]) {
    if (!items || items.length === 0) throw new HttpException('导入数据不能为空', HttpStatus.BAD_REQUEST);

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.surname || !item.surname.trim()) {
        errors.push(`第 ${i + 1} 行：姓氏不能为空`);
        continue;
      }
      try {
        const [exist] = await this.dataSource.query<Pick<SurnameRow, 'id'>[]>(
          'SELECT `id` FROM `surname` WHERE `surname` = ?', [item.surname.trim()]
        );
        if (exist) {
          skipped++;
          continue;
        }
        await this.dataSource.query(
          'INSERT INTO `surname` (`surname`, `pinyin`, `initial`, `ranking`, `totem`, `origin`, `population`, `description`) VALUES (?, ?, UPPER(?), ?, ?, ?, ?, ?)',
          [item.surname.trim(), item.pinyin || '', (item.initial || '').charAt(0) || '', item.ranking || 0, item.totem || '', item.origin || '', item.population || 0, item.description || null]
        );
        imported++;
      } catch (err: unknown) {
        errors.push(`第 ${i + 1} 行「${item.surname}」：${errMsg(err)}`);
      }
    }

    return { imported, skipped, errors, total: items.length };
  }

  /** 切换状态 */
  async toggleStatus(id: number) {
    const [row] = await this.dataSource.query<Pick<SurnameRow, 'id' | 'status'>[]>(
      'SELECT `id`, `status` FROM `surname` WHERE `id` = ?', [id]
    );
    if (!row) throw new HttpException('姓氏不存在', HttpStatus.NOT_FOUND);
    const newStatus = row.status === 1 ? 0 : 1;
    await this.dataSource.query(
      'UPDATE `surname` SET `status` = ? WHERE `id` = ?',
      [newStatus, id]
    );
    return { id, status: newStatus };
  }
}

function errMsg(err: unknown): string {
  if (err instanceof HttpException) {
    return err.message;
  }
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return '导入失败';
}

interface InsertResult extends DataRow {
  insertId: number;
}
