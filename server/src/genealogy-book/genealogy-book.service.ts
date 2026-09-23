import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getSafeMemberTableName } from '../common/utils/family-member-table';
import {
  type GenealogyBookRow,
  type GenealogyBookCreateData,
  type GenealogyBookUpdateData,
  type BookTemplate,
  type TemplateInfo,
  type BookPreviewParams,
  type BookPreviewResponse,
  type BookPreviewNode
} from './types/genealogy-book.types';
import { type QueryValues } from '../common/types/common';

/** 模板信息常量 */
const TEMPLATES: TemplateInfo[] = [
  {
    key: 'european',
    name: '欧式体例',
    description: '横排从左至右，世代纵向排列，每代缩进一格，便于快速查阅。适合现代阅读习惯。',
    features: ['横排书写', '世代纵列', '代数缩进', '配索引目录']
  },
  {
    key: 'su_style',
    name: '苏式体例',
    description: '竖排从右至左，世代横向排列，世代分明，长幼有序。传统官修家谱常用体例。',
    features: ['竖排书写', '世代横列', '右起阅读', '配世系图']
  },
  {
    key: 'modern',
    name: '现代体例',
    description: '横排结合世系图与表格，信息密度高，支持照片、简介等富媒体内容。适合数字化存档。',
    features: ['横排书写', '图表结合', '富媒体支持', 'A4开本']
  },
  {
    key: 'classical',
    name: '古典线装体例',
    description: '竖排无标点，仿古线装书样式，适合收藏与祭祀场合使用。',
    features: ['竖排无标点', '线装样式', '宣纸质感', '朱丝栏边框']
  }
];

const VALID_TEMPLATES: BookTemplate[] = ['european', 'su_style', 'modern', 'classical'];

@Injectable()
export class GenealogyBookService {
  constructor(private readonly dataSource: DataSource) {}

  /** 获取所有可用模板信息 */
  getTemplates(): TemplateInfo[] {
    return TEMPLATES;
  }

  /** 校验模板有效性 */
  private validateTemplate(template?: string): void {
    if (template && !VALID_TEMPLATES.includes(template as BookTemplate)) {
      throw new HttpException('无效的家谱模板类型', HttpStatus.BAD_REQUEST);
    }
  }

  /** 校验并规范化标题 */
  private normalizeTitle(title?: string): string {
    const trimmed = (title || '').trim();
    if (!trimmed) {
      throw new HttpException('家谱书名不能为空', HttpStatus.BAD_REQUEST);
    }
    if (trimmed.length > 100) {
      throw new HttpException('家谱书名不能超过100个字符', HttpStatus.BAD_REQUEST);
    }
    return trimmed;
  }

  /** 确保家族存在 */
  private async ensureFamilyExists(familyId: number): Promise<void> {
    const [row] = await this.dataSource.query<Pick<GenealogyBookRow, 'id'>[]>(
      'SELECT `id` FROM `family` WHERE `id` = ? AND `status` = 1 LIMIT 1',
      [familyId]
    );
    if (!row) {
      throw new HttpException('家族不存在或已停用', HttpStatus.NOT_FOUND);
    }
  }

