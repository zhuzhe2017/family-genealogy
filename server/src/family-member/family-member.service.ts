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

  /** 确保家族成员分表存在 */
  private async ensureTable(familyId: number): Promise<void> {
    const tableName = getSafeMemberTableName(familyId);
    const [rows] = await this.dataSource.query<{ exists: 0 | 1 }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ?) AS \`exists\``,
      [tableName]
    );
    if (!rows?.exists) {
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
    if (!photoRows?.exists) {
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
  async getAll(familyId: number, params: { keyword?: string; generation?: number; status?: number } = {}) {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);
    const { keyword, generation, status } = params;
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

  /** 查询成员照片URL数组 */
  private async getPhotos(familyId: number, memberId: string): Promise<string[]> {
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
   * 查询父亲候选：当前家族上一代男性成员中按父亲姓名或母亲姓名模糊匹配。
   * 返回结果携带 spouse_names（配偶/母亲姓名摘要），便于同名父亲区分。
   * 触发条件：keyword 至少 1 个字符。
   */
  async getFatherCandidates(familyId: number, generation: number, keyword: string): Promise<FatherCandidate[]> {
    await this.ensureTable(familyId);
    if (generation === undefined || generation === null || generation < 2) {
      throw new HttpException('只有第2代及以上成员才允许选择父亲', HttpStatus.BAD_REQUEST);
    }
    const trimmed = keyword?.trim() || '';
    if (trimmed.length < 1) {
      throw new HttpException('请输入至少1个字符进行搜索', HttpStatus.BAD_REQUEST);
    }

    const tableName = getSafeMemberTableName(familyId);
    const fatherGeneration = generation - 1;
    const like = `%${trimmed}%`;

    const rows = await this.dataSource.query<Pick<FamilyMemberRow, 'id' | 'name' | 'gender' | 'generation' | 'generation_name' | 'spouse_info'>[]>(
      `SELECT \`id\`, \`name\`, \`gender\`, \`generation\`, \`generation_name\`, \`spouse_info\`
       FROM \`${tableName}\`
       WHERE \`status\` = ?
         AND \`gender\` = ?
         AND \`generation\` = ?
         AND (\`name\` LIKE ? OR IFNULL(\`spouse_info\`, '') LIKE ?)
       ORDER BY \`sort_order\` ASC, \`create_time\` ASC
       LIMIT 20`,
      [1, 'male', fatherGeneration, like, like]
    );

    return rows.map(r => {
      const names = this.extractSpouseNames(r.spouse_info);
      return {
        id: r.id,
        name: r.name,
        gender: r.gender,
        generation: r.generation,
        generation_name: r.generation_name,
        spouse_names: names.join('、')
      };
    });
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
   * 从 father.spouse_info JSON 数组解析，按 rank 序号返回。
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
        .map((s: any, index: number) => ({
          rank: typeof s.rank === 'number' ? s.rank : index,
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

    const fatherId = data.fatherId?.trim() || '';
    const motherId = data.motherId?.trim() || '';

    if (data.generation === 1 && fatherId) {
      throw new HttpException('第1代成员不能有父亲', HttpStatus.BAD_REQUEST);
    }
    if (data.generation >= 2 && !fatherId) {
      throw new HttpException('第2代及以上成员必须选择父亲', HttpStatus.BAD_REQUEST);
    }

    if (fatherId || motherId) {
      await this.validateRelations(familyId, '', data.generation, fatherId, motherId);
    }

    // 同父同名唯一性校验
    if (fatherId && data.name) {
      await this.ensureNoDuplicateName(familyId, fatherId, data.name.trim(), '');
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
        memberId, familyId, data.name.trim(), gender, data.generation, data.generationName || '',
        data.birthDate || '', data.birthPlace || '', data.isAlive ?? 1,
        data.deathDate || '', data.deathPlace || '',
        data.longitude ?? null, data.latitude ?? null, data.bio || '',
        avatarUrl,
        fatherId, motherId,
        data.spouseInfo ? JSON.stringify(data.spouseInfo) : JSON.stringify([]),
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

    if (data.generation !== undefined) {
      const fatherId = data.fatherId !== undefined ? data.fatherId?.trim() || '' : undefined;
      if (data.generation === 1 && fatherId) {
        throw new HttpException('第1代成员不能有父亲', HttpStatus.BAD_REQUEST);
      }
      if (data.generation >= 2 && fatherId === '') {
        throw new HttpException('第2代及以上成员必须选择父亲', HttpStatus.BAD_REQUEST);
      }
    }

    const fatherId = data.fatherId?.trim() || '';
    const motherId = data.motherId?.trim() || '';

    if (fatherId || motherId) {
      // 自引用/同人校验提前，避免在获取代数等前置查询后才报错
      if (fatherId === memberId || motherId === memberId) {
        throw new HttpException('父/母不能指向成员自己', HttpStatus.BAD_REQUEST);
      }
      if (fatherId && fatherId === motherId) {
        throw new HttpException('父亲和母亲不能是同一人', HttpStatus.BAD_REQUEST);
      }
      const generation = data.generation ?? exists.generation ?? (await this.getGeneration(familyId, memberId));
      await this.validateRelations(familyId, memberId, generation, fatherId, motherId);
    }

    // 同父同名唯一性校验
    if (fatherId && data.name) {
      await this.ensureNoDuplicateName(familyId, fatherId, data.name.trim(), memberId);
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
    if (data.spouseInfo !== undefined) { fields.push('`spouse_info` = ?'); values.push(data.spouseInfo ? JSON.stringify(data.spouseInfo) : JSON.stringify([])); }
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
   * 1. 父/母必须存在且状态正常
   * 2. 父、母不能与当前成员相同（不自引用）
   * 3. 父、母不能指向彼此
   * 4. 父的 generation 必须是当前 generation - 1
   * 5. 父必须是男性
   * 6. 无循环引用（BFS 深度上限 100）
   *
   * 注：motherId 存储的是父亲 spouse_info 中配偶的 rank 序号（非成员ID），
   * 因此不参与成员存在性/性别/代数/循环引用校验。
   */
  private async validateRelations(
    familyId: number,
    memberId: string,
    generation: number,
    fatherId: string,
    motherId: string
  ) {
    const tableName = getSafeMemberTableName(familyId);
    const ids = [fatherId].filter(Boolean);
    if (ids.length === 0) return;

    if ((fatherId && fatherId === memberId) || (motherId && motherId === memberId)) {
      throw new HttpException('父/母不能指向成员自己', HttpStatus.BAD_REQUEST);
    }

    if (fatherId && fatherId === motherId) {
      throw new HttpException('父亲和母亲不能是同一人', HttpStatus.BAD_REQUEST);
    }

    const placeholders = ids.map(() => '?').join(',');
    const rows = await this.dataSource.query<Pick<FamilyMemberRow, 'id' | 'gender' | 'generation'>[]>(
      `SELECT \`id\`, \`gender\`, \`generation\` FROM \`${tableName}\`
       WHERE \`id\` IN (${placeholders}) AND \`status\` = ?`,
      [...ids, 1]
    );

    if (rows.length !== ids.length) {
      throw new HttpException('父/母成员不存在', HttpStatus.BAD_REQUEST);
    }

    const map = new Map(rows.map(r => [r.id, r]));

    if (fatherId) {
      const father = map.get(fatherId)!;
      if (father.gender !== 'male') {
        throw new HttpException('父亲必须是男性成员', HttpStatus.BAD_REQUEST);
      }
      if (father.generation !== generation - 1) {
        throw new HttpException('父亲必须是上一代成员', HttpStatus.BAD_REQUEST);
      }
    }

    // 循环引用检测：仅从父亲向上追溯祖先，若祖先链中出现当前成员则形成环。
    // 新增成员（memberId 为空）不可能成环，跳过以减少查询。
    if (!memberId) return;

    const visited = new Set<string>();
    const queue = [fatherId];
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
        if (parentRow.mother_id) queue.push(parentRow.mother_id);
      }
    }
  }

  /** 批量导入 */
  async batchImport(familyId: number, items: FamilyMemberImportItem[]) {
    await this.ensureTable(familyId);
    const tableName = getSafeMemberTableName(familyId);

    if (!items || items.length === 0) {
      throw new HttpException('导入数据不能为空', HttpStatus.BAD_REQUEST);
    }

    const errors: string[] = [];
    let imported = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.name || !item.name.trim()) {
        errors.push(`第 ${i + 1} 行：姓名不能为空`);
        continue;
      }
      const gender = item.gender || 'male';
      if (!['male', 'female'].includes(gender)) {
        errors.push(`第 ${i + 1} 行：性别参数非法`);
        continue;
      }
      const generation = item.generation ?? 1;
      if (generation < 1) {
        errors.push(`第 ${i + 1} 行：代数必须为正整数`);
        continue;
      }

      const memberId = this.generateMemberId();
      try {
        await this.dataSource.query(
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
            '', '', JSON.stringify([]), item.sortOrder ?? 0, 1
          ]
        );
        imported++;
      } catch (err: any) {
        errors.push(`第 ${i + 1} 行：${err.message || '导入失败'}`);
      }
    }

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
