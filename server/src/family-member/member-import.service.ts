import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import * as iconv from 'iconv-lite';
import { FamilyMemberService } from './family-member.service';
import { SystemLogService } from '../system-log/system-log.service';
import { getSafeMemberTableName } from '../common/utils/family-member-table';
import { type FamilyMemberImportItem } from './types/family-member.types';

/** 支持的文件扩展名 */
export const IMPORT_SUPPORTED_EXTS = ['xlsx', 'xls', 'csv'];
/** 单次导入文件大小上限 20MB */
export const MAX_IMPORT_FILE_SIZE = 20 * 1024 * 1024;
/** 单次导入行数上限（防止大文件拖垮内存与事务） */
export const MAX_IMPORT_ROWS = 20000;

/** 文件导入结果报告 */
export interface MemberImportFileReport {
  fileName: string;
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
}

/** 解析结果（items 与 rowNos 下标一一对应，rowNos 为文件原始行号） */
export interface ParsedMemberImport {
  items: FamilyMemberImportItem[];
  rowNos: number[];
  errors: string[];
  total: number;
}

/** 表头别名 -> 字段名（归一化：去空格、转小写后匹配） */
const HEADER_MAP: Record<string, string> = {
  '外部id': 'refId',
  'refid': 'refId',
  '编号': 'refId',
  'id': 'refId',
  '姓名': 'name',
  'name': 'name',
  '性别': 'gender',
  'gender': 'gender',
  '代数': 'generation',
  '世代': 'generation',
  'generation': 'generation',
  '字辈': 'generationName',
  'generationname': 'generationName',
  '出生日期': 'birthDate',
  'birthdate': 'birthDate',
  '出生地': 'birthPlace',
  'birthplace': 'birthPlace',
  '是否在世': 'isAlive',
  '在世': 'isAlive',
  'isalive': 'isAlive',
  '逝世日期': 'deathDate',
  'deathdate': 'deathDate',
  '安葬地点': 'deathPlace',
  '死亡地点': 'deathPlace',
  'deathplace': 'deathPlace',
  '经度': 'longitude',
  'longitude': 'longitude',
  '纬度': 'latitude',
  'latitude': 'latitude',
  '生平简介': 'bio',
  '简介': 'bio',
  'bio': 'bio',
  '配偶信息': 'spouseInfo',
  '配偶': 'spouseInfo',
  'spouseinfo': 'spouseInfo',
  'spouse': 'spouseInfo',
  '父亲外部id': 'fatherRefId',
  '父亲编号': 'fatherRefId',
  '父亲id': 'fatherRefId',
  '父id': 'fatherRefId',
  '父亲': 'fatherRefId',
  'fatherrefid': 'fatherRefId',
  '母亲外部id': 'motherRefId',
  '母亲编号': 'motherRefId',
  '母亲id': 'motherRefId',
  '母id': 'motherRefId',
  '母亲序号': 'motherRefId',
  '母亲': 'motherRefId',
  'motherrefid': 'motherRefId',
  '排序': 'sortOrder',
  'sortorder': 'sortOrder'
};

/** 性别值归一化 */
const GENDER_VALUES: Record<string, string> = {
  '男': 'male',
  'male': 'male',
  '1': 'male',
  '女': 'female',
  'female': 'female',
  '0': 'female'
};

function normalizeHeader(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim().toLowerCase().replace(/\s+/g, '');
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim().toLowerCase().replace(/\s+/g, '');
  return '';
}

/** 安全地将单元格值转为字符串（仅处理字符串/数字/布尔值，其他类型返回空串） */
function safeCellString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** 是否在世换算：无法识别时默认在世 */
function parseIsAlive(value: string): number {
  const s = value.trim().toLowerCase();
  if (['1', '是', 'y', 'yes', 'true', '在世'].includes(s)) return 1;
  if (['0', '否', 'n', 'no', 'false', '已故', '去世'].includes(s)) return 0;
  return 1;
}

/**
 * 解析配偶信息列为配偶数组（分号分隔的姓名列表）。
 * 数组顺序即配偶序号，对应「母亲ID」（从 0 开始）。
 * 空字符串、连续分号、首尾分号均被忽略，不产生空对象。
 * 例：`陈氏;李氏` -> [{name:'陈氏'},{name:'李氏'}]
 */
function parseSpouseList(value: string): { name: string }[] {
  const s = String(value ?? '').trim();
  if (!s) return [];
  return s
    .split(/[;；]/)
    .map(v => v.trim())
    .filter(Boolean)
    .map(name => ({ name }));
}

function parseFloatOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * 成员文件批量导入：
 * - 解析 Excel（.xlsx/.xls）与 CSV（.csv），提取成员信息与父子关系（外部ID 引用）
 * - 解析与行级校验在内存完成（不落库），随后在单个事务内两遍导入（插入 + 回填关系）
 * - 事务保证原子性：任一行 DB 错误整体回滚，避免部分导入导致数据不一致
 * - 生成 CSV 导入模板，并写入审计日志
 */