  /** 确保成员表存在 */
  private async ensureMemberTable(familyId: number): Promise<string> {
    const tableName = getSafeMemberTableName(familyId);
    const [rows] = await this.dataSource.query<{ exists: 0 | 1 }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ?) AS \`exists\``,
      [tableName]
    );
    if (Number(rows?.exists) !== 1) {
      throw new HttpException('家族成员表不存在，请先初始化家族', HttpStatus.NOT_FOUND);
    }
    return tableName;
  }

  /** 分页列表 */
  async getList(familyId: number, params: { page: number; pageSize: number }) {
    await this.ensureFamilyExists(familyId);
    const { page, pageSize } = params;
    const offset = (page - 1) * pageSize;

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      'SELECT COUNT(*) AS total FROM `genealogy_book` WHERE `family_id` = ?',
      [familyId]
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<GenealogyBookRow[]>(
      `SELECT * FROM \`genealogy_book\`
       WHERE \`family_id\` = ?
       ORDER BY \`sort_order\` ASC, \`create_time\` DESC
       LIMIT ? OFFSET ?`,
      [familyId, pageSize, offset]
    );

    return { list, total, page, pageSize };
  }

  /** 获取单条 */
  async getById(familyId: number, id: number) {
    await this.ensureFamilyExists(familyId);
    const [row] = await this.dataSource.query<GenealogyBookRow[]>(
      'SELECT * FROM `genealogy_book` WHERE `id` = ? AND `family_id` = ? LIMIT 1',
      [id, familyId]
    );
    if (!row) {
      throw new HttpException('家谱成书记录不存在', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  /** 创建 */
  async create(familyId: number, data: GenealogyBookCreateData) {
    // 先校验标题，避免触发后续查询
    const title = this.normalizeTitle(data.title);
    await this.ensureFamilyExists(familyId);
    this.validateTemplate(data.template);

    // 同家族下书名唯一性校验
    const [dup] = await this.dataSource.query<Pick<GenealogyBookRow, 'id'>[]>(
      'SELECT `id` FROM `genealogy_book` WHERE `family_id` = ? AND `title` = ? LIMIT 1',
      [familyId, title]
    );
    if (dup) {
      throw new HttpException('同家族下已存在相同书名的家谱', HttpStatus.BAD_REQUEST);
    }

    const result: unknown = await this.dataSource.query(
      `INSERT INTO \`genealogy_book\`
       (\`family_id\`, \`title\`, \`subtitle\`, \`template\`,
        \`preface\`, \`introduction\`, \`clan_rules\`, \`generation_poem\`, \`appendix\`,
        \`cover_style\`, \`font_family\`, \`paper_size\`,
        \`include_generation_table\`, \`include_member_bio\`, \`include_tree_chart\`, \`include_index\`,
        \`sort_order\`, \`status\`, \`create_by\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        familyId,
        title,
        data.subtitle || '',
        data.template || 'european',
        data.preface || '',
        data.introduction || '',
        data.clanRules || '',
        data.generationPoem || '',
        data.appendix || '',
        data.coverStyle || 'default',
        data.fontFamily || 'serif',
        data.paperSize || 'A4',
        data.includeGenerationTable ?? 1,
        data.includeMemberBio ?? 1,
        data.includeTreeChart ?? 1,
        data.includeIndex ?? 1,
        data.sortOrder ?? 0,
        data.createBy || ''
      ]
    );

    return { id: Number((result as { insertId?: number })?.insertId) };
  }

  /** 更新 */
  async update(familyId: number, id: number, data: GenealogyBookUpdateData) {
    await this.getById(familyId, id);
    this.validateTemplate(data.template);

    const fields: string[] = [];
    const values: QueryValues = [];

    if (data.title !== undefined) {
      fields.push('`title` = ?');
      values.push(this.normalizeTitle(data.title));
    }
    if (data.subtitle !== undefined) { fields.push('`subtitle` = ?'); values.push(data.subtitle || ''); }
    if (data.template !== undefined) { fields.push('`template` = ?'); values.push(data.template); }
    if (data.preface !== undefined) { fields.push('`preface` = ?'); values.push(data.preface || ''); }
    if (data.introduction !== undefined) { fields.push('`introduction` = ?'); values.push(data.introduction || ''); }
    if (data.clanRules !== undefined) { fields.push('`clan_rules` = ?'); values.push(data.clanRules || ''); }
    if (data.generationPoem !== undefined) { fields.push('`generation_poem` = ?'); values.push(data.generationPoem || ''); }
    if (data.appendix !== undefined) { fields.push('`appendix` = ?'); values.push(data.appendix || ''); }
    if (data.coverStyle !== undefined) { fields.push('`cover_style` = ?'); values.push(data.coverStyle || 'default'); }
    if (data.fontFamily !== undefined) { fields.push('`font_family` = ?'); values.push(data.fontFamily || 'serif'); }
    if (data.paperSize !== undefined) { fields.push('`paper_size` = ?'); values.push(data.paperSize || 'A4'); }
    if (data.includeGenerationTable !== undefined) { fields.push('`include_generation_table` = ?'); values.push(data.includeGenerationTable); }
    if (data.includeMemberBio !== undefined) { fields.push('`include_member_bio` = ?'); values.push(data.includeMemberBio); }
    if (data.includeTreeChart !== undefined) { fields.push('`include_tree_chart` = ?'); values.push(data.includeTreeChart); }
    if (data.includeIndex !== undefined) { fields.push('`include_index` = ?'); values.push(data.includeIndex); }
    if (data.sortOrder !== undefined) { fields.push('`sort_order` = ?'); values.push(data.sortOrder); }
    if (data.status !== undefined) { fields.push('`status` = ?'); values.push(data.status); }

    if (fields.length === 0) {
      throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);
    }

    values.push(id, familyId);
    await this.dataSource.query(
      `UPDATE \`genealogy_book\` SET ${fields.join(', ')} WHERE \`id\` = ? AND \`family_id\` = ?`,
      values
    );
    return { success: true };
  }

  /** 删除 */
  async delete(familyId: number, id: number) {
    await this.getById(familyId, id);
    await this.dataSource.query(
      'DELETE FROM `genealogy_book` WHERE `id` = ? AND `family_id` = ?',
      [id, familyId]
    );
    return { success: true };
  }

  /** 切换状态 */
  async toggleStatus(familyId: number, id: number) {
    const row = await this.getById(familyId, id);
    const newStatus = row.status === 1 ? 0 : 1;
    await this.dataSource.query(
      'UPDATE `genealogy_book` SET `status` = ? WHERE `id` = ? AND `family_id` = ?',
      [newStatus, id, familyId]
    );
    return { id, status: newStatus };
  }

  /** 获取家族字辈表 */
  private async getGenerationTable(familyId: number): Promise<{ surname: string; founder: string; generationSequence: string[] } | null> {
    const [row] = await this.dataSource.query<{
      surname: string;
      founder: string;
      generation_sequence: string | string[];
    }[]>(
      `SELECT \`gt\`.\`surname\`, \`gt\`.\`founder\`, \`gt\`.\`generation_sequence\`
       FROM \`family\` \`f\`
       LEFT JOIN \`generation_table\` \`gt\` ON \`f\`.\`generation_table_id\` = \`gt\`.\`id\`
       WHERE \`f\`.\`id\` = ? AND \`gt\`.\`status\` = 1 LIMIT 1`,
      [familyId]
    );
    if (!row) return null;
    const seq = typeof row.generation_sequence === 'string'
      ? JSON.parse(row.generation_sequence) as string[]
      : row.generation_sequence;
    return { surname: row.surname, founder: row.founder, generationSequence: seq || [] };
  }

  /** 获取家族成员（含关系），按世代分组 */
  private async getMembersGrouped(familyId: number): Promise<{
    generationLabels: { generation: number; label: string; members: BookPreviewNode[] }[];
    memberCount: number;
    generationCount: number;
  }> {
    const tableName = await this.ensureMemberTable(familyId);

    const rows = await this.dataSource.query<{
      id: string;
      name: string;
      gender: string;
      generation: number;
      generation_name: string;
      birth_date: string;
      birth_place: string;
      is_alive: number;
      death_date: string;
      bio: string | null;
      father_id: string;
      mother_id: string;
      spouse_info: string | null;
      sort_order: number;
    }[]>(
      `SELECT \`id\`, \`name\`, \`gender\`, \`generation\`, \`generation_name\`,
              \`birth_date\`, \`birth_place\`, \`is_alive\`, \`death_date\`,
              \`bio\`, \`father_id\`, \`mother_id\`, \`spouse_info\`, \`sort_order\`
       FROM \`${tableName}\`
       WHERE \`status\` = 1
       ORDER BY \`generation\` ASC, \`sort_order\` ASC, \`create_time\` ASC`
    );

    // 建立子女索引（含父系和母系）
    const childrenMap = new Map<string, string[]>();
    rows.forEach(m => {
      if (m.father_id) {
        const arr = childrenMap.get(m.father_id) || [];
        arr.push(m.id);
        childrenMap.set(m.father_id, arr);
      }
      // 无 father_id 但有 mother_id 时，挂到母亲名下
      if (!m.father_id && m.mother_id) {
        const arr = childrenMap.get(m.mother_id) || [];
        arr.push(m.id);
        childrenMap.set(m.mother_id, arr);
      }
    });

    // 按世代分组
    const genMap = new Map<number, BookPreviewNode[]>();
    rows.forEach(m => {
      const node: BookPreviewNode = {
        id: m.id,
        name: m.name,
        gender: m.gender,
        generation: m.generation,
        generationName: m.generation_name || '',
        birthDate: m.birth_date || '',
        birthPlace: m.birth_place || '',
        isAlive: m.is_alive,
        deathDate: m.death_date || '',
        bio: m.bio || '',
        fatherId: m.father_id || '',
        motherId: m.mother_id || '',
        spouseNames: this.extractSpouseNames(m.spouse_info),
        sortOrder: m.sort_order,
        childrenIds: childrenMap.get(m.id) || []
      };
      const gen = m.generation;
      if (!genMap.has(gen)) genMap.set(gen, []);
      genMap.get(gen).push(node);
    });

    const generationLabels = Array.from(genMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([gen, members]) => ({
        generation: gen,
        label: members[0]?.generationName
          ? `${members[0].generationName}字辈（第${gen}代）`
          : `第${gen}代`,
        members
      }));

    return {
      generationLabels,
      memberCount: rows.length,
      generationCount: genMap.size
    };
  }

  /** 从 spouse_info 中提取配偶姓名数组 */
  private extractSpouseNames(raw: unknown): string[] {
    if (!raw) return [];
    try {
      const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list
        .map((s: unknown) => {
          if (s && typeof s === 'object' && 'name' in s) {
            const name = (s as { name?: unknown }).name;
            return typeof name === 'string' ? name : null;
          }
          return null;
        })
        .filter((n): n is string => !!n);
    } catch {
      return [];
    }
  }

  /** 预览：获取成书所需完整数据 */
  async preview(familyId: number, params: BookPreviewParams): Promise<BookPreviewResponse> {
    await this.ensureFamilyExists(familyId);

    // 获取家族名称
    const [familyRow] = await this.dataSource.query<{ name: string }[]>(
      'SELECT `name` FROM `family` WHERE `id` = ? LIMIT 1',
      [familyId]
    );
    const familyName = familyRow?.name || '';

    // 获取成员分组数据
    const { generationLabels, memberCount, generationCount } = await this.getMembersGrouped(familyId);

    // 获取字辈表
    const genTable = await this.getGenerationTable(familyId);

    // 构建预览标题
    const template = params.template || 'european';
    const templateInfo = TEMPLATES.find(t => t.key === template);

    return {
      bookTitle: `${familyName}家谱`,
      familyName,
      template,
      generationCount,
      memberCount,
      generationLabels
    };
  }

  /** 导出：生成 HTML 内容 */
  async exportHtml(familyId: number, id: number): Promise<{ html: string; book: GenealogyBookRow }> {
    const book = await this.getById(familyId, id);
    const { generationLabels, memberCount, generationCount } = await this.getMembersGrouped(familyId);
    const genTable = await this.getGenerationTable(familyId);

    const familyName = await this.getFamilyName(familyId);
    const bookTitle = book.title || `${familyName}家谱`;

    // 构建 HTML
    const sections: string[] = [];

    // 封面
    sections.push(this.buildCoverHtml(bookTitle, book.subtitle, familyName, book));

    // 索引目录（置于封面之后、正文之前）
    if (book.include_index) {
      sections.push(this.buildIndexHtml(book, generationLabels));
    }

    // 序言
    if (book.preface) {
      sections.push(this.buildSectionHtml('序言', book.preface, 'preface'));
    }

    // 家族简介
    if (book.introduction) {
      sections.push(this.buildSectionHtml('家族简介', book.introduction, 'introduction'));
    }

    // 字辈表
    if (book.include_generation_table && genTable) {
      sections.push(this.buildGenerationTableHtml(genTable));
    }

    // 家训
    if (book.clan_rules) {
      sections.push(this.buildSectionHtml('家训', book.clan_rules, 'clan-rules'));
    }

    // 世系说明（世系图开关同时控制世系说明与成员关系两章）
    if (book.include_tree_chart) {
      sections.push(this.buildLineageDescriptionHtml(generationLabels, memberCount, generationCount));
      sections.push(this.buildRelationDescriptionHtml(generationLabels));
    }

    // 世代成员明细
    generationLabels.forEach(gen => {
      sections.push(this.buildGenerationMembersHtml(gen, book.include_member_bio));
    });

    // 附录
    if (book.appendix) {
      sections.push(this.buildSectionHtml('附录', book.appendix, 'appendix'));
    }

    return { html: this.wrapHtmlDocument(bookTitle, book, sections.join('\n')), book };
  }

  /** 获取家族名称 */
  private async getFamilyName(familyId: number): Promise<string> {
    const [row] = await this.dataSource.query<{ name: string }[]>(
      'SELECT `name` FROM `family` WHERE `id` = ? LIMIT 1',
      [familyId]
    );
    return row?.name || '';
  }

  /** 构建封面 HTML */
  private buildCoverHtml(title: string, subtitle: string, familyName: string, book: GenealogyBookRow): string {
    const templateName = TEMPLATES.find(t => t.key === book.template)?.name || book.template;
    return `
    <div class="book-cover">
      <div class="cover-inner">
        <div class="cover-title">${this.escapeHtml(title)}</div>
        ${subtitle ? `<div class="cover-subtitle">${this.escapeHtml(subtitle)}</div>` : ''}
        <div class="cover-family">${this.escapeHtml(familyName)}</div>
        <div class="cover-meta">
          <span>${this.escapeHtml(templateName)}</span>
          <span>${new Date().toLocaleDateString('zh-CN')}</span>
        </div>
      </div>
    </div>`;
  }

  /** 构建章节 HTML */
  private buildSectionHtml(title: string, content: string, className: string): string {
    return `
    <div class="book-section ${className}" id="section-${className}">
      <h2 class="section-title">${this.escapeHtml(title)}</h2>
      <div class="section-content">${this.escapeHtml(content).replace(/\n/g, '<br/>')}</div>
    </div>`;
  }

  /** 构建字辈表 HTML */
  private buildGenerationTableHtml(genTable: { surname: string; founder: string; generationSequence: string[] }): string {
    const items = genTable.generationSequence
      .map((gen, idx) => `<div class="gen-item"><span class="gen-num">${idx + 1}</span><span class="gen-char">${this.escapeHtml(gen)}</span></div>`)
      .join('');
    return `
    <div class="book-section generation-table" id="section-generation-table">
      <h2 class="section-title">字辈表</h2>
      <p class="section-desc">${this.escapeHtml(genTable.surname)}氏 · ${this.escapeHtml(genTable.founder)}支系</p>
      <div class="gen-list">${items}</div>
    </div>`;
  }

  /** 构建世系说明 HTML */
  private buildLineageDescriptionHtml(
    generationLabels: { generation: number; label: string; members: BookPreviewNode[] }[],
    memberCount: number,
    generationCount: number
  ): string {
    const genLines = generationLabels
      .map(g => `<div class="lineage-row"><span class="lineage-gen">第${g.generation}代</span><span class="lineage-label">${this.escapeHtml(g.label)}</span><span class="lineage-count">${g.members.length}人</span></div>`)
      .join('');
    return `
    <div class="book-section lineage-desc" id="section-lineage-desc">
      <h2 class="section-title">世系说明</h2>
      <p class="section-desc">本家族共 ${generationCount} 代，收录成员 ${memberCount} 人。世代传承脉络如下：</p>
      <div class="lineage-list">${genLines}</div>
    </div>`;
  }

  /** 构建成员关系描述 HTML */
  private buildRelationDescriptionHtml(
    generationLabels: { generation: number; label: string; members: BookPreviewNode[] }[]
  ): string {
    // 建立成员 id → 节点 的映射，避免 O(n²) 查找
    const memberMap = new Map<string, BookPreviewNode>();
    generationLabels.forEach(g => g.members.forEach(m => memberMap.set(m.id, m)));

    const relationRows = generationLabels.flatMap(g =>
      g.members.map(m => {
        const father = m.fatherId ? memberMap.get(m.fatherId) : undefined;
        const mother = m.motherId ? memberMap.get(m.motherId) : undefined;
        const parentDesc = father
          ? `${this.escapeHtml(father.name)}${mother ? `、${this.escapeHtml(mother.name)}` : ''}`
          : mother
            ? this.escapeHtml(mother.name)
            : '始祖';
        const spouseDesc = m.spouseNames.length > 0
          ? m.spouseNames.map(n => this.escapeHtml(n)).join('、')
          : '—';
        const childCount = m.childrenIds.length;
        return `
        <tr>
          <td>${this.escapeHtml(m.name)}</td>
          <td>第${m.generation}代</td>
          <td>${parentDesc}</td>
          <td>${spouseDesc}</td>
          <td>${childCount > 0 ? `${childCount}人` : '—'}</td>
        </tr>`;
      })
    );
    return `
    <div class="book-section relation-desc" id="section-relation-desc">
      <h2 class="section-title">成员关系</h2>
      <table class="relation-table">
        <thead>
          <tr><th>姓名</th><th>世代</th><th>父亲</th><th>配偶</th><th>子女</th></tr>
        </thead>
        <tbody>${relationRows.join('')}</tbody>
      </table>
    </div>`;
  }

  /** 构建世代成员明细 HTML */
  private buildGenerationMembersHtml(
    gen: { generation: number; label: string; members: BookPreviewNode[] },
    includeBio = 1
  ): string {
    const memberCards = gen.members.map(m => {
      const info: string[] = [];
      if (m.birthDate) info.push(`生于${this.escapeHtml(m.birthDate)}`);
      if (m.birthPlace) info.push(`籍贯${this.escapeHtml(m.birthPlace)}`);
      if (!m.isAlive && m.deathDate) info.push(`卒于${this.escapeHtml(m.deathDate)}`);
      if (m.generationName) info.push(`字辈：${this.escapeHtml(m.generationName)}`);
      return `
      <div class="member-card">
        <div class="member-name">${this.escapeHtml(m.name)}</div>
        <div class="member-info">${info.join(' · ') || '—'}</div>
        ${includeBio && m.bio ? `<div class="member-bio">${this.escapeHtml(m.bio)}</div>` : ''}
      </div>`;
    });
    return `
    <div class="book-section generation-members" id="gen-${gen.generation}">
      <h2 class="section-title">${this.escapeHtml(gen.label)}</h2>
      <div class="member-grid">${memberCards.join('')}</div>
    </div>`;
  }

  /** 构建索引目录 HTML */
  private buildIndexHtml(
    book: GenealogyBookRow,
    generationLabels: { generation: number; label: string; members: BookPreviewNode[] }[]
  ): string {
    const items: string[] = [];
    if (book.preface) items.push('<li><a href="#section-preface">序言</a></li>');
    if (book.introduction) items.push('<li><a href="#section-introduction">家族简介</a></li>');
    if (book.include_generation_table) items.push('<li><a href="#section-generation-table">字辈表</a></li>');
    if (book.clan_rules) items.push('<li><a href="#section-clan-rules">家训</a></li>');
    if (book.include_tree_chart) {
      items.push('<li><a href="#section-lineage-desc">世系说明</a></li>');
      items.push('<li><a href="#section-relation-desc">成员关系</a></li>');
    }
    generationLabels.forEach(g => {
      items.push(`<li><a href="#gen-${g.generation}">${this.escapeHtml(g.label)}</a></li>`);
    });
    if (book.appendix) items.push('<li><a href="#section-appendix">附录</a></li>');

    return `
    <div class="book-section book-index" id="book-index">
      <h2 class="section-title">目录</h2>
      <ul class="index-list">${items.join('')}</ul>
    </div>`;
  }

  /** 包装完整 HTML 文档 */
  private wrapHtmlDocument(title: string, book: GenealogyBookRow, bodyContent: string): string {
    const fontFamily = book.font_family === 'serif'
      ? '"SimSun", "Songti SC", serif'
      : book.font_family === 'sans'
        ? '"Microsoft YaHei", "PingFang SC", sans-serif'
        : book.font_family === 'kai'
          ? '"KaiTi", "STKaiti", "Kaiti SC", serif'
          : book.font_family;

    // 竖排模板：苏式 / 古典线装
    const isVertical = book.template === 'su_style' || book.template === 'classical';
    // 古典线装：更贴近传统的样式
    const isClassical = book.template === 'classical';

    // 纸张尺寸 → @page 尺寸
    const paperSizeMap: Record<string, string> = {
      A4: '210mm 297mm',
      A3: '297mm 420mm',
      '16K': '185mm 260mm'
    };
    const pageSize = paperSizeMap[book.paper_size] || paperSizeMap.A4;

    // 竖排专属 CSS
    const verticalCss = isVertical ? `
  /* ===== 竖排模板：从右至左阅读 ===== */
  .book-page { max-width: none; writing-mode: vertical-rl; direction: rtl; }
  body { background: #f5f5f5; }
  .section-title { border-bottom: none; border-right: 3px solid #8b0000; padding-bottom: 0; padding-right: 8px; }
  .member-grid { display: flex; flex-wrap: wrap; gap: 12px; }
  .member-card { writing-mode: vertical-rl; height: 240px; min-width: 120px; }
  .gen-list { flex-direction: row; }
  .gen-item { writing-mode: vertical-rl; }
  .lineage-list { flex-direction: row; flex-wrap: wrap; }
  .lineage-row { writing-mode: vertical-rl; }
  .relation-table { writing-mode: horizontal-tb; direction: ltr; }
  .index-list { list-style: none; display: flex; flex-wrap: wrap; gap: 8px 24px; }
  .index-list li { writing-mode: vertical-rl; }
  .index-list a { color: #333; text-decoration: none; }
  .index-list a:hover { color: #8b0000; }` : '';

    // 古典线装专属 CSS
    const classicalCss = isClassical ? `
  /* ===== 古典线装样式 ===== */
  body { background: #f0e6d2; }
  .book-page { background: #f5eeda; }
  .cover-title { letter-spacing: 16px; font-family: "KaiTi", "STKaiti", serif; }
  .book-cover { border-bottom-color: #5c3317; }
  .section-title { color: #5c3317; border-right-color: #5c3317; }
  .member-card { background: transparent; border: 1px solid #d4c5a3; }
  .gen-item { background: transparent; border: 1px solid #d4c5a3; }
  .gen-char { color: #5c3317; }
  .lineage-row { background: transparent; border: 1px solid #e0d5b8; }
  .lineage-gen { color: #5c3317; }
  .relation-table th { background: #efe5cd; }
  .relation-table th, .relation-table td { border-color: #d4c5a3; }
  .member-bio { border-top-color: #d4c5a3; }` : '';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${this.escapeHtml(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${fontFamily}; font-size: 14px; line-height: 1.8; color: #333; background: #f5f5f5; }
  .book-page { max-width: 800px; margin: 0 auto; padding: 40px 20px; background: #fff; min-height: 100vh; }
  .book-cover { text-align: center; padding: 80px 20px; border-bottom: 2px solid #8b0000; margin-bottom: 40px; }
  .cover-title { font-size: 42px; font-weight: bold; color: #8b0000; margin-bottom: 16px; letter-spacing: 8px; }
  .cover-subtitle { font-size: 18px; color: #666; margin-bottom: 24px; }
  .cover-family { font-size: 24px; color: #444; margin-bottom: 40px; }
  .cover-meta { display: flex; justify-content: center; gap: 24px; font-size: 12px; color: #999; }
  .book-section { margin-bottom: 40px; page-break-inside: avoid; }
  .section-title { font-size: 22px; color: #8b0000; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 16px; }
  .section-desc { color: #666; margin-bottom: 12px; }
  .section-content { text-indent: 2em; }
  .gen-list { display: flex; flex-wrap: wrap; gap: 12px; }
  .gen-item { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: #f9f9f9; border-radius: 4px; }
  .gen-num { color: #999; font-size: 12px; }
  .gen-char { font-weight: bold; color: #8b0000; }
  .lineage-list { display: flex; flex-direction: column; gap: 8px; }
  .lineage-row { display: flex; gap: 16px; padding: 8px 12px; background: #fafafa; border-radius: 4px; }
  .lineage-gen { color: #8b0000; font-weight: bold; min-width: 60px; }
  .lineage-label { flex: 1; }
  .lineage-count { color: #999; }
  .relation-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .relation-table th, .relation-table td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  .relation-table th { background: #f5f5f5; font-weight: bold; }
  .member-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .member-card { padding: 12px; border: 1px solid #eee; border-radius: 6px; background: #fafafa; }
  .member-name { font-weight: bold; color: #333; margin-bottom: 4px; }
  .member-info { font-size: 12px; color: #666; }
  .member-bio { font-size: 12px; color: #888; margin-top: 6px; border-top: 1px dashed #eee; padding-top: 6px; }
  .index-list { list-style: none; padding-left: 1em; }
  .index-list li { margin-bottom: 6px; }
  .index-list a { color: #333; text-decoration: none; }
  .index-list a:hover { color: #8b0000; text-decoration: underline; }
  ${verticalCss}
  ${classicalCss}
  @media print {
    @page { size: ${pageSize}; margin: 20mm; }
    body { background: #fff; }
    .book-page { padding: 20px; }
    .book-cover { page-break-after: always; break-after: page; }

    /* 序言、家族简介、家训、附录等纯文字章节独立成页 */
    .preface,
    .introduction,
    .clan-rules,
    .appendix { page-break-before: always; break-before: page; }

    /* 目录、字辈表、世系说明、成员关系各起新页 */
    .book-index,
    .generation-table,
    .lineage-desc,
    .relation-desc { page-break-before: always; break-before: page; }

    /* 世代成员明细不强制分页，让内容自然流动以节省纸张 */
    .generation-members { page-break-before: auto; break-before: auto; }

    /* 成员卡片、世系行避免跨页断裂 */
    .member-card,
    .lineage-row,
    .gen-item { page-break-inside: avoid; break-inside: avoid; }

    /* 成员关系表格：表头在每页重复 */
    .relation-table thead { display: table-header-group; }

    /* 每个世代明细的标题避免留在页尾 */
    .generation-members .section-title { page-break-after: avoid; break-after: avoid; }

    /* 若附录存在，它是最后一个元素，不强制分页 */
    .appendix:last-child { page-break-before: auto; break-before: auto; }
  }
</style>
</head>
<body>
<div class="book-page">
${bodyContent}
</div>
</body>
</html>`;
  }

  /** HTML 转义 */
  private escapeHtml(text: string): string {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
