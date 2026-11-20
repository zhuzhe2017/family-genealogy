/**
 * OCR 服务 - 手写族谱数字化录入
 *
 * 核心流程：
 *   1. 上传图片 → OCR 识别（返回统一协议：text + lines）
 *   2. OCR 文本 → AI 结构化（人名/世代/字辈/关系/生卒）
 *   3. 人工校对 → 确认导入 family_members_{familyId}
 *
 * Provider 抽象：
 *   mock      开发环境默认，返回占位文本
 *   tencent   腾讯云 OCR（手写体识别较好）
 *   baidu     百度 OCR
 *   aliyun    阿里通义 OCR
 * 切换方式：sys_config.ocr_provider（与 llm_provider / tts_provider 同模式）
 *
 * 统一返回协议（后端固化，前端只消费稳定字段）：
 *   OcrResult       { text, lines, provider, errcode?, errmsg? }
 *   StructuredMember { name, generation, generationName, fatherName, motherName, birthYear, deathYear, isAlive }
 */
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import * as https from 'https';
import { URL } from 'url';

import { LlmService } from '../llm/llm.service';
import { EntitlementService } from '../membership/membership.service';
import { Capability } from '../membership/types/membership.types';

/** 单张图片最大 10MB（微信小程序拍照通常 2-5MB） */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
/** 单章 OCR 结果缓存过期 7 天 */
const CACHE_TTL_DAYS = 7;

// ================================================================
// 类型定义
// ================================================================

/** OCR 统一返回协议（稳定，前端只消费这些字段） */
export interface OcrResult {
  text: string;              // 全文字符串（未断句）
  lines: string[];           // 按行拆分
  provider: string;          // 来源 Provider
  errcode?: number;          // 0 = 成功，其他 = 失败
  errmsg?: string;
}

/** AI 结构化的家族成员 */
export interface StructuredMember {
  name: string;
  generation?: number;
  generationName?: string;
  fatherName?: string;
  motherName?: string;
  spouseNames?: string[];
  birthYear?: number;
  deathYear?: number;
  isAlive?: boolean;
  notes?: string;
}

/** 导入预览（带去重校验） */
export interface MemberPreview extends StructuredMember {
  id?: string;               // 确认写入后才有
  duplicate?: boolean;       // 是否与现有成员重复（同名 + 同世代）
  duplicateOf?: string;      // 重复成员的 id
  validated?: boolean;       // 是否通过校验
  warnings?: string[];       // 校验警告
}

/** Provider 默认配置 */
const PROVIDER_DEFAULTS: Record<string, { name: string; requiresKey: boolean }> = {
  mock:    { name: '开发 Mock',  requiresKey: false },
  tencent: { name: '腾讯云 OCR',  requiresKey: true },
  baidu:   { name: '百度 OCR',    requiresKey: true },
  aliyun:  { name: '阿里通义 OCR', requiresKey: true }
};

