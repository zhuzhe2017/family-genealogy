import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type CulturalDocumentRow,
  type CulturalDocumentPageRow,
  type CulturalDocumentChapterRow,
  type CulturalDocumentCreateData,
  type CulturalDocumentUpdateData,
  type CulturalDocumentListParams,
  type ChapterTreeNode,
  type PageUploadItem,
  DOCUMENT_TYPES
} from './types/cultural-document.types';
import type { QueryValues, PaginationResult } from '../common/types/common';

/** 标签列的 JSON 类型（mysql2 可能返回 string 或已解析数组） */
type RawTagJson = string | string[] | null;

@Injectable()
export class CulturalDocumentService {
  private readonly logger = new Logger(CulturalDocumentService.name);

  constructor(private readonly dataSource: DataSource) {}

  // =================================================================
  // 校验工具
  // =================================================================

  /** 确保家族存在且启用（仅 familyId 非空的文档需要） */
  private async ensureFamilyExists(familyId: number): Promise<void> {
    const [row] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family` WHERE `id` = ? AND `status` = 1 LIMIT 1',
      [familyId]
    );
    if (!row) {
      throw new HttpException('家族不存在或已停用', HttpStatus.NOT_FOUND);
    }
  }

  /** 校验文档类型合法性 */
  private validateType(type?: string): void {
    if (type && !DOCUMENT_TYPES.includes(type as (typeof DOCUMENT_TYPES)[number])) {
      throw new HttpException(
        `无效的文档类型，可选值：${DOCUMENT_TYPES.join('/')}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /** 规范化标题（去除首尾空白，校验长度） */
  private normalizeTitle(title?: string): string {
    const trimmed = (title || '').trim();
    if (!trimmed) throw new HttpException('文档标题不能为空', HttpStatus.BAD_REQUEST);
    if (trimmed.length > 200) {
      throw new HttpException('文档标题不能超过 200 个字符', HttpStatus.BAD_REQUEST);
    }
    return trimmed;
  }

  /** 解析 MySQL 返回的 JSON 标签列 */
  private parseTags(raw: RawTagJson): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // =================================================================
  // 公开只读 API（公共古籍，family_id = NULL）
  // =================================================================

  /** 公共古籍分页列表（公开端点） */
  async getPublicList(params: CulturalDocumentListParams): Promise<PaginationResult<CulturalDocumentRow>> {
    const { page, pageSize, type, keyword, dynasty } = params;
    const offset = (page - 1) * pageSize;

    const where: string[] = ['`family_id` IS NULL', '`status` = 1', '`audit_status` = 1'];
    const values: QueryValues = [];

    if (type) {
      where.push('`type` = ?');
      values.push(type);
    }
    if (keyword) {
      where.push('(`title` LIKE ? OR `author` LIKE ? OR `summary` LIKE ?)');
      const like = `%${keyword}%`;
      values.push(like, like, like);
    }
    if (dynasty) {
      where.push('`dynasty` LIKE ?');
      values.push(`%${dynasty}%`);
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`cultural_document\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<CulturalDocumentRow[]>(
      `SELECT * FROM \`cultural_document\` ${whereClause}
       ORDER BY \`sort_order\` ASC, \`create_time\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    // 增加阅读数
    if (list.length > 0) {
      const ids = list.map(r => r.id);
      await this.bumpViewCount(ids);
    }

    return { list, total, page, pageSize };
  }

  /** 公共古籍详情（含阅读数 +1） */
  async getPublicById(id: string): Promise<CulturalDocumentRow> {
    const [row] = await this.dataSource.query<CulturalDocumentRow[]>(
      `SELECT * FROM \`cultural_document\`
       WHERE \`id\` = ? AND \`family_id\` IS NULL AND \`status\` = 1 AND \`audit_status\` = 1
       LIMIT 1`,
      [id]
    );
    if (!row) throw new HttpException('公共古籍不存在', HttpStatus.NOT_FOUND);
    await this.bumpViewCount([id]);
    return row;
  }

  // =================================================================
  // 家族私有文档 CRUD（需鉴权 + familyId 归属校验）
  // =================================================================

  /** 家族文档分页列表 */
  async getFamilyList(
    familyId: number,
    params: Omit<CulturalDocumentListParams, 'familyId' | 'publicOnly'>
  ): Promise<PaginationResult<CulturalDocumentRow>> {
    await this.ensureFamilyExists(familyId);
    const { page, pageSize, type, keyword } = params;
    const offset = (page - 1) * pageSize;

    const where: string[] = ['`family_id` = ?'];
    const values: QueryValues = [familyId];

    if (type) {
      this.validateType(type);
      where.push('`type` = ?');
      values.push(type);
    }
    if (keyword) {
      where.push('(`title` LIKE ? OR `author` LIKE ?)');
      const like = `%${keyword}%`;
      values.push(like, like);
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`cultural_document\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<CulturalDocumentRow[]>(
      `SELECT * FROM \`cultural_document\` ${whereClause}
       ORDER BY \`sort_order\` ASC, \`create_time\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return { list, total, page, pageSize };
  }

  /** 家族文档详情 */
  async getFamilyById(familyId: number, id: string): Promise<CulturalDocumentRow> {
    await this.ensureFamilyExists(familyId);
    const [row] = await this.dataSource.query<CulturalDocumentRow[]>(
      'SELECT * FROM `cultural_document` WHERE `id` = ? AND `family_id` = ? LIMIT 1',
      [id, familyId]
    );
    if (!row) throw new HttpException('文档不存在', HttpStatus.NOT_FOUND);
    return row;
  }

  /** 创建文档 */
  async create(data: CulturalDocumentCreateData): Promise<{ id: string }> {
    const title = this.normalizeTitle(data.title);
    this.validateType(data.type);

    // familyId 有值 → 校验家族存在；为空 → 公共古籍
    if (data.familyId !== undefined && data.familyId !== null) {
      await this.ensureFamilyExists(data.familyId);
    }

    // 同 family 下（含 family_id IS NULL）标题唯一性
    const dupWhere = data.familyId !== undefined && data.familyId !== null
      ? '`family_id` = ?'
      : '`family_id` IS NULL';
    const dupValues: QueryValues = data.familyId !== undefined && data.familyId !== null
      ? [data.familyId, title]
      : [title];

    const [dup] = await this.dataSource.query<{ id: string }[]>(
      `SELECT \`id\` FROM \`cultural_document\` WHERE ${dupWhere} AND \`title\` = ? LIMIT 1`,
      dupValues
    );
    if (dup) throw new HttpException('已存在相同标题的文档', HttpStatus.BAD_REQUEST);

    // 生成 32 位 hex ID（复用 user 表 id 生成规则风格：uuid 去掉横杠）
    const id = this.generateDocId();

    const tagJson = data.tags && data.tags.length > 0 ? JSON.stringify(data.tags) : null;

    await this.dataSource.query(
      `INSERT INTO \`cultural_document\`
       (\`id\`, \`family_id\`, \`type\`, \`title\`, \`subtitle\`, \`author\`, \`dynasty\`,
        \`cover_url\`, \`original_text\`, \`annotated_text\`, \`translated_text\`, \`summary\`,
        \`tag_json\`, \`sort_order\`, \`status\`, \`audit_status\`, \`create_by\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
      [
        id,
        data.familyId ?? null,
        data.type,
        title,
        data.subtitle || '',
        data.author || '',
        data.dynasty || '',
        data.coverUrl || '',
        data.originalText ?? null,
        data.annotatedText ?? null,
        data.translatedText ?? null,
        data.summary ?? null,
        tagJson,
        data.sortOrder ?? 0,
        data.createBy || ''
      ]
    );

    return { id };
  }

  /** 更新文档 */
  async update(familyId: number | null, id: string, data: CulturalDocumentUpdateData): Promise<{ success: true }> {
    // familyId 有值 → 校验归属；为 null → 公共古籍无需归属校验（但文档必须存在）
    await this.assertExistsAndBelongs(id, familyId);
    this.validateType(data.type);

    const fields: string[] = [];
    const values: QueryValues = [];

    if (data.title !== undefined) {
      fields.push('`title` = ?');
      values.push(this.normalizeTitle(data.title));
    }
    if (data.subtitle !== undefined) { fields.push('`subtitle` = ?'); values.push(data.subtitle || ''); }
    if (data.type !== undefined) { fields.push('`type` = ?'); values.push(data.type); }
    if (data.author !== undefined) { fields.push('`author` = ?'); values.push(data.author || ''); }
    if (data.dynasty !== undefined) { fields.push('`dynasty` = ?'); values.push(data.dynasty || ''); }
    if (data.coverUrl !== undefined) { fields.push('`cover_url` = ?'); values.push(data.coverUrl || ''); }
    if (data.originalText !== undefined) { fields.push('`original_text` = ?'); values.push(data.originalText ?? null); }
    if (data.annotatedText !== undefined) { fields.push('`annotated_text` = ?'); values.push(data.annotatedText ?? null); }
    if (data.translatedText !== undefined) { fields.push('`translated_text` = ?'); values.push(data.translatedText ?? null); }
    if (data.summary !== undefined) { fields.push('`summary` = ?'); values.push(data.summary ?? null); }
    if (data.tags !== undefined) {
      fields.push('`tag_json` = ?');
      values.push(data.tags && data.tags.length > 0 ? JSON.stringify(data.tags) : null);
    }
    if (data.sortOrder !== undefined) { fields.push('`sort_order` = ?'); values.push(data.sortOrder); }
    if (data.status !== undefined) { fields.push('`status` = ?'); values.push(data.status); }
    if (data.auditStatus !== undefined) { fields.push('`audit_status` = ?'); values.push(data.auditStatus); }

    if (fields.length === 0) {
      throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);
    }

    values.push(id);
    if (familyId !== null) {
      fields.push('`family_id` = ?');
      values.push(familyId);
      await this.dataSource.query(
        `UPDATE \`cultural_document\` SET ${fields.join(', ')} WHERE \`id\` = ? AND \`family_id\` = ?`,
        values
      );
    } else {
      await this.dataSource.query(
        `UPDATE \`cultural_document\` SET ${fields.slice(0, -1).join(', ')} WHERE \`id\` = ? AND \`family_id\` IS NULL`,
        values
      );
    }

    return { success: true };
  }