@Injectable()
export class MemberImportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly familyMemberService: FamilyMemberService,
    private readonly systemLogService: SystemLogService
  ) {}

  /** 解析 Excel/CSV 文件为成员导入数据（纯内存解析，不落库） */
  parseSpreadsheet(buffer: Buffer, originalName: string): ParsedMemberImport {
    const ext = this.getExt(originalName);
    if (!IMPORT_SUPPORTED_EXTS.includes(ext)) {
      throw new HttpException('仅支持 .xlsx / .xls / .csv 格式的文件', HttpStatus.BAD_REQUEST);
    }

    const rows = this.readRows(buffer, ext);
    if (rows.length === 0) {
      throw new HttpException('文件内容为空，请检查后重新上传', HttpStatus.BAD_REQUEST);
    }

    // 表头行：首个含非空单元格的行
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
      throw new HttpException('未识别到「姓名」列，请下载模板后按规范填写', HttpStatus.BAD_REQUEST);
    }
    if (rows.length - headerIdx - 1 > MAX_IMPORT_ROWS) {
      throw new HttpException(`单次导入最多支持 ${MAX_IMPORT_ROWS} 行数据`, HttpStatus.BAD_REQUEST);
    }

    const items: FamilyMemberImportItem[] = [];
    const rowNos: number[] = [];
    const errors: string[] = [];
    let rejected = 0;
    const seenRef = new Set<string>();
    const seenNameFather = new Map<string, number>();

    const cell = (r: unknown[], field: string): string => {
      const i = col[field];
    return i !== undefined && i < r.length ? safeCellString(r[i]).trim() : '';
    };

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const raw = rows[r] || [];
      const rowNo = r + 1; // 含表头的原始行号
      if (raw.every(c => safeCellString(c).trim() === '')) continue; // 空行跳过

      const name = cell(raw, 'name');
      if (!name) {
        errors.push(`第 ${rowNo} 行：姓名不能为空`);
        rejected++;
        continue;
      }
      if (name.length > 50) {
        errors.push(`第 ${rowNo} 行：姓名不能超过50个字符`);
        rejected++;
        continue;
      }

      const genderRaw = cell(raw, 'gender');
      let gender = 'male';
      if (genderRaw) {
        const g = genderRaw.toLowerCase();
        if (GENDER_VALUES[g]) {
          gender = GENDER_VALUES[g];
        } else {
          errors.push(`第 ${rowNo} 行：性别只能填写 男/女`);
          rejected++;
          continue;
        }
      }

      const genRaw = cell(raw, 'generation');
      let generation = 1;
      if (genRaw) {
        if (!/^\d+$/.test(genRaw) || Number(genRaw) < 1) {
          errors.push(`第 ${rowNo} 行：代数必须为正整数`);
          rejected++;
          continue;
        }
        generation = Number(genRaw);
      }

      const refId = cell(raw, 'refId');
      if (refId && seenRef.has(refId)) {
        errors.push(`第 ${rowNo} 行：外部ID「${refId}」重复`);
        rejected++;
        continue;
      }

      const fatherRefId = cell(raw, 'fatherRefId');
      const motherRefId = cell(raw, 'motherRefId');
      // 母亲ID：父亲配偶信息数组中的序号（数字），如 0、1、2，而非成员引用
      if (motherRefId && !/^\d+$/.test(motherRefId)) {
        errors.push(`第 ${rowNo} 行：母亲ID必须是数字（父亲配偶数组序号），如 0、1、2`);
        rejected++;
        continue;
      }
      // 文件内同名同父亲去重（与系统「同父同名唯一」规则一致：父亲为空时不校验）
      if (fatherRefId) {
        const dupKey = `${name}|${fatherRefId}`;
        const firstRow = seenNameFather.get(dupKey);
        if (firstRow) {
          errors.push(`第 ${rowNo} 行：与第 ${firstRow} 行重复（同名同父亲）`);
          rejected++;
          continue;
        }
        seenNameFather.set(dupKey, rowNo);
      }
      if (refId) seenRef.add(refId);

      items.push({
        refId: refId || undefined,
        fatherRefId: fatherRefId || undefined,
        motherRefId: motherRefId || undefined,
        name,
        gender,
        generation,
        generationName: cell(raw, 'generationName') || undefined,
        birthDate: cell(raw, 'birthDate') || undefined,
        birthPlace: cell(raw, 'birthPlace') || undefined,
        isAlive: parseIsAlive(cell(raw, 'isAlive')),
        deathDate: cell(raw, 'deathDate') || undefined,
        deathPlace: cell(raw, 'deathPlace') || undefined,
        longitude: parseFloatOrNull(cell(raw, 'longitude')) ?? undefined,
        latitude: parseFloatOrNull(cell(raw, 'latitude')) ?? undefined,
        bio: cell(raw, 'bio') || undefined,
        spouseInfo: parseSpouseList(cell(raw, 'spouseInfo')),
        sortOrder: /^\d+$/.test(cell(raw, 'sortOrder')) ? Number(cell(raw, 'sortOrder')) : 0
      });
      rowNos.push(rowNo);
    }

    // 父子关系引用校验：被引用的父亲必须存在于本文件已通过校验的行中
    // （32位hex视为可能引用库中已有成员的系统ID，留待事务内查库校验；
    //   母亲ID为父亲配偶数组序号，已在行级校验为数字，无需引用校验）
    const isSystemId = (v: string) => /^[0-9a-f]{32}$/.test(v);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const label = `第 ${rowNos[i]} 行`;
      if (it.fatherRefId) {
        if (it.fatherRefId === it.refId) {
          errors.push(`${label}：父亲外部ID不能指向自己`);
        } else if (!seenRef.has(it.fatherRefId) && !isSystemId(it.fatherRefId)) {
          errors.push(`${label}：父亲外部ID「${it.fatherRefId}」不存在`);
        }
      }
    }

    return { items, rowNos, errors, total: items.length + rejected };
  }

  /** 文件批量导入：校验 -> 解析 -> 事务内两遍导入 -> 审计日志 */
  async importFromFile(
    familyId: number,
    file: { buffer: Buffer; originalname: string; size: number },
    operator?: { username?: string; id?: number | string }
  ): Promise<MemberImportFileReport> {
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

    // 校验家族成员表存在（不存在说明家族未初始化）
    await this.familyMemberService.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);

    const parsed = this.parseSpreadsheet(file.buffer, file.originalname);
    if (parsed.items.length === 0) {
      const head = parsed.errors.slice(0, 5).join('；');
      throw new HttpException(`未解析到可导入的成员数据${head ? '：' + head : ''}`, HttpStatus.BAD_REQUEST);
    }

    const start = Date.now();
    let imported = 0;
    // 事务保证原子性：任一行 DB 错误整体回滚，避免部分导入造成数据不一致
    await this.dataSource.transaction(async manager => {
      imported = await this.familyMemberService.importItems(
        (sql, params) => manager.query(sql, params),
        tableName,
        familyId,
        parsed.items,
        parsed.errors,
        parsed.rowNos
      );
      if (imported > 0) {
        await manager.query(
          `UPDATE \`family\`
           SET \`member_count\` = GREATEST(CAST(member_count AS SIGNED) + ?, 0)
           WHERE \`id\` = ?`,
          [imported, familyId]
        );
      }
    });

    // 审计日志（fire-and-forget，不阻塞响应）
    void this.systemLogService.write({
      logType: 'operation',
      module: 'family-member',
      action: '批量导入成员',
      method: 'POST',
      path: `/api/family-member/${familyId}/import`,
      operator: operator?.username || 'admin',
      operatorId: typeof operator?.id === 'number' ? operator.id : null,
      status: 200,
      success: true,
      detail: `文件「${file.originalname}」共 ${parsed.total} 行：成功 ${imported} 行，失败 ${parsed.errors.length} 行` +
        (parsed.errors.length ? `。错误：${parsed.errors.slice(0, 8).join('；')}` : ''),
      costTime: Date.now() - start
    });

    return {
      fileName: file.originalname,
      total: parsed.total,
      imported,
      skipped: 0,
      errors: parsed.errors
    };
  }

  /** 生成 CSV 导入模板（UTF-8 BOM，Excel 打开中文不乱码；含自洽示例行） */
  buildTemplate(): string {
    // 说明：父亲外部ID 引用文件内某行的外部ID，或直接填库中已有成员的系统ID；
    //       母亲ID 填该父亲「配偶信息」数组中的序号（从0开始，非成员ID）；
    //       配偶信息 填写配偶姓名，多个用分号（；）分隔
    const header = ['外部ID', '姓名', '性别', '代数', '字辈', '出生日期', '出生地', '是否在世', '逝世日期', '安葬地点', '经度', '纬度', '生平简介', '父亲外部ID', '母亲ID', '配偶信息', '排序'];
    const example = [
      ['f1', '朱伯言', '男', '1', '伯', '1880-03-15', '浙江绍兴', '否', '1955-07-20', '绍兴祖坟', '', '', '一世祖，开基立业', '', '', '陈氏', '1'],
      ['m1', '陈氏', '女', '1', '', '1885-06-01', '浙江绍兴', '否', '1920-11-02', '绍兴祖坟', '', '', '伯言公之妻', '', '', '', '2'],
      ['c1', '朱文远', '男', '2', '文', '1905-09-10', '浙江绍兴', '是', '', '', '', '', '二世长子（示例：父亲填 f1，母亲填配偶序号 0）', 'f1', '0', '', '1']
    ];
    const lines = [header, ...example].map(row => row.map(c => SystemLogService.csvEscape(String(c ?? ''))).join(','));
    return '\uFEFF' + lines.join('\r\n');
  }

  private getExt(name: string): string {
    return (name.split('.').pop() || '').toLowerCase();
  }

  private readRows(buffer: Buffer, ext: string): unknown[][] {
    if (ext === 'csv') {
      let text = buffer.toString('utf8').replace(/^\uFEFF/, '');
      // UTF-8 解码出现替换符时，按 GBK 重试（兼容中文 Windows Excel 导出的 CSV）
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
}