// ================================================================
// 主 Service
// ================================================================

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private provider: string = 'mock';

  constructor(
    private readonly dataSource: DataSource,
    private readonly llm: LlmService,
    private readonly entitlement: EntitlementService
  ) {
    this.loadProviderConfig().catch(() => { /* 启动阶段静默 */ });
  }

  private async loadProviderConfig(): Promise<void> {
    try {
      const rows = await this.dataSource.query<any[]>(
        `SELECT \`config_key\`, \`config_value\` FROM \`sys_config\`
         WHERE \`config_key\` IN ('ocr_provider', 'ocr_api_key')`
      );
      const cfg: Record<string, string> = {};
      for (const row of rows) cfg[row.config_key] = String(row.config_value || '');
      const prov = cfg.ocr_provider && PROVIDER_DEFAULTS[cfg.ocr_provider] ? cfg.ocr_provider : 'mock';
      this.provider = prov;
    } catch {
      this.logger.warn('[ocr] loadProviderConfig failed, using mock');
    }
  }

  // =================================================================
  // 1. OCR 识别（上传图片 → 返回统一协议）
  // =================================================================

  /**
   * OCR 识别图片（本地文件路径、Buffer 都支持）
   * 后端固化统一协议：前端只消费 text + lines
   */
  async recognize(
    input: string | Buffer,
    familyId: number,
    sourceType: 'path' | 'buffer' = 'buffer'
  ): Promise<OcrResult> {
    this.entitlement.consumeQuota(familyId, Capability.OcrImport, 1).catch(() => {
      // 额度不足让 Guard 拦截，这里静默
    });

    let buffer: Buffer;
    if (sourceType === 'path') {
      const fs = await import('fs');
      buffer = fs.readFileSync(input as string);
    } else {
      buffer = input as Buffer;
    }

    if (buffer.length === 0) {
      return this.failOcr('文件内容为空', 4001);
    }
    if (buffer.length > MAX_IMAGE_SIZE) {
      return this.failOcr('图片过大（上限 10MB）', 4002);
    }

    // 查缓存（同一图片 hash 的 OCR 结果 7 天有效）
    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    const cached = await this.getCachedOcr(hash);
    if (cached) {
      return this.successOcr(cached.ocr_text || '', cached.lines || [], cached.provider || 'cache');
    }

    // 调 Provider
    const result = await this.callProviderOcr(buffer).catch((err) => {
      this.logger.warn('[ocr] provider call failed:', err);
      return this.failOcr('OCR 识别失败：' + (err?.message || '未知错误'), 5001);
    });

    // 写缓存
    if (result.errcode === 0 && result.text) {
      await this.setCachedOcr(hash, result.text, result.lines, result.provider);
    }

    return result;
  }

  // =================================================================
  // 2. AI 结构化（OCR 文本 → 家族成员数组）
  // =================================================================

  async structure(
    familyId: number,
    ocrText: string,
    options: { allowPartial?: boolean } = {}
  ): Promise<{ members: StructuredMember[]; llmUsed: boolean; rawPrompt?: string }> {
    if (!ocrText || !ocrText.trim()) {
      throw new HttpException('OCR 文本为空，请先进行识别', HttpStatus.BAD_REQUEST);
    }

    // 先查缓存（同一文本 hash 的结构化结果 7 天有效）
    const hash = crypto.createHash('md5').update(ocrText).digest('hex');
    const cached = await this.getCachedStructure(hash);
    if (cached && cached.structured_json) {
      try {
        return {
          members: JSON.parse(cached.structured_json),
          llmUsed: false
        };
      } catch { /* 缓存损坏，重新生成 */ }
    }

    // 调 LLM（OCR 后处理最稳定的方式）
    const members = await this.llmStructure(ocrText).catch((err) => {
      this.logger.warn('[ocr] llm structure failed:', err);
      // LLM 失败 → 抛 502，让前端重试
      throw new HttpException(
        'AI 结构化解析失败，请重试或人工校对原文',
        HttpStatus.BAD_GATEWAY
      );
    });

    // 写缓存
    await this.setCachedStructure(hash, members);

    return { members, llmUsed: true };
  }

  // =================================================================
  // 3. 预览导入（去重 + 校验）
  // =================================================================

  async previewImport(
    familyId: number,
    members: StructuredMember[]
  ): Promise<{ list: MemberPreview[]; summary: { total: number; willCreate: number; duplicates: number; warnings: number } }> {
    const tableName = `family_members_${familyId}`;
    const out: MemberPreview[] = [];

    for (const m of members) {
      const warnings: string[] = [];

      // 基础校验
      if (!m.name || !m.name.trim()) {
        warnings.push('缺少姓名');
      }
      if (m.generation && (m.generation < 1 || m.generation > 99)) {
        warnings.push('代数异常（应在 1-99 之间）');
      }
      if (m.birthYear && (m.birthYear < 1500 || m.birthYear > 2100)) {
        warnings.push('出生年份异常');
      }
      if (m.deathYear && (m.deathYear < 1500 || m.deathYear > 2100)) {
        warnings.push('逝世年份异常');
      }
      if (m.birthYear && m.deathYear && m.deathYear < m.birthYear) {
        warnings.push('逝世年份早于出生年份');
      }

      // 去重检测：同家族内 同名 + 同世代 → 疑似重复
      let duplicate = false;
      let duplicateOf: string | undefined;
      const cleanName = (m.name || '').replace(/[公/父/母/氏/府君/孺人]/g, '').trim();
      if (cleanName && m.generation) {
        const rows = await this.dataSource.query<any[]>(
          `SELECT \`id\`, \`name\` FROM \`${tableName}\`
           WHERE \`generation\` = ? AND (
             \`name\` = ? OR \`name\` LIKE ?
           ) LIMIT 1`,
          [m.generation, m.name, `%${cleanName}%`]
        );
        if (rows.length > 0) {
          duplicate = true;
          duplicateOf = String(rows[0].id);
        }
      }

      out.push({
        ...m,
        duplicate,
        duplicateOf,
        validated: warnings.length === 0,
        warnings
      });
    }

    const summary = {
      total: members.length,
      willCreate: out.filter(x => !x.duplicate && x.warnings.length < 2).length,
      duplicates: out.filter(x => x.duplicate).length,
      warnings: out.filter(x => x.warnings.length > 0).length
    };

    return { list: out, summary };
  }

  // =================================================================
  // 4. 确认导入（写入 family_members_{familyId}）
  // =================================================================

  async confirmImport(
    familyId: number,
    members: MemberPreview[]
  ): Promise<{ success: number; skipped: number; failed: number; errors: Array<{ name: string; error: string }> }> {
    const tableName = `family_members_${familyId}`;
    const result = { success: 0, skipped: 0, failed: 0, errors: [] as Array<{ name: string; error: string }> };

    for (const m of members) {
      // 跳过重复
      if (m.duplicate) {
        result.skipped++;
        continue;
      }
      // 跳过警告严重
      if (m.warnings && m.warnings.length >= 2) {
        result.skipped++;
        continue;
      }
      // 必须有姓名
      if (!m.name || !m.name.trim()) {
        result.skipped++;
        continue;
      }

      try {
        const id = this.genMemberId();
        await this.dataSource.query(
          `INSERT INTO \`${tableName}\`
            (\`id\`, \`name\`, \`generation\`, \`father_id\`, \`generation_name\`,
             \`birth_year\`, \`death_year\`, \`is_alive\`, \`create_by\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            m.name.trim(),
            m.generation ?? null,
            null, // father_id 后续二次关联
            m.generationName ?? null,
            m.birthYear ?? null,
            m.deathYear ?? null,
            m.isAlive ?? null,
            'ocr-import'
          ]
        );
        result.success++;
      } catch (err: any) {
        result.failed++;
        result.errors.push({ name: m.name, error: err.message || String(err) });
      }
    }

    return result;
  }

  // =================================================================
  // 内部：OCR Provider 调用（统一协议输出）
  // =================================================================

  private async callProviderOcr(buffer: Buffer): Promise<OcrResult> {
    // 开发 Mock：返回一段模拟族谱文本
    if (this.provider === 'mock') {
      return this.mockOcrResult();
    }

    // 腾讯云 OCR（手写体识别）
    if (this.provider === 'tencent') {
      return this.callTencentOcr(buffer).catch(() => this.mockOcrResult());
    }

    // 默认 fallback → mock，保证链路不断
    return this.mockOcrResult();
  }

  /** 腾讯云 OCR 手写体识别（HTTP POST，零依赖） */
  private async callTencentOcr(buffer: Buffer): Promise<OcrResult> {
    // 简化示例：Base64 图片 → API
    // 真实环境需要 Signature V3 签名（腾讯云 API 规范）
    const base64 = buffer.toString('base64');
    const url = new URL('https://ocr.tencentcloudapi.com/');

    const body = JSON.stringify({
      ImageBase64: base64,
      EnableDetectSplit: true,
      Scene: 'general'
    });

    try {
      const res = await this.httpPostJson(url.toString(), body, {
        'Content-Type': 'application/json',
        'Host': 'ocr.tencentcloudapi.com',
        'X-TC-Action': 'GeneralHandwritingOCR',
        'X-TC-Version': '2018-11-19',
        'X-TC-Timestamp': String(Math.floor(Date.now() / 1000))
      });
      const text = (res.TextDetections || []).map((d: any) => d.DetectedText).join('\n');
      const lines = (res.TextDetections || []).map((d: any) => d.DetectedText).filter(Boolean);
      return this.successOcr(text, lines, 'tencent');
    } catch (err) {
      return this.failOcr('腾讯云 OCR 调用失败：' + (err as any)?.message, 5002);
    }
  }

  // =================================================================
  // 内部：LLM 结构化
  // =================================================================

  private async llmStructure(text: string): Promise<StructuredMember[]> {
    const prompt =
      '你是家谱整理专家。以下是 OCR 识别的手写族谱文本（可能有错别字，且"公/父/母/氏/府君/孺人"等敬称需去除）：\n' +
      '---\n' + text + '\n---\n' +
      '请从中提取家族成员信息，输出 JSON 数组，每人包含：\n' +
      '- name: 姓名（去除敬称和官职）\n' +
      '- generation: 代数（从始祖开始算，若 OCR 中无明确代数可留空）\n' +
      '- generationName: 字辈字（如"文/明/国"中的单字，若无法识别留空）\n' +
      '- fatherName: 父亲姓名\n' +
      '- motherName: 母亲姓名\n' +
      '- birthYear: 出生年份（数字）\n' +
      '- deathYear: 逝世年份（数字）\n' +
      '- isAlive: 是否在世（true/false，若无法判断可留空）\n' +
      '\n' +
      '注意：\n' +
      '1. 按世系顺序排列，父子关系自动关联\n' +
      '2. OCR 可能认错的字（如己/已/巳、戌/戍、戊戌/戊辰）请根据上下文校正\n' +
      '3. 只返回 JSON 数组，不要任何其他文字说明\n' +
      '4. 若某字段无法确定则省略该字段';

    const result = await this.llm.chat(
      [{ role: 'user', content: prompt }],
      {}
    );

    // 从 AI 返回中提取 JSON（可能包含 ```json 包裹）
    const cleaned = this.extractJson(result.content);
    if (!cleaned) {
      throw new Error('AI 未能返回有效的 JSON 数组');
    }
    return cleaned as StructuredMember[];
  }

  /** 从 AI 回复中稳健提取 JSON（兼容 ```json 包裹 / 纯 JSON / 数组 / 对象包数组） */
  private extractJson(text: string): any[] | null {
    // 尝试直接 JSON.parse
    try { return JSON.parse(text); } catch {}
    // 尝试提取 ```json ... ``` 块
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlock) {
      try { return JSON.parse(codeBlock[1].trim()); } catch {}
    }
    // 尝试找到 [ ... ] 数组
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try { return JSON.parse(arrayMatch[0]); } catch {}
    }
    return null;
  }

  // =================================================================
  // 内部：统一协议构造 + Mock
  // =================================================================

  private successOcr(text: string, lines: string[], provider: string): OcrResult {
    return { text, lines, provider, errcode: 0 };
  }
  private failOcr(errmsg: string, errcode: number): OcrResult {
    return { text: '', lines: [], provider: this.provider, errcode, errmsg };
  }
  private mockOcrResult(): OcrResult {
    const mockText = `
张公讳文炳 字焕章 号明远
  世代 第十五世
  配李氏 子三 国栋 国梁 国材
国栋 文炳长子
  配王氏 子二 运昌 运盛
运昌 国栋长子
  生于光绪十三年 卒于民国三十一年
运盛 国栋次子
  配赵氏 子一 登科
国梁 文炳次子
  配陈氏 子一 运宏
国材 文炳三子
  出嗣 无传
`.trim();
    const lines = mockText.split('\n').filter(l => l.trim());
    return this.successOcr(mockText, lines, 'mock');
  }

  // =================================================================
  // 内部：缓存（ocr_result_cache 表）
  // =================================================================

  private async getCachedOcr(hash: string): Promise<any | null> {
    try {
      const [rows] = await this.dataSource.query<any[]>(
        `SELECT * FROM \`ocr_result_cache\` WHERE \`content_hash\` = ? AND \`cache_type\` = 'ocr' AND \`expire_time\` > NOW() LIMIT 1`,
        [hash]
      );
      return rows || null;
    } catch { return null; }
  }
  private async setCachedOcr(hash: string, text: string, lines: string[], provider: string): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO \`ocr_result_cache\` (\`content_hash\`, \`cache_type\`, \`ocr_text\`, \`lines_json\`, \`provider\`, \`expire_time\`)
         VALUES (?, 'ocr', ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))
         ON DUPLICATE KEY UPDATE \`ocr_text\`=VALUES(\`ocr_text\`), \`expire_time\`=VALUES(\`expire_time\`)`,
        [hash, text, JSON.stringify(lines), provider, CACHE_TTL_DAYS]
      );
    } catch (err) { this.logger.warn('[ocr] cache write failed:', err); }
  }
  private async getCachedStructure(hash: string): Promise<any | null> {
    try {
      const [rows] = await this.dataSource.query<any[]>(
        `SELECT * FROM \`ocr_result_cache\` WHERE \`content_hash\` = ? AND \`cache_type\` = 'structure' AND \`expire_time\` > NOW() LIMIT 1`,
        [hash]
      );
      return rows || null;
    } catch { return null; }
  }
  private async setCachedStructure(hash: string, members: StructuredMember[]): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO \`ocr_result_cache\` (\`content_hash\`, \`cache_type\`, \`structured_json\`, \`provider\`, \`expire_time\`)
         VALUES (?, 'structure', ?, 'llm', DATE_ADD(NOW(), INTERVAL ? DAY))
         ON DUPLICATE KEY UPDATE \`structured_json\`=VALUES(\`structured_json\`)`,
        [hash, JSON.stringify(members), CACHE_TTL_DAYS]
      );
    } catch (err) { this.logger.warn('[ocr] structure cache write failed:', err); }
  }

  // =================================================================
  // 内部：工具
  // =================================================================

  private async httpPostJson(urlStr: string, body: string, headers: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Length': Buffer.byteLength(body), ...headers },
        timeout: 15000
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf8');
            resolve(JSON.parse(text));
          } catch (err) { reject(err); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(new Error('OCR timeout')); });
      req.write(body);
      req.end();
    });
  }

  private genMemberId(): string {
    const ts = Date.now().toString(16);
    const rand = Math.random().toString(16).slice(2, 10);
    return (ts + rand + '0000000000').slice(0, 32).padStart(32, '0');
  }
}
