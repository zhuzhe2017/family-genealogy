import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { FamilyService } from '../family/family.service';
import { FamilyMemberService } from '../family-member/family-member.service';
import { ContentService } from '../content/content.service';
import { UserService } from '../user/user.service';
import { UPLOAD_DIR } from '../common/upload/upload.service';
import { type ContentType } from '../content/content.service';
import { type FamilyCreateData } from '../family/types/family.types';
import { type FamilyMemberCreateData, type FamilyMemberUpdateData } from '../family-member/types/family-member.types';
import { type ContentCreateData } from '../content/types/content.types';

/** 备份导出包版本号（恢复时按版本兼容解析） */
const BACKUP_VERSION = 1;

/** 含 family_id 的家族数据主表（备份导出范围） */
const BACKUP_FAMILY_TABLES = [
  'family_member',
  'family_album_category',
  'family_photo',
  'family_document_category',
  'family_document',
  'family_event',
  'family_dynamic',
  'family_worship_record',
  'family_worship_memorial'
] as const;

/** 通过父表子查询关联的子表：表名 → 关联列（父表必须含 family_id） */
const BACKUP_SUB_TABLES = [
  { table: 'family_member_photo', key: 'member_id', parent: 'family_member' },
  { table: 'family_document_chapter', key: 'document_id', parent: 'family_document' },
  { table: 'family_event_detail', key: 'event_id', parent: 'family_event' },
  { table: 'family_event_member', key: 'event_id', parent: 'family_event' },
  { table: 'family_event_photo', key: 'event_id', parent: 'family_event' },
  { table: 'family_dynamic_image', key: 'dynamic_id', parent: 'family_dynamic' },
  { table: 'family_dynamic_comment', key: 'dynamic_id', parent: 'family_dynamic' },
  { table: 'family_dynamic_like', key: 'dynamic_id', parent: 'family_dynamic' }
] as const;

const CONTENT_TYPES: ContentType[] = ['dynamic', 'photo', 'document', 'event'];

/** 分类类型：album-相册分类 document-文档分类 */
export type CategoryType = 'album' | 'document';

/**
 * 分类默认模板（id 与既有前端约定值一致，保证存量 family_photo/family_document.category_id 兼容）。
 * 懒初始化：家族首次请求分类时自动写入，实现"开箱即用 + 可自定义"。
 */
const CATEGORY_SEEDS: Record<CategoryType, { id: string; name: string; icon: string }[]> = {
  album: [
    { id: 'ancestor', name: '先祖', icon: '👴' },
    { id: 'family', name: '全家福', icon: '👨‍👩‍👧‍👦' },
    { id: 'events', name: '活动', icon: '🎉' },
    { id: 'buildings', name: '建筑', icon: '🏛️' },
    { id: 'documents', name: '文档', icon: '📄' }
  ],
  document: [
    { id: 'genealogy', name: '族谱', icon: '' },
    { id: 'history', name: '家族史', icon: '' },
    { id: 'rules', name: '家规家训', icon: '' },
    { id: 'culture', name: '文化资料', icon: '' },
    { id: 'other', name: '其他', icon: '' }
  ]
};

/** 分类类型 → 分类表 / 归类文件表 */
const CATEGORY_META: Record<CategoryType, { table: string; itemTable: string; itemKey: string }> = {
  album: { table: 'family_album_category', itemTable: 'family_photo', itemKey: 'category_id' },
  document: { table: 'family_document_category', itemTable: 'family_document', itemKey: 'category_id' }
};