  /** 删除文档（同时删除关联的页面和章节） */
  async delete(familyId: number | null, id: string): Promise<{ success: true }> {
    await this.assertExistsAndBelongs(id, familyId);

    await this.dataSource.query('DELETE FROM `cultural_document_page` WHERE `document_id` = ?', [id]);
    await this.dataSource.query('DELETE FROM `cultural_document_chapter` WHERE `document_id` = ?', [id]);

    const where = familyId !== null
      ? 'WHERE `id` = ? AND `family_id` = ?'
      : 'WHERE `id` = ? AND `family_id` IS NULL';
    const params: QueryValues = familyId !== null ? [id, familyId] : [id];

    await this.dataSource.query(`DELETE FROM \`cultural_document\` ${where}`, params);

    return { success: true };
  }

  // =================================================================
  // 章节管理：树形结构
  // =================================================================

  /** 获取文档章节树（公开/私有通用） */
  async getChapters(documentId: string): Promise<ChapterTreeNode[]> {
    const rows = await this.dataSource.query<CulturalDocumentChapterRow[]>(
      `SELECT \`id\`, \`parent_id\`, \`title\`, \`page_start\`, \`page_end\`, \`sort_order\`
       FROM \`cultural_document_chapter\`
       WHERE \`document_id\` = ?
       ORDER BY \`parent_id\` ASC, \`sort_order\` ASC`,
      [documentId]
    );

    return this.buildChapterTree(rows);
  }

