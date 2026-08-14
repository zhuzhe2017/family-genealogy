import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import {
  type GenerationTableData,
  type GenerationTableRow,
  type GenerationTableQueryParams,
  type GenerationTableAllQueryParams,
  type BatchImportResult
} from './types/generation-table.types';
import { type QueryValues } from '../common/types/common';

// 汉字约束正则（与 DTO 保持一致，service 层做防御性二次校验）
const RE_SURNAME = /^(?:[\u4e00-\u9fa5]{1,4}|\S{1,20})$/; // 姓氏 1-4 汉字或任意非空白 1-20 字符（兼容单姓、复姓、少数民族姓氏）
const RE_FOUNDER = /^[\u4e00-\u9fa5]{1,20}$/; // 始祖/支系名 1-20 汉字
const RE_GEN = /^[\u4e00-\u9fa5\s,，]{1,20}$/; // 每代字辈：1-20 个汉字，可含空格/逗号分隔多字（诗句模式）

/** 提取 HttpException / 普通错误的可读消息 */
function errMsg(err: unknown): string {
  if (err instanceof HttpException) {
    return err.message;
  }
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return '校验失败';
}

@Injectable()
export class GenerationTableService {
  constructor(private readonly dataSource: DataSource) {}

  /** 生成 32 位字辈表ID（小写十六进制） */
  private generateId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * 字段约束校验（公开以便单元测试）
   * - 姓氏：1-4 汉字或 1-20 非空白字符（兼容单姓/复姓/少数民族）
   * - 始祖/支系名：1-20 汉字
   * - 字辈序列：数组 ≥1 代，每代为 1-20 个汉字，可含空格/逗号表示同代多字辈（诗句模式）
   * - 常见区域：数组 ≥1 项，每项非空字符串
   * partial=true 时仅校验已提供（非 undefined）字段
   */
  validateFields(data: GenerationTableData, opts: { partial?: boolean } = {}): void {
    const partial = opts.partial === true;
    const present = (v: unknown): v is string | number | boolean | object | unknown[] => v !== undefined && v !== null;

    if (!partial || present(data.surname)) {
      if (!data.surname || !RE_SURNAME.test(data.surname)) {
        throw new HttpException('姓氏必须为1-4个汉字或1-20个非空白字符', HttpStatus.BAD_REQUEST);
      }
    }
    if (!partial || present(data.founder)) {
      if (!data.founder || !RE_FOUNDER.test(data.founder)) {
        throw new HttpException('始祖/支系名必须为1-20个汉字', HttpStatus.BAD_REQUEST);
      }
    }
    if (!partial || present(data.generationSequence)) {
      const seq = data.generationSequence;
      if (!Array.isArray(seq) || seq.length < 1) {
        throw new HttpException('字辈序列至少1代', HttpStatus.BAD_REQUEST);
      }
      for (let i = 0; i < seq.length; i++) {
        const v = seq[i];
        if (typeof v !== 'string' || !RE_GEN.test(v)) {
          throw new HttpException(`第${i + 1}代字辈必须为1-20个汉字，同代多字可用空格或逗号分隔`, HttpStatus.BAD_REQUEST);
        }
      }
    }
    if (!partial || present(data.commonRegions)) {
      const regions = data.commonRegions;
      if (!Array.isArray(regions) || regions.length < 1) {
        throw new HttpException('常见区域至少1项', HttpStatus.BAD_REQUEST);
      }
      for (const r of regions) {
        if (typeof r !== 'string' || !r.trim()) {
          throw new HttpException('区域必须为非空字符串', HttpStatus.BAD_REQUEST);
        }
      }
    }
  }

  /** 解析 JSON 列为 JS 值（mysql2 通常已解析，这里做兼容兜底） */
  private parseRow(row: GenerationTableRow | null): GenerationTableRow | null {
    if (!row) return row;
    const gs = row.generation_sequence;
    const cr = row.common_regions;
    return {
      ...row,
      generation_sequence: typeof gs === 'string' ? JSON.parse(gs) as string[] : gs,
      common_regions: typeof cr === 'string' ? JSON.parse(cr) as string[] : cr
    };
  }