/**
 * 小程序用户端服务（一期：只读 + 基础提交）
 * 复用 family / family-member / content 三个业务服务的既有查询与校验逻辑，
 * 仅做用户视角的过滤（启用中、审核通过）与参数校验。
 *
 * 成员写权限（新增/编辑）：
 * - 家族创建者：全权
 * - 已绑定目标成员ID的会员：可编辑该成员（不受 VIP 状态限制）
 * - 已加入该家族的会员：可新增成员
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly familyService: FamilyService,
    private readonly familyMemberService: FamilyMemberService,
    private readonly contentService: ContentService,
    private readonly userService: UserService
  ) {}

  /** 家族列表（仅启用中） */
  getFamilyList(params: { page?: number; pageSize?: number; keyword?: string }) {
    return this.familyService.getList({
      page: params.page || 1,
      pageSize: params.pageSize || 20,
      keyword: params.keyword,
      status: 1
    });
  }

  /** 家族全量（下拉选择用，仅启用中） */
  getFamilyAll() {
    return this.familyService.getAll({ status: 1 });
  }

  /** 家族详情（仅启用中） */
  async getFamilyDetail(id: number) {
    const row = await this.familyService.getById(id);
    if (row.status !== 1) {
      throw new HttpException('家族不存在', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  /**
   * 家族成员列表，支持三种模式：
   * - 分页模式（page 存在）：返回分页列表（keyword 为姓名模糊匹配，含统计）
   * - 搜索模式（keyword 无 page）：返回命中成员 + 祖先链 + 后3代子图
   * - 窗口模式（generations）：从家族最顶层代数起返回 N 代
   */
  async getFamilyMembers(familyId: number, opts: { generations?: number; keyword?: string; page?: number; pageSize?: number; gender?: string; sort?: string } = {}) {
    // 分页模式
    if (opts.page !== undefined) {
      return this.familyMemberService.getPaged(familyId, {
        page: opts.page,
        pageSize: opts.pageSize,
        keyword: opts.keyword,
        gender: opts.gender,
        sort: opts.sort
      });
    }
    // 搜索：返回命中成员 + 祖先链 + 后 3 代子孙（递归子图）
    if (opts.keyword) {
      return this.familyMemberService.searchSubtree(familyId, opts.keyword, 3);
    }
    // 代数窗口：从家族最顶层代数起返回 N 代
    if (opts.generations && opts.generations > 0) {
      const minGen = await this.familyMemberService.getMinGeneration(familyId);
      if (minGen === null) return [];
      return this.familyMemberService.getAll(familyId, { status: 1, maxGeneration: minGen + opts.generations - 1 });
    }
    return this.familyMemberService.getAll(familyId, { status: 1 });
  }

  /** 成员详情（仅启用中；携带当前用户 canEdit 标识，供前端控制编辑入口） */
  async getFamilyMemberDetail(familyId: number, memberId: string, userId?: string) {
    const row = await this.familyMemberService.getById(familyId, memberId);
    if (row.status !== 1) {
      throw new HttpException('成员不存在', HttpStatus.NOT_FOUND);
    }
    const canEdit = userId ? await this.canEditMember(userId, familyId, memberId) : false;
    return { ...row, canEdit };
  }

  /** 成员子女列表 */
  getMemberChildren(familyId: number, memberId: string) {
    return this.familyMemberService.getChildren(familyId, memberId);
  }

  /** 成员轻量搜索（事件关联成员等选择场景，仅 id/name/gender） */
  searchMembers(
    familyId: number,
    params: { keyword?: string; page?: number; pageSize?: number } = {}
  ) {
    return this.familyMemberService.searchMembers(familyId, params);
  }

  /** 父亲候选列表（上一代男性成员，按姓名/母亲姓名模糊搜索，供添加成员选择父亲） */
  getFatherCandidates(familyId: number, generation: number, keyword: string) {
    return this.familyMemberService.getFatherCandidates(familyId, generation, keyword);
  }

  /** 父亲的配偶列表（候选母亲，从父亲 spouse_info JSON 数组解析） */
  getFatherSpouses(familyId: number, fatherId: string) {
    return this.familyMemberService.getFatherSpouses(familyId, fatherId);
  }

  /** 创建家族（基础字段，字辈关联后续在管理端维护）；创建者自动绑定为该家族会员 */
  async createFamily(data: FamilyCreateData) {
    const result = await this.familyService.create({
      name: data.name,
      logo: data.logo,
      founder: data.founder,
      origin: data.origin,
      description: data.description,
      isPublic: data.isPublic,
      allowJoin: data.allowJoin,
      surnameId: data.surnameId ?? null,
      generationTableId: data.generationTableId ?? null,
      creatorUserId: data.creatorUserId ?? null
    });
    // 创建者自动关联该家族支系（使用家族种子分享码），保证其具备后续成员管理权限
    if (data.creatorUserId && result.seedShareCode) {
      await this.userService.joinFamily(data.creatorUserId, { shareCode: result.seedShareCode });
    }
    return result;
  }

  /** 添加成员（须已加入该家族或为家族创建者） */
  async createMember(familyId: number, data: FamilyMemberCreateData, userId: string) {
    await this.assertMemberWrite(userId, familyId);
    return this.familyMemberService.create(familyId, data);
  }

  /** 更新成员（绑定该成员ID的会员或家族创建者，不受 VIP 状态限制） */
  async updateMember(familyId: number, memberId: string, data: FamilyMemberUpdateData, userId: string) {
    await this.assertMemberWrite(userId, familyId, memberId);
    return this.familyMemberService.update(familyId, memberId, data);
  }

  // ---------- 成员写权限控制 ----------

  /**
   * 成员写权限判断：
   * - 家族创建者：允许（含新增/编辑）
   * - 编辑指定成员：会员已绑定该成员ID（user.family_id 匹配且 user.member_id 匹配）→ 允许
   * - 新增成员：会员已加入该家族（user.family_id 匹配）→ 允许
   * 该权限基于"关联成员ID"绑定关系，不受会员 VIP 状态限制。
   */
  async canEditMember(userId: string, familyId: number, memberId: string): Promise<boolean> {
    const binding = await this.userService.getUserFamilyBinding(userId);
    const creatorId = await this.familyService.getCreatorUserId(familyId);
    if (String(creatorId || '') === String(userId)) return true;
    return Number(binding.familyId) === Number(familyId) && binding.memberId === memberId;
  }

  /** 写操作前置校验：无权限抛 403（提示具体原因） */
  private async assertMemberWrite(userId: string, familyId: number, memberId?: string): Promise<void> {
    const binding = await this.userService.getUserFamilyBinding(userId);
    const creatorId = await this.familyService.getCreatorUserId(familyId);
    if (String(creatorId || '') === String(userId)) return;

    if (memberId) {
      if (Number(binding.familyId) === Number(familyId) && binding.memberId === memberId) return;
      throw new HttpException('无权限编辑该成员：仅已绑定该成员的会员或家族创建者可编辑', HttpStatus.FORBIDDEN);
    }
    if (Number(binding.familyId) === Number(familyId)) return;
    throw new HttpException('请先加入该家族后再添加成员', HttpStatus.FORBIDDEN);
  }

  /** 内容列表（仅审核通过） */
  getContentList(
    type: ContentType,
    params: { familyId?: string; page?: number; pageSize?: number; keyword?: string },
    userId?: string
  ) {
    this.assertContentType(type);
    return this.contentService.getList(type, {
      page: params.page || 1,
      pageSize: params.pageSize || 20,
      familyId: params.familyId,
      auditStatus: 1,
      keyword: params.keyword
    }, userId);
  }

  /** 内容详情（仅审核通过；dynamic 附带图片与当前用户点赞状态；event 附带当前用户 canEdit 标识） */
  async getContentDetail(type: ContentType, id: string, userId?: string) {
    this.assertContentType(type);
    const detail = await this.contentService.getById(type, id, userId);
    if (type === 'event' && userId) {
      const familyId = Number((detail as { family_id?: unknown }).family_id);
      (detail as { canEdit?: boolean }).canEdit = familyId
        ? await this.isFamilyAdmin(familyId, String(userId))
        : false;
    }
    return detail;
  }

  /** 发布内容（默认待审核；须为当前家族成员，家族以请求体 familyId 校验） */
  async createContent(type: ContentType, data: ContentCreateData, userId?: string) {
    this.assertContentType(type);
    if (!userId) {
      throw new HttpException('请先登录', HttpStatus.UNAUTHORIZED);
    }
    const familyId = Number(data.familyId) || 0;
    if (!familyId) {
      throw new HttpException('familyId 不能为空', HttpStatus.BAD_REQUEST);
    }
    await this.assertFamilyMemberByUserId(familyId, String(userId));
    return this.contentService.create(type, data);
  }

  /** 更新内容（目前支持 event；仅家族创建者/管理员可操作，家族以库内记录为准） */
  async updateContent(type: ContentType, id: string, data: ContentCreateData, userId?: string) {
    this.assertContentType(type);
    if (!userId) {
      throw new HttpException('请先登录', HttpStatus.UNAUTHORIZED);
    }
    const familyId = await this.getContentFamilyId(type, id);
    await this.assertFamilyAdmin(familyId, String(userId));
    // 以库内真实 family_id 为准，防止请求体伪造归属
    data = { ...data, familyId };
    return this.contentService.update(type, id, data);
  }

  /** 删除内容（软删除；仅家族创建者/管理员可操作，家族以库内记录为准） */
  async deleteContent(type: ContentType, id: string, userId?: string) {
    this.assertContentType(type);
    if (!userId) {
      throw new HttpException('请先登录', HttpStatus.UNAUTHORIZED);
    }
    const familyId = await this.getContentFamilyId(type, id);
    await this.assertFamilyAdmin(familyId, String(userId));
    return this.contentService.delete(type, id);
  }

  /** 内容类型 → 主表名（与 content.service 的 CONTENT_CONFIG 保持一致） */
  private contentTableOf(type: ContentType): string {
    switch (type) {
      case 'dynamic':
        return 'family_dynamic';
      case 'photo':
        return 'family_photo';
      case 'document':
        return 'family_document';
      case 'event':
        return 'family_event';
    }
  }

  /** 内容所属家族（仅启用中；不存在抛 404） */
  private async getContentFamilyId(type: ContentType, id: string): Promise<number> {
    const [row] = await this.dataSource.query<{ family_id: number }[]>(
      `SELECT \`family_id\` FROM \`${this.contentTableOf(type)}\` WHERE \`id\` = ? AND \`status\` = 1`,
      [id]
    );
    if (!row) {
      throw new HttpException('内容不存在或已删除', HttpStatus.NOT_FOUND);
    }
    return Number(row.family_id);
  }

  /** 家族写权限判断：家族创建者 或 family_permission role=admin */
  private async isFamilyAdmin(familyId: number, userId: string): Promise<boolean> {
    const creatorId = await this.familyService.getCreatorUserId(familyId);
    if (String(creatorId || '') === String(userId)) return true;
    const [perm] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_permission` WHERE `family_id` = ? AND `user_id` = ? AND `role` = \'admin\' AND `status` = 1',
      [familyId, userId]
    );
    return !!perm;
  }

  /** 家族写权限断言：无权限抛 403 */
  private async assertFamilyAdmin(familyId: number, userId: string): Promise<void> {
    if (!(await this.isFamilyAdmin(familyId, userId))) {
      throw new HttpException('仅家族创建者或管理员可操作事件', HttpStatus.FORBIDDEN);
    }
  }

  /** 动态点赞/取消点赞 */
  toggleLike(dynamicId: string, userId: string) {
    return this.contentService.toggleLike(dynamicId, userId);
  }

  /** 动态评论列表（分页） */
  getComments(dynamicId: string, page?: number, pageSize?: number) {
    return this.contentService.getComments(dynamicId, page, pageSize);
  }

  /** 发表评论（仅该动态所属家族成员可评论） */
  async createComment(dynamicId: string, userId: string, userName: string, content: string) {
    const familyId = await this.getContentFamilyId('dynamic', dynamicId);
    await this.assertFamilyMemberByUserId(familyId, userId);
    return this.contentService.createComment(dynamicId, userId, userName, content);
  }

  private assertContentType(type: string): asserts type is ContentType {
    if (!CONTENT_TYPES.includes(type as ContentType)) {
      throw new HttpException('内容类型非法，仅支持 dynamic/photo/document/event', HttpStatus.BAD_REQUEST);
    }
  }

  // ---------- 内容分类（相册/文档） ----------

  /**
   * 分类列表：懒初始化默认分类种子，返回分类 + 各自文件计数。
   * 分类仅存元数据（category_id），不参与物理存储路径，移动/改名不影响文件 URL。
   */
  async getCategoryList(type: CategoryType, familyId: number) {
    await this.assertFamilyMemberByUserId(familyId);
    const meta = this.categoryMeta(type);
    await this.ensureCategorySeeds(type, familyId);
    const rows = await this.dataSource.query<CategoryRow[]>(
      `SELECT c.\`id\`, c.\`name\`, c.\`icon\`, c.\`sort_order\`,
        (SELECT COUNT(*) FROM \`${meta.itemTable}\` f
          WHERE f.\`${meta.itemKey}\` = c.\`id\` AND f.\`family_id\` = c.\`family_id\` AND f.\`status\` = 1) AS \`count\`
       FROM \`${meta.table}\` c
       WHERE c.\`family_id\` = ?
       ORDER BY c.\`sort_order\` ASC, c.\`create_time\` ASC`,
      [familyId]
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon || '',
      sortOrder: Number(r.sort_order) || 0,
      count: Number(r.count) || 0
    }));
  }

  /** 创建分类（仅家族创建者/管理员） */
  async createCategory(type: CategoryType, familyId: number, name: string, icon: string, userId: string) {
    await this.assertCategoryAdmin(familyId, userId);
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new HttpException('分类名称不能为空', HttpStatus.BAD_REQUEST);
    }
    if (trimmed.length > 50) {
      throw new HttpException('分类名称不能超过 50 字', HttpStatus.BAD_REQUEST);
    }
    const meta = this.categoryMeta(type);
    const id = randomBytes(16).toString('hex');
    const maxSort = await this.dataSource.query<{ max: number | null }[]>(
      `SELECT MAX(\`sort_order\`) AS \`max\` FROM \`${meta.table}\` WHERE \`family_id\` = ?`,
      [familyId]
    );
    await this.dataSource.query(
      `INSERT INTO \`${meta.table}\` (\`id\`, \`family_id\`, \`name\`, \`icon\`, \`sort_order\`)
       VALUES (?, ?, ?, ?, ?)`,
      [id, familyId, trimmed, icon || '', (maxSort[0]?.max ?? 0) + 1]
    );
    return { id };
  }

  /** 更新分类（仅家族创建者/管理员） */
  async updateCategory(type: CategoryType, categoryId: string, familyId: number, data: { name?: string; icon?: string; sortOrder?: number }, userId: string) {
    await this.assertCategoryAdmin(familyId, userId);
    const meta = this.categoryMeta(type);
    const [row] = await this.dataSource.query<CategoryRow[]>(
      `SELECT \`id\` FROM \`${meta.table}\` WHERE \`id\` = ? AND \`family_id\` = ?`,
      [categoryId, familyId]
    );
    if (!row) {
      throw new HttpException('分类不存在', HttpStatus.NOT_FOUND);
    }
    const sets: string[] = [];
    const values: unknown[] = [];
    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) {
        throw new HttpException('分类名称不能为空', HttpStatus.BAD_REQUEST);
      }
      if (name.length > 50) {
        throw new HttpException('分类名称不能超过 50 字', HttpStatus.BAD_REQUEST);
      }
      sets.push('`name` = ?');
      values.push(name);
    }
    if (data.icon !== undefined) {
      sets.push('`icon` = ?');
      values.push(String(data.icon).slice(0, 20));
    }
    if (data.sortOrder !== undefined) {
      sets.push('`sort_order` = ?');
      values.push(Math.max(0, Math.floor(Number(data.sortOrder) || 0)));
    }
    if (!sets.length) {
      return { id: categoryId };
    }
    values.push(categoryId, familyId);
    await this.dataSource.query(
      `UPDATE \`${meta.table}\` SET ${sets.join(', ')} WHERE \`id\` = ? AND \`family_id\` = ?`,
      values
    );
    return { id: categoryId };
  }

  /** 删除分类（仅家族创建者/管理员；分类下仍有文件时拒绝，防脏引用） */
  async deleteCategory(type: CategoryType, categoryId: string, familyId: number, userId: string) {
    await this.assertCategoryAdmin(familyId, userId);
    const meta = this.categoryMeta(type);
    const [row] = await this.dataSource.query<CategoryRow[]>(
      `SELECT \`id\` FROM \`${meta.table}\` WHERE \`id\` = ? AND \`family_id\` = ?`,
      [categoryId, familyId]
    );
    if (!row) {
      throw new HttpException('分类不存在', HttpStatus.NOT_FOUND);
    }
    const [used] = await this.dataSource.query<{ cnt: number }[]>(
      `SELECT COUNT(*) AS \`cnt\` FROM \`${meta.itemTable}\`
       WHERE \`${meta.itemKey}\` = ? AND \`family_id\` = ? AND \`status\` = 1`,
      [categoryId, familyId]
    );
    if (Number(used?.cnt || 0) > 0) {
      throw new HttpException('该分类下仍有文件，请先移动或删除后再移除分类', HttpStatus.CONFLICT);
    }
    await this.dataSource.query(
      `DELETE FROM \`${meta.table}\` WHERE \`id\` = ? AND \`family_id\` = ?`,
      [categoryId, familyId]
    );
    return { id: categoryId };
  }

  /** 分类写权限：家族创建者 或 family_permission role=admin */
  private async assertCategoryAdmin(familyId: number, userId: string): Promise<void> {
    const creatorId = await this.familyService.getCreatorUserId(familyId);
    if (String(creatorId || '') === String(userId)) return;
    const [perm] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_permission` WHERE `family_id` = ? AND `user_id` = ? AND `role` = \'admin\' AND `status` = 1',
      [familyId, userId]
    );
    if (perm) return;
    throw new HttpException('仅家族创建者或管理员可管理分类', HttpStatus.FORBIDDEN);
  }

  /** 懒初始化：家族无任何分类时写入默认模板（幂等，INSERT IGNORE 防并发重复） */
  private async ensureCategorySeeds(type: CategoryType, familyId: number): Promise<void> {
    const meta = this.categoryMeta(type);
    const [row] = await this.dataSource.query<{ cnt: number }[]>(
      `SELECT COUNT(*) AS \`cnt\` FROM \`${meta.table}\` WHERE \`family_id\` = ?`,
      [familyId]
    );
    if (Number(row?.cnt || 0) > 0) return;
    const seeds = CATEGORY_SEEDS[type];
    const values = seeds.flatMap((s, i) => [s.id, familyId, s.name, s.icon, i + 1]);
    await this.dataSource.query(
      `INSERT IGNORE INTO \`${meta.table}\` (\`id\`, \`family_id\`, \`name\`, \`icon\`, \`sort_order\`)
       VALUES ${seeds.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
      values
    );
  }

  private categoryMeta(type: CategoryType) {
    const meta = CATEGORY_META[type];
    if (!meta) {
      throw new HttpException('分类类型非法，仅支持 album/document', HttpStatus.BAD_REQUEST);
    }
    return meta;
  }

  // ---------- 数据备份 ----------

  /** 备份记录列表（倒序，含文件大小，供小程序展示） */
  async getBackupList(familyId: number) {
    await this.assertFamilyMemberByUserId(familyId);
    const rows = await this.dataSource.query<BackupRow[]>(
      'SELECT `id`, `family_id`, `name`, `file_url`, `file_size`, `status`, `operator_id`, `create_time` ' +
      'FROM `family_backup` WHERE `family_id` = ? ORDER BY `id` DESC LIMIT 50',
      [familyId]
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      fileUrl: r.file_url,
      fileSize: Number(r.file_size) || 0,
      status: r.status,
      createTime: r.create_time
    }));
  }

  /** 创建备份：打包家族核心数据为 JSON 文件 → 写 family_backup 记录 */
  async createBackup(familyId: number, userId: string) {
    await this.assertFamilyMemberByUserId(familyId, userId);
    const payload = await this.dumpFamilyData(familyId);

    const backupDir = join(UPLOAD_DIR, 'backup');
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }
    const stamp = this.formatStamp(new Date());
    const filename = `family_${familyId}_${stamp}.json`;
    const filePath = join(backupDir, filename);
    const json = JSON.stringify(payload, null, 2);
    writeFileSync(filePath, json, 'utf8');
    const fileUrl = `/uploads/backup/${filename}`;
    const fileSize = Buffer.byteLength(json, 'utf8');
    const name = `家族数据备份 ${stamp}`;

    const result = await this.dataSource.query<{ insertId?: number }>(
      'INSERT INTO `family_backup` (`family_id`, `name`, `file_url`, `file_size`, `status`, `operator_id`) ' +
      'VALUES (?, ?, ?, ?, \'success\', ?)',
      [familyId, name, fileUrl, fileSize, userId]
    );
    return { id: result.insertId, name, fileUrl, fileSize, status: 'success', createTime: new Date() };
  }

  /** 打包家族数据（family 基本信息 + 主表 + 关联子表），供备份/导出复用 */
  private async dumpFamilyData(familyId: number) {
    const [family] = await this.dataSource.query<Record<string, unknown>[]>(
      'SELECT * FROM `family` WHERE `id` = ?',
      [familyId]
    );
    const data: Record<string, unknown> = {
      version: BACKUP_VERSION,
      familyId,
      backupAt: new Date().toISOString(),
      family: family ?? null
    };
    for (const table of BACKUP_FAMILY_TABLES) {
      data[table] = await this.dataSource.query<unknown[]>(
        `SELECT * FROM \`${table}\` WHERE \`family_id\` = ?`,
        [familyId]
      );
    }
    for (const { table, key, parent } of BACKUP_SUB_TABLES) {
      data[table] = await this.dataSource.query<unknown[]>(
        `SELECT * FROM \`${table}\` WHERE \`${key}\` IN (SELECT \`id\` FROM \`${parent}\` WHERE \`family_id\` = ?)`,
        [familyId]
      );
    }
    return data;
  }

  /** 校验用户属于该家族（family_permission 启用记录或家族创建者），否则 403 */
  private async assertFamilyMemberByUserId(familyId: number, userId?: string): Promise<void> {
    if (!userId) {
      throw new HttpException('请先登录', HttpStatus.UNAUTHORIZED);
    }
    const [perm] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_permission` WHERE `family_id` = ? AND `user_id` = ? AND `status` = 1',
      [familyId, userId]
    );
    if (perm) return;
    const [family] = await this.dataSource.query<{ creator_user_id: string | null }[]>(
      'SELECT `creator_user_id` FROM `family` WHERE `id` = ?',
      [familyId]
    );
    if (!family || family.creator_user_id !== userId) {
      throw new HttpException('您不属于该家族，无权操作', HttpStatus.FORBIDDEN);
    }
  }

  /** 时间戳：yyyyMMdd_HHmmss */
  private formatStamp(date: Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  }
}

/** family_backup 行（snake_case） */
interface BackupRow {
  id: number;
  family_id: number;
  name: string;
  file_url: string;
  file_size: number | string;
  status: string;
  operator_id: string;
  create_time: Date | string;
}

/** 分类表行（snake_case） */
interface CategoryRow {
  id: string;
  family_id: number;
  name: string;
  icon: string;
  sort_order: number;
  count?: number | string;
  create_time: Date | string;
}
