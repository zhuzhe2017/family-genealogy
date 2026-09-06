import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { EntitlementService } from '../membership/membership.service';
import { getSafeMemberTableName, getSafeMemberPhotoTableName } from '../common/utils/family-member-table';
import {
  type FamilyMemberRow,
  type FamilyMemberCreateData,
  type FamilyMemberUpdateData,
  type FamilyMemberQueryParams,
  type FamilyMemberImportItem,
  type FatherCandidate,
  type FatherSpouse
} from './types/family-member.types';
import { type QueryValues } from '../common/types/common';

@Injectable()
export class FamilyMemberService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly entitlementService: EntitlementService
  ) {}

  /** 生成 32 位成员ID（小写十六进制） */
  private generateMemberId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * 校验并归一化头像URL：
   * - 空值/空白 → 空串（清除头像）
   * - 长度 ≤ 500 字符
   * - 仅允许 /uploads/ 相对路径或 http(s) 完整地址（与上传接口返回格式一致）
   */
  private validateAvatarUrl(url: string | undefined | null): string {
    if (url === undefined || url === null) return '';
    const trimmed = String(url).trim();
    if (!trimmed) return '';
    if (trimmed.length > 500) {
      throw new HttpException('头像URL长度不能超过 500 字符', HttpStatus.BAD_REQUEST);
    }
    if (!/^(\/uploads\/|https?:\/\/)/.test(trimmed)) {
      throw new HttpException('头像URL必须以 /uploads/ 或 http(s):// 开头', HttpStatus.BAD_REQUEST);
    }
    return trimmed;
  }

  /** 确保家族成员分表存在（文件导入等服务复用） */
  async ensureTable(familyId: number): Promise<void> {
    const tableName = getSafeMemberTableName(familyId);
    const [rows] = await this.dataSource.query<{ exists: 0 | 1 }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ?) AS \`exists\``,
      [tableName]
    );
    // mysql2 驱动将 EXISTS 返回为字符串 "0"/"1"，统一按数字归一化后判断
    if (Number(rows?.exists) !== 1) {
      throw new HttpException(
        `家族成员表 ${tableName} 不存在，请先初始化家族`,
        HttpStatus.NOT_FOUND
      );
    }
  }

  /** 确保成员照片分表存在（懒创建） */
  private async ensurePhotoTable(familyId: number): Promise<void> {
    const photoTable = getSafeMemberPhotoTableName(familyId);
    const [photoRows] = await this.dataSource.query<{ exists: 0 | 1 }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ?) AS \`exists\``,
      [photoTable]
    );
    // mysql2 驱动将 EXISTS 返回为字符串 "0"/"1"，统一按数字归一化后判断
    if (Number(photoRows?.exists) !== 1) {
      await this.dataSource.query(
        `CREATE TABLE IF NOT EXISTS \`${photoTable}\` (
          \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`member_id\` VARCHAR(32) NOT NULL COMMENT '成员ID',
          \`photo_url\` VARCHAR(500) NOT NULL COMMENT '照片URL',
          \`sort_order\` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序',
          \`create_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_member\` (\`member_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族成员照片分表'`
      );
    }
  }

  /** 分页列表 */
  async getList(familyId: number, params: FamilyMemberQueryParams) {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);
    const { page, pageSize, keyword, generation, gender, status } = params;
    const offset = (page - 1) * pageSize;

    const where: string[] = ['1=1'];
    const values: QueryValues = [];

    if (keyword) {
      where.push('`name` LIKE ?');
      values.push(`%${keyword}%`);
    }
    if (generation !== undefined) {
      where.push('`generation` = ?');
      values.push(generation);
    }
    if (gender) {
      where.push('`gender` = ?');
      values.push(gender);
    }
    if (status !== undefined) {
      where.push('`status` = ?');
      values.push(status);
    } else {
      where.push('`status` = ?');
      values.push(1);
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`${tableName}\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<FamilyMemberRow[]>(
      `SELECT \`id\`, \`family_id\`, \`name\`, \`gender\`, \`generation\`, \`generation_name\`,
              \`birth_date\`, \`birth_place\`, \`is_alive\`, \`death_date\`, \`death_place\`,
              \`longitude\`, \`latitude\`, \`bio\`, \`avatar_url\`, \`father_id\`, \`mother_id\`,
              \`spouse_info\`, \`sort_order\`, \`status\`, \`create_time\`, \`update_time\`
       FROM \`${tableName}\`
       ${whereClause}
       ORDER BY \`generation\` ASC, \`sort_order\` ASC, \`create_time\` ASC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return { list, total, page, pageSize };
  }

  /** 全部成员（不分页，用于家谱树等） */
  async getAll(familyId: number, params: { keyword?: string; generation?: number; status?: number; maxGeneration?: number } = {}) {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);
    const { keyword, generation, status, maxGeneration } = params;
    const where: string[] = ['1=1'];
    const values: QueryValues = [];

    if (keyword) {
      where.push('`name` LIKE ?');
      values.push(`%${keyword}%`);
    }
    if (generation !== undefined) {
      where.push('`generation` = ?');
      values.push(generation);
    }
    if (maxGeneration !== undefined) {
      where.push('`generation` <= ?');
      values.push(maxGeneration);
    }
    if (status !== undefined) {
      where.push('`status` = ?');
      values.push(status);
    } else {
      where.push('`status` = ?');
      values.push(1);
    }

    return this.dataSource.query<FamilyMemberRow[]>(
      `SELECT * FROM \`${tableName}\` WHERE ${where.join(' AND ')}
       ORDER BY \`generation\` ASC, \`sort_order\` ASC, \`create_time\` ASC`,
      values
    );
  }

  /**
   * 成员分页查询（含统计），供家族成员列表页使用。
   * 支持 keyword 姓名模糊、gender 性别过滤、sort 排序（default/name/birthYear）。
   */
  async getPaged(
    familyId: number,
    params: { page?: number; pageSize?: number; keyword?: string; gender?: string; sort?: string; generation?: number } = {}
  ) {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);
    const { page = 1, pageSize = 15, keyword, gender, sort, generation } = params;
    const safePageSize = Math.min(Math.max(pageSize, 1), 100);
    const where: string[] = ['`status` = ?'];
    const values: QueryValues = [1];
    if (keyword) {
      where.push('`name` LIKE ?');
      values.push(`%${keyword}%`);
    }
    if (gender === 'male' || gender === 'female') {
      where.push('`gender` = ?');
      values.push(gender);
    }
    if (generation !== undefined && generation > 0) {
      where.push('`generation` = ?');
      values.push(generation);
    }
    const whereSql = where.join(' AND ');
    // 统计（一次查询同时取总数与性别分布）
    const [stats] = await this.dataSource.query<{ total: string | number; maleCount: string | number; femaleCount: string | number }[]>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN \`gender\` = 'male' THEN 1 ELSE 0 END) AS maleCount,
              SUM(CASE WHEN \`gender\` = 'female' THEN 1 ELSE 0 END) AS femaleCount
       FROM \`${tableName}\` WHERE ${whereSql}`,
      values
    );
    // 排序
    let orderBy = '`generation` ASC, `sort_order` ASC, `create_time` ASC';
    if (sort === 'name') {
      orderBy = '`name` ASC, `generation` ASC';
    } else if (sort === 'birthYear') {
      orderBy = '(`birth_date` = \'\' OR `birth_date` IS NULL) ASC, `birth_date` ASC, `generation` ASC';
    }
    const list = await this.dataSource.query<FamilyMemberRow[]>(
      `SELECT * FROM \`${tableName}\` WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...values, safePageSize, (page - 1) * safePageSize]
    );
    const total = Number(stats?.total || 0);
    return {
      list,
      total,
      page,
      pageSize: safePageSize,
      totalMembers: total,
      maleCount: Number(stats?.maleCount || 0),
      femaleCount: Number(stats?.femaleCount || 0),
      hasMore: page * safePageSize < total
    };
  }

  /**
   * 成员轻量搜索（用于事件关联成员等选择场景）。
   * 仅返回选择所需字段（id/name/gender），支持 keyword 姓名模糊、分页。
   * 单次 pageSize 限制在 1~50 之间，默认 20。
   */
  async searchMembers(
    familyId: number,
    params: { keyword?: string; page?: number; pageSize?: number } = {}
  ): Promise<{ list: { id: string; name: string; gender: string }[]; total: number; page: number; pageSize: number; hasMore: boolean }> {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);
    const { keyword } = params;
    const page = Math.max(1, Math.floor(Number(params.page) || 1));
    const pageSize = Math.min(50, Math.max(1, Math.floor(Number(params.pageSize) || 20)));
    const offset = (page - 1) * pageSize;

    const where: string[] = ['`status` = ?'];
    const values: QueryValues = [1];

    const trimmed = (keyword || '').trim();
    if (trimmed) {
      where.push('`name` LIKE ?');
      values.push(`%${trimmed}%`);
    }

    const whereSql = where.join(' AND ');

    const [countRow] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`${tableName}\` WHERE ${whereSql}`,
      values
    );
    const total = Number(countRow?.total || 0);

    const list = await this.dataSource.query<{ id: string; name: string; gender: string }[]>(
      `SELECT \`id\`, \`name\`, \`gender\` FROM \`${tableName}\`
       WHERE ${whereSql}
       ORDER BY \`generation\` ASC, \`sort_order\` ASC, \`create_time\` ASC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return {
      list: list || [],
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total
    };
  }

  /** 家族最顶层代数（启用成员中的最小 generation）；无启用成员返回 null */
  async getMinGeneration(familyId: number): Promise<number | null> {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);
    const [row] = await this.dataSource.query<{ minGen: string | number | null }[]>(
      `SELECT MIN(\`generation\`) AS minGen FROM \`${tableName}\` WHERE \`status\` = 1`
    );
    const v = row && row.minGen !== null && row.minGen !== undefined ? Number(row.minGen) : null;
    return Number.isFinite(v) ? v : null;
  }

  /**
   * 搜索成员并返回子图：命中成员 + 祖先链 + 后 depth 代子孙（递归 CTE，MySQL 8）。
   * 用于小程序家谱树搜索，避免全量传输。
   */
  async searchSubtree(familyId: number, keyword: string, depth = 3): Promise<FamilyMemberRow[]> {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);
    const like = `%${keyword}%`;
    const sql = `
      WITH RECURSIVE hit AS (
        SELECT id, father_id, mother_id, generation FROM \`${tableName}\`
        WHERE status = 1 AND name LIKE ?
      ),
      up AS (
        SELECT id, father_id, mother_id, generation, 0 AS d FROM hit
        UNION ALL
        SELECT m.id, m.father_id, m.mother_id, m.generation, u.d + 1
        FROM \`${tableName}\` m JOIN up u ON m.id = u.father_id OR m.id = u.mother_id
        WHERE u.d < 50
      ),
      down AS (
        SELECT id, father_id, mother_id, generation, 0 AS d FROM hit
        UNION ALL
        SELECT m.id, m.father_id, m.mother_id, m.generation, d.d + 1
        FROM \`${tableName}\` m JOIN down d ON m.father_id = d.id OR m.mother_id = d.id
        WHERE d.d < ?
      )
      SELECT DISTINCT m.* FROM \`${tableName}\` m
      WHERE m.id IN (SELECT id FROM up) OR m.id IN (SELECT id FROM down)
      ORDER BY m.generation ASC, m.sort_order ASC, m.create_time ASC`;
    return this.dataSource.query<FamilyMemberRow[]>(sql, [like, depth]);
  }

  /** 单条成员详情 */
  async getById(familyId: number, memberId: string): Promise<FamilyMemberRow> {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);
    const [row] = await this.dataSource.query<FamilyMemberRow[]>(
      `SELECT * FROM \`${tableName}\` WHERE \`id\` = ?`,
      [memberId]
    );
    if (!row) throw new HttpException('成员不存在', HttpStatus.NOT_FOUND);
    row.photos = await this.getPhotos(familyId, memberId);
    return row;
  }

  /** 成员子女列表（father_id/mother_id 指向该成员，仅启用中） */
  async getChildren(familyId: number, memberId: string): Promise<FamilyMemberRow[]> {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);
    return this.dataSource.query<FamilyMemberRow[]>(
      `SELECT * FROM \`${tableName}\`
       WHERE \`status\` = 1 AND (\`father_id\` = ? OR \`mother_id\` = ?)
       ORDER BY \`sort_order\` ASC, \`create_time\` ASC`,
      [memberId, memberId]
    );
  }

  /** 成员照片分表名（ensureTable 已保证存在） */
  private photoTableName(familyId: number): string {
    return getSafeMemberPhotoTableName(familyId);
  }

  /** 查询成员照片URL数组（租户后台等外部服务可直接调用） */
  async getPhotos(familyId: number, memberId: string): Promise<string[]> {
    await this.ensurePhotoTable(familyId);
    const rows = await this.dataSource.query<{ photo_url: string }[]>(
      `SELECT \`photo_url\` FROM \`${this.photoTableName(familyId)}\`
       WHERE \`member_id\` = ? ORDER BY \`sort_order\` ASC, \`id\` ASC`,
      [memberId]
    );
    return (rows || []).map(r => r.photo_url).filter(Boolean);
  }

  /** 批量插入成员照片 */
  private async insertPhotos(familyId: number, memberId: string, urls: string[]): Promise<void> {
    await this.ensurePhotoTable(familyId);
    const placeholders: string[] = [];
    const values: QueryValues = [];
    (urls || []).filter(Boolean).forEach((url, index) => {
      placeholders.push('(?, ?, ?)');
      values.push(memberId, url, index);
    });
    if (placeholders.length === 0) return;
    await this.dataSource.query(
      `INSERT INTO \`${this.photoTableName(familyId)}\` (\`member_id\`, \`photo_url\`, \`sort_order\`)
       VALUES ${placeholders.join(', ')}`,
      values
    );
  }

  /** 整体替换成员照片（先删后插） */
  private async replacePhotos(familyId: number, memberId: string, urls: string[]): Promise<void> {
    await this.ensurePhotoTable(familyId);
    await this.dataSource.query(
      `DELETE FROM \`${this.photoTableName(familyId)}\` WHERE \`member_id\` = ?`,
      [memberId]
    );
    if (Array.isArray(urls) && urls.length > 0) {
      await this.insertPhotos(familyId, memberId, urls);
    }
  }

  /**
   * 查询父亲候选（分页）：当前家族上一代男性成员，可按姓名或母亲姓名模糊匹配。
   * 返回携带其父姓名（father_name，"XX之子"锚点）与配偶（spouse_names）供同名父亲区分。
   * keyword 为空时返回全部候选；非空时按关键字过滤，且"完全同名"优先排序。
   * 返回 { list, total }，前端据此实现上拉加载更多（每页 20 条）。
   */
  async getFatherCandidates(
    familyId: number,
    generation: number,
    keyword: string,
    page = 1,
    pageSize = 20
  ): Promise<{ list: FatherCandidate[]; total: number }> {
    await this.ensureTable(familyId);
    if (generation === undefined || generation === null || generation < 2) {
      throw new HttpException('只有第2代及以上成员才允许选择父亲', HttpStatus.BAD_REQUEST);
    }
    const trimmed = keyword?.trim() || '';
    const tableName = getSafeMemberTableName(familyId);
    const fatherGeneration = generation - 1;
    const like = `%${trimmed}%`;
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safePageSize = Math.min(50, Math.max(1, Math.floor(Number(pageSize) || 20)));
    const offset = (safePage - 1) * safePageSize;

    const whereKeyword = trimmed
      ? ` AND (\`name\` LIKE ? OR IFNULL(\`spouse_info\`, '') LIKE ?)`
      : '';
    const orderBy = trimmed
      ? 'ORDER BY CASE WHEN `name` = ? THEN 0 ELSE 1 END, `sort_order` ASC, `create_time` ASC'
      : 'ORDER BY `sort_order` ASC, `create_time` ASC';

    // 总数（供前端判断是否有更多）
    const [countRow] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS \`total\` FROM \`${tableName}\`
       WHERE \`status\` = 1 AND \`gender\` = 'male' AND \`generation\` = ?${whereKeyword}`,
      trimmed ? [fatherGeneration, like, like] : [fatherGeneration]
    );
    const total = Number(countRow?.total || 0);

    const params: QueryValues = trimmed
      ? [1, 'male', fatherGeneration, like, like, trimmed, offset, safePageSize]
      : [1, 'male', fatherGeneration, offset, safePageSize];

    const rows = await this.dataSource.query<Pick<FamilyMemberRow, 'id' | 'name' | 'gender' | 'generation' | 'generation_name' | 'spouse_info' | 'father_id'>[]>(
      `SELECT \`id\`, \`name\`, \`gender\`, \`generation\`, \`generation_name\`, \`spouse_info\`, \`father_id\`
       FROM \`${tableName}\`
       WHERE \`status\` = ?
         AND \`gender\` = ?
         AND \`generation\` = ?${whereKeyword}
       ${orderBy}
       LIMIT ?, ?`,
      params
    );

    // 一次性查询候选的父辈（爷爷）姓名，避免逐条 N+1
    const fatherNameMap: Record<string, string> = {};
    const fatherIds = rows.map(r => r.father_id).filter((x): x is string => !!x);
    if (fatherIds.length) {
      const fRows = await this.dataSource.query<{ id: string; name: string }[]>(
        `SELECT \`id\`, \`name\` FROM \`${tableName}\`
         WHERE \`id\` IN (${fatherIds.map(() => '?').join(',')}) AND \`status\` = 1`,
        fatherIds
      );
      fRows.forEach(f => {
        fatherNameMap[f.id] = f.name;
      });
    }

    const list = rows.map(r => {
      const names = this.extractSpouseNames(r.spouse_info);
      return {
        id: r.id,
        name: r.name,
        gender: r.gender,
        generation: r.generation,
        generation_name: r.generation_name,
        spouse_names: names.join('、'),
        father_name: r.father_id ? (fatherNameMap[r.father_id] || '') : ''
      };
    });
    return { list, total };
  }

  /** 从 spouse_info 中提取配偶姓名数组 */
  private extractSpouseNames(raw: string | null | unknown): string[] {
    if (!raw) return [];
    try {
      const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.map((s: any) => s?.name).filter((n): n is string => !!n);
    } catch {
      return [];
    }
  }

  /**
   * 获取父亲的配偶列表（候选母亲）。
   * 从 father.spouse_info JSON 数组解析，返回数组（下标即配偶序号，从 0 开始）。
   * 注：不再使用配偶对象中的 rank 字段（原语义为配偶在自家兄妹中的排行，非母亲ID依据）。
   */
  async getFatherSpouses(familyId: number, fatherId: string): Promise<FatherSpouse[]> {
    await this.ensureTable(familyId);
    if (!fatherId?.trim()) {
      return [];
    }
    const tableName = getSafeMemberTableName(familyId);
    const [row] = await this.dataSource.query<Pick<FamilyMemberRow, 'id' | 'spouse_info'>[]>(
      `SELECT \`id\`, \`spouse_info\` FROM \`${tableName}\` WHERE \`id\` = ? AND \`status\` = ?`,
      [fatherId.trim(), 1]
    );
    if (!row) return [];
    const raw = row.spouse_info;
    if (!raw) return [];
    try {
      const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list
        .map((s: any) => ({
          name: s.name || '',
          birthDate: s.birthDate || s.birth_date || '',
          deathDate: s.deathDate || s.death_date || '',
          deathPlace: s.deathPlace || s.death_place || '',
          bio: s.bio || '',
          isAlive: typeof s.isAlive === 'number' ? s.isAlive : (s.deathDate || s.death_date ? 0 : 1)
        }))
        .filter(s => s.name);
    } catch {
      return [];
    }
  }

  /**
   * 归一化 spouse_info 为 JSON 数组：
   * - 数组原样返回（多配偶场景）
   * - 单个对象包装为数组
   * - 空值返回空数组
   * - 剥离配偶对象中的 rank 字段（原语义为配偶在自家兄妹中的排行，已废弃）
   */
  private normalizeSpouseInfo(raw: unknown): unknown[] {
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object'
        ? [raw]
        : [];
    return list.map((s: any) => {
      if (s && typeof s === 'object') {
        const { rank, ...rest } = s;
        return rest;
      }
      return s;
    });
  }

  /**
   * 检查同一父亲下是否存在同名成员（排除自身）。
   * 返回 true 表示已存在，false 表示可用。
   */
  async checkDuplicate(
    familyId: number,
    name: string,
    fatherId: string,
    excludeMemberId: string
  ): Promise<{ exists: boolean }> {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);
    const trimmedName = name?.trim() || '';
    const trimmedFather = fatherId?.trim() || '';
    if (!trimmedName || !trimmedFather) {
      return { exists: false };
    }
    const [row] = await this.dataSource.query<Pick<FamilyMemberRow, 'id'>[]>(
      `SELECT \`id\` FROM \`${tableName}\`
       WHERE \`status\` = ?
         AND \`father_id\` = ?
         AND \`name\` = ?
         AND \`id\` <> ?
       LIMIT 1`,
      [1, trimmedFather, trimmedName, excludeMemberId || '']
    );
    return { exists: !!row };
  }

  private async ensureNoDuplicateName(
    familyId: number,
    fatherId: string,
    name: string,
    excludeMemberId: string
  ): Promise<void> {
    const { exists } = await this.checkDuplicate(familyId, name, fatherId, excludeMemberId);
    if (exists) {
      throw new HttpException('成员已经存在', HttpStatus.BAD_REQUEST);
    }
  }

  /** 创建成员 */
  async create(familyId: number, data: FamilyMemberCreateData) {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);
    if (!data.name || !data.name.trim()) {
      throw new HttpException('成员姓名不能为空', HttpStatus.BAD_REQUEST);
    }
    const gender = data.gender || 'male';
    if (!['male', 'female'].includes(gender)) {
      throw new HttpException('性别参数非法', HttpStatus.BAD_REQUEST);
    }
    if (!data.generation || data.generation < 1) {
      throw new HttpException('代数必须为正整数', HttpStatus.BAD_REQUEST);
    }
    // 字段长度校验（与表结构 VARCHAR 长度保持一致，防止无效数据录入）
    const name = data.name.trim();
    if (name.length > 50) {
      throw new HttpException('姓名不能超过50个字符', HttpStatus.BAD_REQUEST);
    }
    if ((data.generationName || '').length > 10) {
      throw new HttpException('字辈不能超过10个字符', HttpStatus.BAD_REQUEST);
    }
    if ((data.birthPlace || '').length > 200) {
      throw new HttpException('出生地不能超过200个字符', HttpStatus.BAD_REQUEST);
    }
    if ((data.deathPlace || '').length > 200) {
      throw new HttpException('安葬地点不能超过200个字符', HttpStatus.BAD_REQUEST);
    }

    const fatherId = data.fatherId?.trim() || '';
    const motherId = data.motherId?.trim() || '';

    if (data.generation === 1 && fatherId) {
      throw new HttpException('第1代成员不能有父亲', HttpStatus.BAD_REQUEST);
    }
    if (data.generation === 1 && motherId) {
      throw new HttpException('第1代成员不能有母亲', HttpStatus.BAD_REQUEST);
    }
    if (data.generation >= 2 && !fatherId) {
      throw new HttpException('第2代及以上成员必须选择父亲', HttpStatus.BAD_REQUEST);
    }

    if (fatherId || motherId) {
      await this.validateRelations(familyId, '', data.generation, fatherId, motherId);
    }

    // 同父同名唯一性校验
    if (fatherId && data.name) {
      await this.ensureNoDuplicateName(familyId, fatherId, name, '');
    }

    const memberId = this.generateMemberId();
    const sortOrder = typeof data.sortOrder === 'number' ? data.sortOrder : 0;
    const avatarUrl = this.validateAvatarUrl(data.avatarUrl);

    await this.dataSource.query(
      `INSERT INTO \`${tableName}\`
        (\`id\`, \`family_id\`, \`name\`, \`gender\`, \`generation\`, \`generation_name\`,
         \`birth_date\`, \`birth_place\`, \`is_alive\`, \`death_date\`, \`death_place\`,
         \`longitude\`, \`latitude\`, \`bio\`, \`avatar_url\`, \`father_id\`, \`mother_id\`,
         \`spouse_info\`, \`sort_order\`, \`status\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memberId, familyId, name, gender, data.generation, data.generationName || '',
        data.birthDate || '', data.birthPlace || '', data.isAlive ?? 1,
        data.deathDate || '', data.deathPlace || '',
        data.longitude ?? null, data.latitude ?? null, data.bio || '',
        avatarUrl,
        fatherId, motherId,
        JSON.stringify(this.normalizeSpouseInfo(data.spouseInfo)),
        sortOrder, 1
      ]
    );

    await this.dataSource.query(
      `UPDATE \`family\`
       SET \`member_count\` = GREATEST(CAST(member_count AS SIGNED) + ?, 0)
       WHERE \`id\` = ?`,
      [1, familyId]
    );

    // 成员照片
    if (Array.isArray(data.photos) && data.photos.length > 0) {
      await this.insertPhotos(familyId, memberId, data.photos);
    }

    return { id: memberId };
  }

  /** 更新成员 */
  async update(familyId: number, memberId: string, data: FamilyMemberUpdateData) {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);
    if (!memberId) {
      throw new HttpException('成员ID不能为空', HttpStatus.BAD_REQUEST);
    }

    const [exists] = await this.dataSource.query<{ id: string; status: number; generation: number; avatar_url: string }[]>(
      `SELECT \`id\`, \`status\`, \`generation\`, \`avatar_url\` FROM \`${tableName}\` WHERE \`id\` = ?`,
      [memberId]
    );
    if (!exists) {
      throw new HttpException('成员不存在', HttpStatus.NOT_FOUND);
    }
    const oldStatus = exists.status;
    const oldAvatarUrl = exists.avatar_url || '';

    if (data.name !== undefined && !data.name.trim()) {
      throw new HttpException('成员姓名不能为空', HttpStatus.BAD_REQUEST);
    }
    if (data.gender !== undefined && !['male', 'female'].includes(data.gender)) {
      throw new HttpException('性别参数非法', HttpStatus.BAD_REQUEST);
    }
    if (data.generation !== undefined && data.generation < 1) {
      throw new HttpException('代数必须为正整数', HttpStatus.BAD_REQUEST);
    }
    // 字段长度校验（与表结构 VARCHAR 长度保持一致，防止无效数据录入）
    if (data.name !== undefined && data.name.trim().length > 50) {
      throw new HttpException('姓名不能超过50个字符', HttpStatus.BAD_REQUEST);
    }
    if (data.generationName !== undefined && data.generationName.length > 10) {
      throw new HttpException('字辈不能超过10个字符', HttpStatus.BAD_REQUEST);
    }
    if (data.birthPlace !== undefined && data.birthPlace.length > 200) {
      throw new HttpException('出生地不能超过200个字符', HttpStatus.BAD_REQUEST);
    }
    if (data.deathPlace !== undefined && data.deathPlace.length > 200) {
      throw new HttpException('安葬地点不能超过200个字符', HttpStatus.BAD_REQUEST);
    }

    const fatherId = data.fatherId?.trim() || '';
    const motherId = data.motherId?.trim() || '';
    // 目标代数：优先取本次提交的代数，未提交时沿用库中当前代数
    const targetGeneration = data.generation ?? exists.generation ?? (await this.getGeneration(familyId, memberId));

    if (targetGeneration === 1 && fatherId) {
      throw new HttpException('第1代成员不能有父亲', HttpStatus.BAD_REQUEST);
    }
    if (targetGeneration === 1 && motherId) {
      throw new HttpException('第1代成员不能有母亲', HttpStatus.BAD_REQUEST);
    }
    if (targetGeneration >= 2 && data.fatherId !== undefined && fatherId === '') {
      throw new HttpException('第2代及以上成员必须选择父亲', HttpStatus.BAD_REQUEST);
    }

    // 关系校验用父亲：本次提交的父亲；仅提交母亲时沿用库中当前父亲，用于母亲序号校验
    let effectiveFatherId = fatherId;
    if (fatherId || motherId) {
      // 自引用/同人校验提前，避免在获取代数等前置查询后才报错
      if (fatherId === memberId) {
        throw new HttpException('父亲不能指向成员自己', HttpStatus.BAD_REQUEST);
      }
      if (motherId === memberId) {
        throw new HttpException('母亲不能指向成员自己', HttpStatus.BAD_REQUEST);
      }
      if (fatherId && fatherId === motherId) {
        throw new HttpException('父亲和母亲不能是同一人', HttpStatus.BAD_REQUEST);
      }
      if (!effectiveFatherId && motherId) {
        const [curRow] = await this.dataSource.query<{ father_id: string }[]>(
          `SELECT \`father_id\` FROM \`${tableName}\` WHERE \`id\` = ?`,
          [memberId]
        );
        effectiveFatherId = curRow?.father_id || '';
      }
      await this.validateRelations(familyId, memberId, targetGeneration, effectiveFatherId, motherId);
    }

    // 同父同名唯一性校验（未变更父亲时按当前父亲校验）
    if (effectiveFatherId && data.name) {
      await this.ensureNoDuplicateName(familyId, effectiveFatherId, data.name.trim(), memberId);
    }

    const fields: string[] = [];
    const values: QueryValues = [];

    if (data.name !== undefined) { fields.push('`name` = ?'); values.push(data.name.trim()); }
    if (data.gender !== undefined) { fields.push('`gender` = ?'); values.push(data.gender); }
    if (data.generation !== undefined) { fields.push('`generation` = ?'); values.push(data.generation); }
    if (data.generationName !== undefined) { fields.push('`generation_name` = ?'); values.push(data.generationName || ''); }
    if (data.birthDate !== undefined) { fields.push('`birth_date` = ?'); values.push(data.birthDate || ''); }
    if (data.birthPlace !== undefined) { fields.push('`birth_place` = ?'); values.push(data.birthPlace || ''); }
    if (data.isAlive !== undefined) { fields.push('`is_alive` = ?'); values.push(data.isAlive); }
    if (data.deathDate !== undefined) { fields.push('`death_date` = ?'); values.push(data.deathDate || ''); }
    if (data.deathPlace !== undefined) { fields.push('`death_place` = ?'); values.push(data.deathPlace || ''); }
    if (data.longitude !== undefined) { fields.push('`longitude` = ?'); values.push(data.longitude ?? null); }
    if (data.latitude !== undefined) { fields.push('`latitude` = ?'); values.push(data.latitude ?? null); }
    if (data.bio !== undefined) { fields.push('`bio` = ?'); values.push(data.bio || ''); }
    if (data.avatarUrl !== undefined) { fields.push('`avatar_url` = ?'); values.push(this.validateAvatarUrl(data.avatarUrl)); }
    if (data.fatherId !== undefined) { fields.push('`father_id` = ?'); values.push(fatherId); }
    if (data.motherId !== undefined) { fields.push('`mother_id` = ?'); values.push(motherId); }
    if (data.spouseInfo !== undefined) { fields.push('`spouse_info` = ?'); values.push(JSON.stringify(this.normalizeSpouseInfo(data.spouseInfo))); }
    if (data.sortOrder !== undefined) { fields.push('`sort_order` = ?'); values.push(data.sortOrder); }
    if (data.status !== undefined) { fields.push('`status` = ?'); values.push(data.status); }

    const hasPhotoChange = data.photos !== undefined;
    if (fields.length === 0 && !hasPhotoChange) {
      throw new HttpException('未提供可更新字段', HttpStatus.BAD_REQUEST);
    }

    if (fields.length > 0) {
      values.push(memberId);
      await this.dataSource.query(
        `UPDATE \`${tableName}\` SET ${fields.join(', ')} WHERE \`id\` = ?`,
        values
      );
    }

    // 头像更换即释放旧头像占用的家族存储（幂等；空值/未变化不处理）
    if (data.avatarUrl !== undefined && oldAvatarUrl && oldAvatarUrl !== this.validateAvatarUrl(data.avatarUrl)) {
      await this.entitlementService.releaseStorage(oldAvatarUrl);
    }

    // 成员照片整体替换（传入即覆盖）
    if (hasPhotoChange) {
      await this.replacePhotos(familyId, memberId, data.photos || []);
    }

    // status 变更时同步 family.member_count（1→0 减一，0→1 加一）
    if (data.status !== undefined && data.status !== oldStatus) {
      const delta = oldStatus === 1 && data.status === 0 ? -1 : oldStatus === 0 && data.status === 1 ? 1 : 0;
      if (delta !== 0) {
        await this.dataSource.query(
          `UPDATE \`family\`
           SET \`member_count\` = GREATEST(CAST(member_count AS SIGNED) + ?, 0)
           WHERE \`id\` = ?`,
          [delta, familyId]
        );
      }
    }

    return { id: memberId };
  }

  /** 软删除 */
  async delete(familyId: number, memberId: string) {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);

    const [exists] = await this.dataSource.query<{ id: string; avatar_url: string }[]>(
      `SELECT \`id\`, \`avatar_url\` FROM \`${tableName}\` WHERE \`id\` = ? AND \`status\` = ?`,
      [memberId, 1]
    );
    if (!exists) {
      throw new HttpException('成员不存在', HttpStatus.NOT_FOUND);
    }

    const result: any = await this.dataSource.query(
      `UPDATE \`${tableName}\` SET \`status\` = 0 WHERE \`id\` = ? AND \`status\` = 1`,
      [memberId]
    );
    const affected = result?.affectedRows ?? 0;

    if (affected > 0) {
      await this.dataSource.query(
        `UPDATE \`family\`
         SET \`member_count\` = GREATEST(CAST(member_count AS SIGNED) + ?, 0)
         WHERE \`id\` = ?`,
        [-1, familyId]
      );
      // 删除即释放：成员头像与照片解除家族存储占用（幂等）
      if (exists.avatar_url) {
        await this.entitlementService.releaseStorage(exists.avatar_url);
      }
      const photos = await this.getPhotos(familyId, memberId);
      for (const url of photos) {
        await this.entitlementService.releaseStorage(url);
      }
    }

    return { affected };
  }

  /** 切换是否在世状态 */
  async toggleAlive(familyId: number, memberId: string) {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);

    const [row] = await this.dataSource.query<Pick<FamilyMemberRow, 'is_alive'>[]>(
      `SELECT \`is_alive\` FROM \`${tableName}\` WHERE \`id\` = ? AND \`status\` = ?`,
      [memberId, 1]
    );
    if (!row) throw new HttpException('成员不存在', HttpStatus.NOT_FOUND);

    const next = row.is_alive === 1 ? 0 : 1;
    await this.dataSource.query(
      `UPDATE \`${tableName}\` SET \`is_alive\` = ? WHERE \`id\` = ?`,
      [next, memberId]
    );

    return { isAlive: next };
  }

  /** 判断家族成员表是否存在 */
  async exists(familyId: number): Promise<boolean> {
    try {
      await this.ensureTable(familyId);
      return true;
    } catch {
      return false;
    }
  }

  /** 获取当前代数 */
  private async getGeneration(familyId: number, memberId: string): Promise<number> {
    const tableName = getSafeMemberTableName(familyId);
    const [row] = await this.dataSource.query<Pick<FamilyMemberRow, 'generation'>[]>(
      `SELECT \`generation\` FROM \`${tableName}\` WHERE \`id\` = ? AND \`status\` = ?`,
      [memberId, 1]
    );
    return row?.generation ?? 1;
  }

  /**
   * 校验父/母关系合法性：
   * 1. 父必须存在且状态正常
   * 2. 父、母不能与当前成员相同（不自引用）
   * 3. 父、母不能指向彼此
   * 4. 父的 generation 必须是当前 generation - 1
   * 5. 父必须是男性
   * 6. 母亲ID必须是该父亲配偶数组中的有效序号（0 <= 序号 < 配偶数）
   * 7. 无循环引用（从父亲向上追溯祖先，出现当前成员即成环）
   *
   * 注：motherId 存储的是父亲 spouse_info 数组中配偶的下标（从0开始，非成员ID），
   * 因此不参与成员存在性/性别/代数/循环引用校验，仅做序号合法性校验。
   */
  private async validateRelations(
    familyId: number,
    memberId: string,
    generation: number,
    fatherId: string,
    motherId: string
  ) {
    const tableName = getSafeMemberTableName(familyId);
    const fatherTrimmed = (fatherId || '').trim();
    const motherTrimmed = (motherId || '').trim();
    const ids = fatherTrimmed ? [fatherTrimmed] : [];

    if (motherTrimmed && ids.length === 0) {
      throw new HttpException('选择母亲前必须先选择父亲', HttpStatus.BAD_REQUEST);
    }

    if (fatherTrimmed && fatherTrimmed === memberId) {
      throw new HttpException('父亲不能指向成员自己', HttpStatus.BAD_REQUEST);
    }
    if (motherTrimmed && motherTrimmed === memberId) {
      throw new HttpException('母亲不能指向成员自己', HttpStatus.BAD_REQUEST);
    }
    if (fatherTrimmed && fatherTrimmed === motherTrimmed) {
      throw new HttpException('父亲和母亲不能是同一人', HttpStatus.BAD_REQUEST);
    }

    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(',');
    const rows = await this.dataSource.query<Pick<FamilyMemberRow, 'id' | 'gender' | 'generation' | 'spouse_info'>[]>(
      `SELECT \`id\`, \`gender\`, \`generation\`, \`spouse_info\` FROM \`${tableName}\`
       WHERE \`id\` IN (${placeholders}) AND \`status\` = ?`,
      [...ids, 1]
    );

    if (rows.length !== ids.length) {
      throw new HttpException('父/母成员不存在', HttpStatus.BAD_REQUEST);
    }

    const map = new Map(rows.map(r => [r.id, r]));

    const father = map.get(fatherTrimmed)!;
    if (father.gender !== 'male') {
      throw new HttpException('父亲必须是男性成员', HttpStatus.BAD_REQUEST);
    }
    if (father.generation !== generation - 1) {
      throw new HttpException('父亲必须是上一代成员', HttpStatus.BAD_REQUEST);
    }

    // 母亲ID即父亲配偶数组下标（从0开始），必须是有效序号
    if (motherTrimmed) {
      if (!/^\d+$/.test(motherTrimmed)) {
        throw new HttpException('母亲ID必须是数字序号', HttpStatus.BAD_REQUEST);
      }
      const spouseCount = this.extractSpouseNames(father.spouse_info).length;
      if (spouseCount === 0) {
        throw new HttpException('父亲暂无配偶信息，无需选择母亲', HttpStatus.BAD_REQUEST);
      }
      if (Number(motherTrimmed) >= spouseCount) {
        throw new HttpException('母亲序号超出父亲配偶数量，请重新选择', HttpStatus.BAD_REQUEST);
      }
    }

    // 循环引用检测：仅从父亲向上追溯祖先，若祖先链中出现当前成员则形成环。
    // 新增成员（memberId 为空）不可能成环，跳过以减少查询。
    if (!memberId) return;

    const visited = new Set<string>();
    const queue = [fatherTrimmed];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      if (current === memberId) {
        throw new HttpException('检测到循环引用关系', HttpStatus.BAD_REQUEST);
      }
      const [parentRow] = await this.dataSource.query<Pick<FamilyMemberRow, 'father_id' | 'mother_id'>[]>(
        `SELECT \`father_id\`, \`mother_id\` FROM \`${tableName}\` WHERE \`id\` = ?`,
        [current]
      );
      if (parentRow) {
        if (parentRow.father_id) queue.push(parentRow.father_id);
        // mother_id 是父亲配偶数组下标（非成员ID），不参与循环引用链
      }
    }
  }

  /**
   * 批量导入核心（JSON 批量导入与文件导入共用）：
   * 两遍处理，导入行顺序无关——
   * 1. 先校验并插入全部合法行（父/母关系暂置空），记录 外部refId -> 新成员ID 映射；
   * 2. 再按 fatherRefId / motherRefId 回填父/母关系（换算为系统生成的成员ID）。
   *
   * query 为查询执行函数：JSON 导入传连接查询；文件导入传事务内查询（保证原子性）。
   * rowNos 可选：当 items 下标与原始文件行号不一致时（解析阶段已过滤非法行），
   * 用于让错误提示指向正确的原始行号；缺省时按 items 下标 +1 提示。
   */
  async importItems(
    query: (sql: string, params?: QueryValues) => Promise<any>,
    tableName: string,
    familyId: number,
    items: FamilyMemberImportItem[],
    errors: string[],
    rowNos?: number[]
  ): Promise<number> {
    const label = (i: number) => (rowNos ? `第 ${rowNos[i]} 行` : `第 ${i + 1} 行`);
    // 与 items 下标对齐：成功插入的行记录 { refId, memberId }，失败行为 null
    const rows: ({ refId: string; memberId: string } | null)[] = new Array(items.length).fill(null);
    const seenRef = new Set<string>();

    // ---------- 第一遍：校验并插入全部合法行 ----------
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const refId = (item.refId || '').trim();
      if (!item.name || !item.name.trim()) {
        errors.push(`${label(i)}：姓名不能为空`);
        continue;
      }
      const gender = item.gender || 'male';
      if (!['male', 'female'].includes(gender)) {
        errors.push(`${label(i)}：性别参数非法`);
        continue;
      }
      const generation = item.generation ?? 1;
      if (generation < 1) {
        errors.push(`${label(i)}：代数必须为正整数`);
        continue;
      }
      if (refId && seenRef.has(refId)) {
        errors.push(`${label(i)}：refId '${refId}' 重复`);
        continue;
      }
      if (refId) seenRef.add(refId);

      const memberId = this.generateMemberId();
      try {
        await query(
          `INSERT INTO \`${tableName}\`
            (\`id\`, \`family_id\`, \`name\`, \`gender\`, \`generation\`, \`generation_name\`,
             \`birth_date\`, \`birth_place\`, \`is_alive\`, \`death_date\`, \`death_place\`,
             \`longitude\`, \`latitude\`, \`bio\`,\`father_id\`, \`mother_id\`,
             \`spouse_info\`, \`sort_order\`, \`status\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            memberId, familyId, item.name.trim(), gender, generation, item.generationName || '',
            item.birthDate || '', item.birthPlace || '', item.isAlive ?? 1,
            item.deathDate || '', item.deathPlace || '',
            item.longitude ?? null, item.latitude ?? null, item.bio || '',
            '', '', JSON.stringify(item.spouseInfo && item.spouseInfo.length ? item.spouseInfo : []), item.sortOrder ?? 0, 1
          ]
        );
        rows[i] = { refId, memberId };
      } catch (err: any) {
        errors.push(`${label(i)}：${err.message || '导入失败'}`);
      }
    }

    const imported = rows.filter((row) => row !== null).length;
    if (imported === 0) return 0;

    // ---------- 第二遍：回填父/母关系（refId -> 新成员ID） ----------
    const idMap = new Map<string, string>();
    for (const row of rows) {
      if (row) idMap.set(row.refId, row.memberId);
    }

    for (let i = 0; i < items.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const item = items[i];

      let fatherId = '';
      let motherId = '';
      // 引用解析优先级：文件内外部ID -> 库中已有成员的系统ID（32位hex）
      if (item.fatherRefId) {
        const fr = String(item.fatherRefId).trim();
        if (fr === row.refId) {
          errors.push(`${label(i)}：父亲 refId 不能指向自己`);
        } else if (idMap.has(fr)) {
          fatherId = idMap.get(fr)!;
        } else if (/^[0-9a-f]{32}$/.test(fr)) {
          const [exists] = await query(
            `SELECT \`id\` FROM \`${tableName}\` WHERE \`id\` = ? AND \`status\` = 1`,
            [fr]
          );
          if (exists) {
            fatherId = fr;
          } else {
            errors.push(`${label(i)}：父亲ID「${fr}」不存在`);
          }
        } else {
          errors.push(`${label(i)}：父亲 refId '${fr}' 不存在`);
        }
      }
      // 母亲ID：父亲配偶信息数组中的序号（数字，非成员ID），需先有有效父亲，无需查库
      if (item.motherRefId) {
        if (!fatherId) {
          errors.push(`${label(i)}：母亲ID需要先指定有效的父亲`);
        } else {
          motherId = String(item.motherRefId).trim();
        }
      }
      if (!fatherId && !motherId) continue;

      await query(
        `UPDATE \`${tableName}\` SET \`father_id\` = ?, \`mother_id\` = ? WHERE \`id\` = ?`,
        [fatherId, motherId, row.memberId]
      );
    }

    return imported;
  }

  /** 批量导入（JSON 数组，来自管理后台/小程序接口） */
  async batchImport(familyId: number, items: FamilyMemberImportItem[]) {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);

    if (!items || items.length === 0) {
      throw new HttpException('导入数据不能为空', HttpStatus.BAD_REQUEST);
    }

    const errors: string[] = [];
    const imported = await this.importItems(
      (sql, params) => this.dataSource.query(sql, params),
      tableName,
      familyId,
      items,
      errors
    );

    if (imported > 0) {
      await this.dataSource.query(
        `UPDATE \`family\`
         SET \`member_count\` = GREATEST(CAST(member_count AS SIGNED) + ?, 0)
         WHERE \`id\` = ?`,
        [imported, familyId]
      );
    }

    return { imported, errors, total: items.length };
  }
}
