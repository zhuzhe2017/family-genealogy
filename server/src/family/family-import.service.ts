import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import * as iconv from 'iconv-lite';
import { SystemLogService } from '../system-log/system-log.service';
import { type FamilyImportItem, type FamilyImportFileReport, type FamilyRow } from './types/family.types';

/** 支持的文件扩展名 */
export const IMPORT_SUPPORTED_EXTS = ['xlsx', 'xls', 'csv'];
/** 单次导入文件大小上限 20MB */
export const MAX_IMPORT_FILE_SIZE = 20 * 1024 * 1024;
/** 单次导入行数上限 */
export const MAX_IMPORT_ROWS = 10000;
/** 分享码字符表（去除易混淆字符 0/O/1/I） */
const SHARE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 表头别名 -> 字段名（归一化：去空格、转小写后匹配） */
const HEADER_MAP: Record<string, string> = {
  id: 'id',
  家族id: 'id',
  编号: 'id',
  name: 'name',
  家族名称: 'name',
  名称: 'name',
  surname: 'surnameName',
  surname_name: 'surnameName',
  姓氏: 'surnameName',
  姓氏名称: 'surnameName',
  founder: 'founder',
  始祖: 'founder',
  祖先: 'founder',
  hall_name: 'hallName',
  hallname: 'hallName',
  堂号: 'hallName',
  origin: 'origin',
  发源地: 'origin',
  祖籍: 'origin',
  description: 'description',
  简介: 'description',
  描述: 'description',
  is_public: 'isPublic',
  ispublic: 'isPublic',
  是否公开: 'isPublic',
  公开: 'isPublic',
  allow_join: 'allowJoin',
  allowjoin: 'allowJoin',
  允许加入: 'allowJoin',
  status: 'status',
  状态: 'status'
};

function normalizeHeader(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim().toLowerCase().replace(/[\s_-]+/g, '');
  return '';
}

/** 安全地将单元格值转为字符串（仅处理字符串/数字/布尔值，其他类型返回空串） */
function safeCellString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function csvEscape(value: string): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parse01(value: string, defaultValue = 0): number {
  const s = String(value ?? '').trim();
  if (['1', '是', 'y', 'yes', 'true', '公开', '启用'].includes(s)) return 1;
  if (['0', '否', 'n', 'no', 'false', '不公开', '禁用'].includes(s)) return 0;
  return defaultValue;
}