  /** 获取单章正文（含内容和译文） */
  async getChapterContent(chapterId: number): Promise<CulturalDocumentChapterRow> {
    const [row] = await this.dataSource.query<CulturalDocumentChapterRow[]>(
      'SELECT * FROM `cultural_document_chapter` WHERE `id` = ? LIMIT 1',
      [chapterId]
    );
    if (!row) throw new HttpException('章节不存在', HttpStatus.NOT_FOUND);
    return row;
  }

  /** 构建章节树（递归） */
  private buildChapterTree(rows: CulturalDocumentChapterRow[]): ChapterTreeNode[] {
    const map = new Map<number, ChapterTreeNode>();
    rows.forEach(r => {
      map.set(r.id, {
        id: r.id,
        parentId: r.parent_id,
        title: r.title,
        pageStart: r.page_start,
        pageEnd: r.page_end,
        sortOrder: r.sort_order,
        children: []
      });
    });

    const roots: ChapterTreeNode[] = [];
    map.forEach(node => {
      if (node.parentId === 0 || !map.has(node.parentId)) {
        roots.push(node);
      } else {
        const parent = map.get(node.parentId)!;
        parent.children.push(node);
      }
    });

    return roots.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // =================================================================
  // 原页图片
  // =================================================================

  /** 获取文档全部原页 */
  async getPages(documentId: string): Promise<CulturalDocumentPageRow[]> {
    const rows = await this.dataSource.query<CulturalDocumentPageRow[]>(
      'SELECT * FROM `cultural_document_page` WHERE `document_id` = ? ORDER BY `page_no` ASC',
      [documentId]
    );
    return rows;
  }

  /** 批量上传/更新原页图片 */
  async upsertPages(documentId: string, pages: PageUploadItem[]): Promise<{ count: number }> {
    if (!pages || pages.length === 0) {
      throw new HttpException('至少上传 1 页', HttpStatus.BAD_REQUEST);
    }

    // 先清空旧数据（保持幂等：上传即覆盖）
    await this.dataSource.query('DELETE FROM `cultural_document_page` WHERE `document_id` = ?', [documentId]);

    // 批量插入
    const values: QueryValues[] = pages.map(p => [
      documentId,
      p.pageNo,
      p.imageUrl,
      p.thumbnailUrl || '',
      p.width ?? 0,
      p.height ?? 0,
      p.ocrText ?? null
    ]);

    // mysql2 的 query 支持二维数组批量插入
    await this.dataSource.query(
      `INSERT INTO \`cultural_document_page\`
       (\`document_id\`, \`page_no\`, \`image_url\`, \`thumbnail_url\`, \`width\`, \`height\`, \`ocr_text\`)
       VALUES ?`,
      [values]
    );

    return { count: pages.length };
  }

  // =================================================================
  // 内部工具
  // =================================================================

  /** 确认文档存在且归属正确 */
  private async assertExistsAndBelongs(id: string, familyId: number | null): Promise<void> {
    const where = familyId !== null
      ? '`id` = ? AND `family_id` = ?'
      : '`id` = ? AND `family_id` IS NULL';
    const params: QueryValues = familyId !== null ? [id, familyId] : [id];

    const [row] = await this.dataSource.query<{ id: string }[]>(
      `SELECT \`id\` FROM \`cultural_document\` WHERE ${where} LIMIT 1`,
      params
    );
    if (!row) throw new HttpException('文档不存在或无权限操作', HttpStatus.NOT_FOUND);
  }

  /** 批量增加阅读数（+1） */
  private async bumpViewCount(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    try {
      await this.dataSource.query(
        `UPDATE \`cultural_document\` SET \`view_count\` = \`view_count\` + 1 WHERE \`id\` IN (${placeholders})`,
        ids
      );
    } catch (err) {
      // 阅读数更新失败不阻断主流程
      this.logger.warn(`bumpViewCount 失败: ${(err as Error).message}`);
    }
  }

  /** 生成 32 位 hex ID（Node crypto.randomBytes 去掉横杠的 UUID 风格） */
  private generateDocId(): string {
    // 简单方式：时间戳 + 随机数 + 序列（应用级生成，无需依赖 MySQL UUID）
    const ts = Date.now().toString(16);
    const rand = Math.random().toString(16).slice(2, 10);
    // 左侧补 0 凑齐 32 位
    return (ts + rand + '0000000000000000').slice(0, 32).padStart(32, '0');
  }
}