  /** 分页列表 */
  async getList(params: GenerationTableQueryParams) {
    const { page, pageSize, keyword, region, status } = params;
    const offset = (page - 1) * pageSize;
    const where: string[] = [];
    const values: QueryValues = [];

    if (keyword) {
      where.push('(`surname` LIKE ? OR `founder` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (region) {
      where.push('JSON_CONTAINS(`common_regions`, JSON_QUOTE(?))');
      values.push(region);
    }
    if (status !== undefined && status !== null) {
      where.push('`status` = ?');
      values.push(status);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`generation_table\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const rows = await this.dataSource.query<GenerationTableRow[]>(
      `SELECT * FROM \`generation_table\` ${whereClause}
       ORDER BY \`surname\` ASC, \`founder\` ASC, \`create_time\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return { list: rows.map((r: GenerationTableRow) => this.parseRow(r)), total, page, pageSize };
  }

  /** 全部（不分页，用于导出） */
  async getAll(params: GenerationTableAllQueryParams) {
    const { keyword, region, status } = params;
    const where: string[] = [];
    const values: QueryValues = [];

    if (keyword) {
      where.push('(`surname` LIKE ? OR `founder` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (region) {
      where.push('JSON_CONTAINS(`common_regions`, JSON_QUOTE(?))');
      values.push(region);
    }
    if (status !== undefined && status !== null) {
      where.push('`status` = ?');
      values.push(status);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const rows = await this.dataSource.query<GenerationTableRow[]>(
      `SELECT * FROM \`generation_table\` ${whereClause}
       ORDER BY \`surname\` ASC, \`founder\` ASC`,
      values
    );
    return rows.map((r: GenerationTableRow) => this.parseRow(r));
  }

  /** 获取单条 */
  async getById(id: string) {
    const [row] = await this.dataSource.query<GenerationTableRow[]>(
      'SELECT * FROM `generation_table` WHERE `id` = ?',
      [id]
    );
    if (!row) throw new HttpException('字辈表不存在', HttpStatus.NOT_FOUND);
    return this.parseRow(row);
  }

  /** 创建 */
  async create(data: GenerationTableData) {
    this.validateFields(data);

    const [dup] = await this.dataSource.query<Pick<GenerationTableRow, 'id'>[]>(
      'SELECT `id` FROM `generation_table` WHERE `surname` = ? AND `founder` = ?',
      [data.surname, data.founder]
    );
    if (dup) throw new HttpException('该姓氏与始祖的字辈记录已存在', HttpStatus.BAD_REQUEST);

    const id = this.generateId();
    await this.dataSource.query(
      `INSERT INTO \`generation_table\`
       (\`id\`, \`surname\`, \`founder\`, \`generation_sequence\`, \`common_regions\`, \`create_by\`, \`status\`)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.surname,
        data.founder,
        JSON.stringify(data.generationSequence),
        JSON.stringify(data.commonRegions),
        data.createBy || '',
        1
      ]
    );
    return { id };
  }

  /** 更新 */
  async update(id: string, data: GenerationTableData) {
    const [row] = await this.dataSource.query<Pick<GenerationTableRow, 'id' | 'surname' | 'founder'>[]>(
      'SELECT `id`, `surname`, `founder` FROM `generation_table` WHERE `id` = ?',
      [id]
    );
    if (!row) throw new HttpException('字辈表不存在', HttpStatus.NOT_FOUND);

    this.validateFields(data, { partial: true });

    // 姓氏/始祖变更时校验唯一性
    if (data.surname !== undefined || data.founder !== undefined) {
      const surname = data.surname ?? row.surname;
      const founder = data.founder ?? row.founder;
      const [dup] = await this.dataSource.query<Pick<GenerationTableRow, 'id'>[]>(
        'SELECT `id` FROM `generation_table` WHERE `surname` = ? AND `founder` = ? AND `id` != ?',
        [surname, founder, id]
      );
      if (dup) throw new HttpException('该姓氏与始祖的字辈记录已存在', HttpStatus.BAD_REQUEST);
    }

    const fields: string[] = [];
    const values: QueryValues = [];
    if (data.surname !== undefined) { fields.push('`surname` = ?'); values.push(data.surname); }
    if (data.founder !== undefined) { fields.push('`founder` = ?'); values.push(data.founder); }
    if (data.generationSequence !== undefined) { fields.push('`generation_sequence` = ?'); values.push(JSON.stringify(data.generationSequence)); }
    if (data.commonRegions !== undefined) { fields.push('`common_regions` = ?'); values.push(JSON.stringify(data.commonRegions)); }
    if (data.status !== undefined) { fields.push('`status` = ?'); values.push(data.status); }

    if (fields.length === 0) throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);

    values.push(id);
    await this.dataSource.query(
      `UPDATE \`generation_table\` SET ${fields.join(', ')} WHERE \`id\` = ?`,
      values
    );
    return { success: true };
  }

  /** 删除 */
  async delete(id: string) {
    const [row] = await this.dataSource.query<Pick<GenerationTableRow, 'id'>[]>(
      'SELECT `id` FROM `generation_table` WHERE `id` = ?',
      [id]
    );
    if (!row) throw new HttpException('字辈表不存在', HttpStatus.NOT_FOUND);
    await this.dataSource.query('DELETE FROM `generation_table` WHERE `id` = ?', [id]);
    return { success: true };
  }

  /** 切换状态 */
  async toggleStatus(id: string) {
    const [row] = await this.dataSource.query<Pick<GenerationTableRow, 'id' | 'status'>[]>(
      'SELECT `id`, `status` FROM `generation_table` WHERE `id` = ?',
      [id]
    );
    if (!row) throw new HttpException('字辈表不存在', HttpStatus.NOT_FOUND);
    const newStatus = row.status === 1 ? 0 : 1;
    await this.dataSource.query(
      'UPDATE `generation_table` SET `status` = ? WHERE `id` = ?',
      [newStatus, id]
    );
    return { id, status: newStatus };
  }

  /** 批量导入 */
  async batchImport(items: GenerationTableData[]): Promise<BatchImportResult> {
    if (!items || items.length === 0) {
      throw new HttpException('导入数据不能为空', HttpStatus.BAD_REQUEST);
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        this.validateFields(item);
        const [exist] = await this.dataSource.query<Pick<GenerationTableRow, 'id'>[]>(
          'SELECT `id` FROM `generation_table` WHERE `surname` = ? AND `founder` = ?',
          [item.surname, item.founder]
        );
        if (exist) { skipped++; continue; }

        const id = this.generateId();
        await this.dataSource.query(
          `INSERT INTO \`generation_table\`
           (\`id\`, \`surname\`, \`founder\`, \`generation_sequence\`, \`common_regions\`, \`create_by\`, \`status\`)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            item.surname,
            item.founder,
            JSON.stringify(item.generationSequence),
            JSON.stringify(item.commonRegions),
            item.createBy || '',
            1
          ]
        );
        imported++;
      } catch (err: unknown) {
        errors.push(`第 ${i + 1} 行「${item.surname || ''}/${item.founder || ''}」：${errMsg(err)}`);
      }
    }

    return { imported, skipped, errors, total: items.length };
  }
}

export type { GenerationTableData } from './types/generation-table.types';