@Injectable()
export class FamilyImportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly systemLogService: SystemLogService
  ) {}

  /** 解析 Excel/CSV 文件为家族导入数据（纯内存解析，不落库） */
  parseSpreadsheet(buffer: Buffer, originalName: string): {
    items: FamilyImportItem[];
    rowNos: number[];
    errors: string[];
    total: number;
  } {
    const ext = this.getExt(originalName);
    if (!IMPORT_SUPPORTED_EXTS.includes(ext)) {
      throw new HttpException('仅支持 .xlsx / .xls / .csv 格式的文件', HttpStatus.BAD_REQUEST);
    }

    const rows = this.readRows(buffer, ext);
    if (rows.length === 0) {
      throw new HttpException('文件内容为空，请检查后重新上传', HttpStatus.BAD_REQUEST);
    }

    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i] || []).some(c => safeCellString(c).trim() !== '')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      throw new HttpException('文件内容为空，请检查后重新上传', HttpStatus.BAD_REQUEST);
    }

    const header = (rows[headerIdx] || []).map(normalizeHeader);
    const col: Record<string, number> = {};
    header.forEach((h, idx) => {
      const field = HEADER_MAP[h];
      if (field && col[field] === undefined) col[field] = idx;
    });
    if (col.name === undefined) {
      throw new HttpException('未识别到「家族名称」列，请下载模板后按规范填写', HttpStatus.BAD_REQUEST);
    }
    if (rows.length - headerIdx - 1 > MAX_IMPORT_ROWS) {
      throw new HttpException(`单次导入最多支持 ${MAX_IMPORT_ROWS} 行数据`, HttpStatus.BAD_REQUEST);
    }

    const items: FamilyImportItem[] = [];
    const rowNos: number[] = [];
    const errors: string[] = [];
    let rejected = 0;
    const seenName = new Map<string, number>();

    const cell = (r: unknown[], field: string): string => {
      const i = col[field];
    return i !== undefined && i < r.length ? safeCellString(r[i]).trim() : '';
    };

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const raw = rows[r] || [];
      const rowNo = r + 1;
      if (raw.every(c => safeCellString(c).trim() === '')) continue;

      const name = cell(raw, 'name');
      if (!name) {
        errors.push(`第 ${rowNo} 行：家族名称不能为空`);
        rejected++;
        continue;
      }
      if (name.length > 100) {
        errors.push(`第 ${rowNo} 行：家族名称不能超过100个字符`);
        rejected++;
        continue;
      }

      const idRaw = cell(raw, 'id');
      let id: number | undefined;
      if (idRaw) {
        const n = Number(idRaw);
        if (!Number.isInteger(n) || n <= 0) {
          errors.push(`第 ${rowNo} 行：id 必须是正整数`);
          rejected++;
          continue;
        }
        id = n;
      }

      const firstRow = seenName.get(name);
      if (firstRow) {
        errors.push(`第 ${rowNo} 行：与第 ${firstRow} 行家族名称重复`);
        rejected++;
        continue;
      }
      seenName.set(name, rowNo);

      items.push({
        id,
        name,
        surnameName: cell(raw, 'surnameName') || undefined,
        founder: cell(raw, 'founder') || undefined,
        hallName: cell(raw, 'hallName') || undefined,
        origin: cell(raw, 'origin') || undefined,
        description: cell(raw, 'description') || undefined,
        isPublic: parse01(cell(raw, 'isPublic'), 0),
        allowJoin: parse01(cell(raw, 'allowJoin'), 0),
        status: parse01(cell(raw, 'status'), 1)
      });
      rowNos.push(rowNo);
    }

    return { items, rowNos, errors, total: items.length + rejected };
  }

  /** 文件批量导入：校验 -> 解析 -> 事务内逐行导入/更新 -> 审计日志 */
  async importFromFile(
    file: { buffer: Buffer; originalname: string; size: number },
    creatorId?: number,
    operator?: { username?: string; id?: number | string }
  ): Promise<FamilyImportFileReport> {
    const ext = this.getExt(file.originalname);
    if (!IMPORT_SUPPORTED_EXTS.includes(ext)) {
      throw new HttpException('仅支持 .xlsx / .xls / .csv 格式的文件', HttpStatus.BAD_REQUEST);
    }
    if (!file.buffer || file.size <= 0) {
      throw new HttpException('文件内容为空，请检查后重新上传', HttpStatus.BAD_REQUEST);
    }
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      throw new HttpException(`文件大小不能超过 ${MAX_IMPORT_FILE_SIZE / 1024 / 1024}MB`, HttpStatus.BAD_REQUEST);
    }

    const parsed = this.parseSpreadsheet(file.buffer, file.originalname);
    if (parsed.items.length === 0) {
      const head = parsed.errors.slice(0, 5).join('；');
      throw new HttpException(`未解析到可导入的家族数据${head ? '：' + head : ''}`, HttpStatus.BAD_REQUEST);
    }

    const start = Date.now();
    let created = 0;
    let updated = 0;
    const errors = [...parsed.errors];

    await this.dataSource.transaction(async manager => {
      const surnameMap = await this.buildSurnameMap(manager);
      const existingNameMap = await this.buildExistingNameMap(manager);

      for (let i = 0; i < parsed.items.length; i++) {
        const item = parsed.items[i];
        const rowNo = parsed.rowNos[i];
        try {
          const result = await this.upsertFamily(manager, item, surnameMap, existingNameMap, creatorId);
          if (result.type === 'created') created++;
          else if (result.type === 'updated') updated++;
        } catch (err: unknown) {
          const message = err instanceof HttpException ? err.message : '导入失败';
          errors.push(`第 ${rowNo} 行：${message}`);
        }
      }
    });

    const imported = created + updated;

    void this.systemLogService.write({
      logType: 'operation',
      module: 'family',
      action: '批量导入家族',
      method: 'POST',
      path: '/api/family/import',
      operator: operator?.username || 'admin',
      operatorId: typeof operator?.id === 'number' ? operator.id : null,
      status: 200,
      success: true,
      detail: `文件「${file.originalname}」共 ${parsed.total} 行：新增 ${created} 条，更新 ${updated} 条，失败 ${errors.length} 条`,
      costTime: Date.now() - start
    });

    return {
      fileName: file.originalname,
      total: parsed.total,
      imported,
      created,
      updated,
      errors
    };
  }

  /** 生成 CSV 导入模板（UTF-8 BOM，Excel 打开中文不乱码） */
  buildTemplate(): string {
    const header = [
      'id',
      'name',
      'surname',
      'founder',
      'hall_name',
      'origin',
      'description',
      'is_public',
      'allow_join',
      'status'
    ];
    const example = [
      ['1', '朱氏宗祠', '朱', '朱伯言', '白鹿堂', '浙江绍兴', '绍兴朱氏家族', '1', '1', '1'],
      ['', '陈氏宗族', '陈', '陈元光', '颍川堂', '河南颍川', '颍川陈氏家族', '0', '1', '1']
    ];
    const lines = [header, ...example].map(row => row.map(csvEscape).join(','));
    return '\uFEFF' + lines.join('\r\n');
  }

  private getExt(name: string): string {
    return (name.split('.').pop() || '').toLowerCase();
  }

  private readRows(buffer: Buffer, ext: string): unknown[][] {
    if (ext === 'csv') {
      let text = buffer.toString('utf8').replace(/^\uFEFF/, '');
      if (text.includes('\uFFFD')) {
        text = iconv.decode(buffer, 'gbk').replace(/^\uFEFF/, '');
      }
      const wb = XLSX.read(text, { type: 'string' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return ws ? XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' }) : [];
    }
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return ws ? XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' }) : [];
  }

  private async buildSurnameMap(manager: import('typeorm').EntityManager): Promise<Map<string, number>> {
    const rows = await manager.query<{ surname: string; id: number }[]>(
      'SELECT `surname`, `id` FROM `surname` WHERE `status` = 1'
    );
    const map = new Map<string, number>();
    rows.forEach(r => map.set(String(r.surname).trim(), r.id));
    return map;
  }

  private async buildExistingNameMap(manager: import('typeorm').EntityManager): Promise<Map<string, { id: number; status: number }>> {
    const rows = await manager.query<{ id: number; name: string; status: number }[]>(
      'SELECT `id`, `name`, `status` FROM `family`'
    );
    const map = new Map<string, { id: number; status: number }>();
    rows.forEach(r => map.set(String(r.name).trim(), { id: r.id, status: r.status }));
    return map;
  }

  private async upsertFamily(
    manager: import('typeorm').EntityManager,
    item: FamilyImportItem,
    surnameMap: Map<string, number>,
    existingNameMap: Map<string, { id: number; status: number }>,
    creatorId?: number
  ): Promise<{ type: 'created' | 'updated' | 'skipped' }> {
    let surnameId: number | undefined;
    if (item.surnameName) {
      const id = surnameMap.get(item.surnameName.trim());
      if (!id) throw new HttpException(`姓氏「${item.surnameName}」不存在`, HttpStatus.BAD_REQUEST);
      surnameId = id;
    }

    if (item.id) {
      const [existing] = await manager.query<Pick<FamilyRow, 'id'>[]>(
        'SELECT `id` FROM `family` WHERE `id` = ?',
        [item.id]
      );
      if (!existing) {
        await this.createFamily(manager, item, surnameId, creatorId);
        return { type: 'created' };
      }
      await this.updateFamily(manager, item.id, item, surnameId);
      return { type: 'updated' };
    }

    const byName = existingNameMap.get(item.name.trim());
    if (byName) {
      await this.updateFamily(manager, byName.id, item, surnameId);
      return { type: 'updated' };
    }

    await this.createFamily(manager, item, surnameId, creatorId);
    return { type: 'created' };
  }

  private async createFamily(
    manager: import('typeorm').EntityManager,
    item: FamilyImportItem,
    surnameId: number | undefined,
    creatorId?: number
  ): Promise<void> {
    const seedShareCode = await this.generateUniqueSeedShareCode(manager);
    await manager.query(
      `INSERT INTO \`family\`
       (\`surname_id\`, \`name\`, \`logo\`, \`founder\`, \`hall_name\`, \`origin\`, \`description\`,
        \`is_public\`, \`allow_join\`, \`seed_share_code\`, \`creator_id\`, \`status\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        surnameId ?? null,
        item.name.trim(),
        '',
        item.founder ?? '',
        this.normalizeHallName(item.hallName),
        item.origin ?? '',
        item.description ?? null,
        item.isPublic ?? 0,
        item.allowJoin ?? 0,
        seedShareCode,
        creatorId ?? null,
        item.status ?? 1
      ]
    );
  }

  private async updateFamily(
    manager: import('typeorm').EntityManager,
    id: number,
    item: FamilyImportItem,
    surnameId: number | undefined
  ): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (surnameId !== undefined) {
      fields.push('`surname_id` = ?');
      values.push(surnameId);
    }
    if (item.name !== undefined) {
      fields.push('`name` = ?');
      values.push(item.name.trim());
    }
    if (item.founder !== undefined) {
      fields.push('`founder` = ?');
      values.push(item.founder);
    }
    if (item.hallName !== undefined) {
      fields.push('`hall_name` = ?');
      values.push(this.normalizeHallName(item.hallName));
    }
    if (item.origin !== undefined) {
      fields.push('`origin` = ?');
      values.push(item.origin);
    }
    if (item.description !== undefined) {
      fields.push('`description` = ?');
      values.push(item.description || null);
    }
    if (item.isPublic !== undefined) {
      fields.push('`is_public` = ?');
      values.push(item.isPublic);
    }
    if (item.allowJoin !== undefined) {
      fields.push('`allow_join` = ?');
      values.push(item.allowJoin);
    }
    if (item.status !== undefined) {
      fields.push('`status` = ?');
      values.push(item.status);
    }

    if (fields.length === 0) return;
    values.push(id);
    await manager.query(`UPDATE \`family\` SET ${fields.join(', ')} WHERE \`id\` = ?`, values);
  }

  private async generateUniqueSeedShareCode(manager: import('typeorm').EntityManager): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const chars: string[] = [];
      for (let j = 0; j < 8; j++) {
        chars.push(SHARE_CODE_ALPHABET[Math.floor(Math.random() * SHARE_CODE_ALPHABET.length)]);
      }
      const code = chars.join('');
      const [dup] = await manager.query<{ id: number }[]>('SELECT `id` FROM `family` WHERE `seed_share_code` = ? LIMIT 1', [code]);
      if (!dup) return code;
    }
    throw new HttpException('家族种子分享码生成失败，请重试', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  /** 堂号规范化（与 FamilyService 一致） */
  private normalizeHallName(hallName?: string): string {
    if (hallName === undefined || hallName === null) return '';
    const trimmed = String(hallName).trim();
    if (!trimmed) return '';
    if (trimmed.length > 50) throw new HttpException('堂号长度不能超过50个字符', HttpStatus.BAD_REQUEST);
    if (!/^[\u4e00-\u9fa5A-Za-z0-9\s·._\-()（）,，、。:：]+$/.test(trimmed)) {
      throw new HttpException('堂号包含不允许的特殊字符', HttpStatus.BAD_REQUEST);
    }
    return trimmed;
  }
}
