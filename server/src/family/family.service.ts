import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import {
  type FamilyRow,
  type FamilyQueryParams,
  type FamilyAllQueryParams,
  type FamilyCreateData,
  type FamilyUpdateData
} from './types/family.types';
import { type FamilyStats, type QueryValues, type DataRow } from '../common/types/common';

@Injectable()
export class FamilyService {
  constructor(private readonly dataSource: DataSource) {}

  /** 成员表名基础前缀 */
  private readonly MEMBER_TABLE_PREFIX = 'family_members';

  /** 邀请码/分享码字符表（去除易混淆字符 0/O/1/I） */
  private readonly SHARE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /** 获取家族成员分表名，例如 family_members_1 */
  private getMemberTableName(familyId: number): string {
    return `${this.MEMBER_TABLE_PREFIX}_${familyId}`;
  }

  /** 对表名做安全校验（仅允许数字下划线字母） */
  private validateTableName(name: string): void {
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new HttpException('生成的成员表名不合法', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** 验证姓氏ID是否有效（存在且启用），无效则抛异常 */
  private async validateSurnameId(surnameId: number): Promise<void> {
    if (!surnameId || surnameId <= 0) return; // 0/null/负数视为不关联，跳过
    const [row] = await this.dataSource.query<Pick<FamilyRow, 'id'>[]>(
      'SELECT `id` FROM `surname` WHERE `id` = ? AND `status` = 1',
      [surnameId]
    );
    if (!row) throw new HttpException('姓氏ID无效，请选择有效的姓氏', HttpStatus.BAD_REQUEST);
  }

  /** 家族创建者用户ID（用于成员编辑权限判断；家族不存在或已停用返回 null） */
  async getCreatorUserId(familyId: number): Promise<string | null> {
    const [row] = await this.dataSource.query<Pick<FamilyRow, 'creator_user_id'>[]>(
      'SELECT `creator_user_id` FROM `family` WHERE `id` = ? AND `status` = 1 LIMIT 1',
      [familyId]
    );
    return row?.creator_user_id ?? null;
  }

  /** 分页列表（含字辈信息） */
  async getList(params: FamilyQueryParams) {
    const { page, pageSize, keyword, status, isPublic } = params;
    const offset = (page - 1) * pageSize;
    const where: string[] = [];
    const values: QueryValues = [];

    if (keyword) {
      where.push('(`f`.`name` LIKE ? OR `f`.`founder` LIKE ? OR `f`.`origin` LIKE ? OR `gt`.`surname` LIKE ? OR `gt`.`founder` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (status !== undefined && status !== null) {
      where.push('`f`.`status` = ?');
      values.push(status);
    } else {
      // 默认不展示已删除
      where.push('`f`.`status` = ?');
      values.push(1);
    }
    if (isPublic !== undefined && isPublic !== null) {
      where.push('`f`.`is_public` = ?');
      values.push(isPublic);
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`family\` \`f\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<FamilyRow[]>(
      `SELECT \`f\`.\`id\`, \`f\`.\`surname_id\`, \`s\`.\`surname\` AS \`surname_name\`,
              \`f\`.\`generation_table_id\`,
              \`gt\`.\`surname\` AS \`generation_table_surname\`,
              \`gt\`.\`founder\` AS \`generation_table_founder\`,
              \`gt\`.\`generation_sequence\` AS \`generation_sequence\`,
              \`f\`.\`name\`, \`f\`.\`logo\`, \`f\`.\`founder\`, \`f\`.\`origin\`, \`f\`.\`description\`,
              \`f\`.\`is_public\`, \`f\`.\`allow_join\`, \`f\`.\`member_count\`, \`f\`.\`gen_count\`, \`f\`.\`seed_share_code\`,
              \`f\`.\`creator_id\`, \`f\`.\`creator_user_id\`, \`f\`.\`status\`, \`f\`.\`create_time\`, \`f\`.\`update_time\`
       FROM \`family\` \`f\`
       LEFT JOIN \`surname\` \`s\` ON \`f\`.\`surname_id\` = \`s\`.\`id\`
       LEFT JOIN \`generation_table\` \`gt\` ON \`f\`.\`generation_table_id\` = \`gt\`.\`id\`
       ${whereClause}
       ORDER BY \`f\`.\`create_time\` DESC, \`f\`.\`id\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    // 批量补充关联统计（成员数/事件数/照片数/文档数/动态数/管理员数）
    const ids = list.map((r: FamilyRow) => r.id);
    const statsMap = await this.batchStats(ids);

    const parse = (v: unknown): unknown => (typeof v === 'string' ? JSON.parse(v) : v);
    return {
      list: list.map((row: FamilyRow) => ({
        ...row,
        generation_sequence: row.generation_sequence ? parse(row.generation_sequence) : null,
        realMemberCount: statsMap[row.id]?.memberCount ?? 0,
        eventCount: statsMap[row.id]?.eventCount ?? 0,
        photoCount: statsMap[row.id]?.photoCount ?? 0,
        documentCount: statsMap[row.id]?.documentCount ?? 0,
        dynamicCount: statsMap[row.id]?.dynamicCount ?? 0,
        adminCount: statsMap[row.id]?.adminCount ?? 0
      })),
      total,
      page,
      pageSize
    };
  }

  /** 获取全部家族（不分页，用于下拉选择） */
  async getAll(params: FamilyAllQueryParams) {
    const { keyword, status } = params;
    const where: string[] = [];
    const values: QueryValues = [];

    if (keyword) {
      where.push('(`f`.`name` LIKE ? OR `f`.`founder` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (status !== undefined && status !== null) {
      where.push('`f`.`status` = ?');
      values.push(status);
    } else {
      where.push('`f`.`status` = ?');
      values.push(1);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const rows = await this.dataSource.query<FamilyRow[]>(
      `SELECT \`f\`.\`id\`, \`f\`.\`name\`, \`f\`.\`founder\`, \`f\`.\`origin\`, \`f\`.\`member_count\`, \`f\`.\`gen_count\`, \`f\`.\`status\`,
              \`f\`.\`generation_table_id\`, \`gt\`.\`surname\` AS \`generation_table_surname\`,
              \`gt\`.\`founder\` AS \`generation_table_founder\`, \`gt\`.\`generation_sequence\` AS \`generation_sequence\`
       FROM \`family\` \`f\`
       LEFT JOIN \`generation_table\` \`gt\` ON \`f\`.\`generation_table_id\` = \`gt\`.\`id\`
       ${whereClause}
       ORDER BY \`f\`.\`name\` ASC`,
      values
    );
    const parse = (v: unknown): unknown => (typeof v === 'string' ? JSON.parse(v) : v);
    return rows.map((row: FamilyRow) => ({
      ...row,
      generation_sequence: row.generation_sequence ? parse(row.generation_sequence) : null
    }));
  }

  /** 获取单条（含关联统计与字辈信息） */
  async getById(id: number) {
    const [row] = await this.dataSource.query<FamilyRow[]>(
      `SELECT \`f\`.\`id\`, \`f\`.\`surname_id\`, \`s\`.\`surname\` AS \`surname_name\`,
              \`f\`.\`generation_table_id\`,
              \`gt\`.\`surname\` AS \`generation_table_surname\`,
              \`gt\`.\`founder\` AS \`generation_table_founder\`,
              \`gt\`.\`generation_sequence\` AS \`generation_sequence\`,
              \`f\`.\`name\`, \`f\`.\`logo\`, \`f\`.\`founder\`, \`f\`.\`origin\`, \`f\`.\`description\`,
              \`f\`.\`is_public\`, \`f\`.\`allow_join\`, \`f\`.\`member_count\`, \`f\`.\`gen_count\`, \`f\`.\`seed_share_code\`,
              \`f\`.\`creator_id\`, \`f\`.\`creator_user_id\`, \`f\`.\`status\`, \`f\`.\`create_time\`, \`f\`.\`update_time\`
       FROM \`family\` \`f\`
       LEFT JOIN \`surname\` \`s\` ON \`f\`.\`surname_id\` = \`s\`.\`id\`
       LEFT JOIN \`generation_table\` \`gt\` ON \`f\`.\`generation_table_id\` = \`gt\`.\`id\`
       WHERE \`f\`.\`id\` = ?`,
      [id]
    );
    if (!row) throw new HttpException('家族不存在', HttpStatus.NOT_FOUND);

    const stats = (await this.batchStats([id]))[id];
    const parse = (v: unknown): unknown => (typeof v === 'string' ? JSON.parse(v) : v);
    return {
      ...row,
      generation_sequence: row.generation_sequence ? parse(row.generation_sequence) : null,
      ...stats
    };
  }

  /** 创建家族 */
  async create(data: FamilyCreateData) {
    if (!data.name || !data.name.trim()) {
      throw new HttpException('家族名称不能为空', HttpStatus.BAD_REQUEST);
    }

    // 姓氏ID有效性校验
    if (data.surnameId !== undefined && data.surnameId !== null) {
      await this.validateSurnameId(data.surnameId);
    }

    // 字辈表ID有效性校验（若提供）
    if (data.generationTableId !== undefined && data.generationTableId !== null) {
      const [gt] = await this.dataSource.query<Pick<GenerationTableRow, 'id' | 'status' | 'generation_sequence'>[]>(
        'SELECT `id`, `status`, `generation_sequence` FROM `generation_table` WHERE `id` = ?',
        [data.generationTableId]
      );
      if (!gt) throw new HttpException('关联字辈表不存在', HttpStatus.BAD_REQUEST);
      if (gt.status !== 1) throw new HttpException('只能关联启用的字辈表', HttpStatus.BAD_REQUEST);
      try {
        const seq = typeof gt.generation_sequence === 'string' ? (JSON.parse(gt.generation_sequence) as unknown) : gt.generation_sequence;
        if (!Array.isArray(seq) || seq.length === 0) {
          throw new HttpException('字辈表数据异常，无有效字辈序列', HttpStatus.BAD_REQUEST);
        }
      } catch {
        throw new HttpException('字辈表数据异常，无法解析字辈序列', HttpStatus.BAD_REQUEST);
      }
    }

    // 名称唯一性校验（同 status=1 范围内）
    const [dup] = await this.dataSource.query<Pick<FamilyRow, 'id'>[]>(
      'SELECT `id` FROM `family` WHERE `name` = ? AND `status` = 1',
      [data.name.trim()]
    );
    if (dup) throw new HttpException('家族名称已存在', HttpStatus.BAD_REQUEST);

    const seedShareCode = await this.generateUniqueSeedShareCode();

    const familyId = await this.dataSource.transaction(async manager => {
      // 1. 插入家族主表
      const insertResult = await manager.query<InsertResult>(
        `INSERT INTO \`family\`
         (\`surname_id\`, \`generation_table_id\`, \`name\`, \`logo\`, \`founder\`, \`origin\`, \`description\`,
          \`is_public\`, \`allow_join\`, \`seed_share_code\`, \`creator_id\`, \`creator_user_id\`, \`status\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          data.surnameId ?? null,
          data.generationTableId ?? null,
          data.name.trim(),
          data.logo || '',
          data.founder || '',
          data.origin || '',
          data.description || null,
          data.isPublic ?? 1,
          data.allowJoin ?? 1,
          seedShareCode,
          data.creatorId ?? null,
          data.creatorUserId ?? null
        ]
      );
      const id = insertResult.insertId;
      if (!id || id <= 0) {
        throw new HttpException('家族创建失败，未能获取家族ID', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // 2. 创建对应的家族成员分表
      const tableName = this.getMemberTableName(id);
      this.validateTableName(tableName);
      await this.createMemberTable(manager, tableName);
      return id;
    });

    return { id: familyId, seedShareCode };
  }

  /**
   * 创建家族成员表
   * 表名：family_members_{familyId}
   */
  private async createMemberTable(manager: EntityManager, tableName: string): Promise<void> {
    await manager.query(
      `CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        \`id\`            VARCHAR(32)   NOT NULL COMMENT '成员ID',
        \`family_id\`     INT UNSIGNED  NOT NULL COMMENT '所属家族ID',
        \`name\`          VARCHAR(50)   NOT NULL COMMENT '姓名',
        \`gender\`        VARCHAR(10)   NOT NULL DEFAULT 'male' COMMENT '性别 male-男 female-女',
        \`generation\`    INT UNSIGNED  NOT NULL DEFAULT 1 COMMENT '辈分/代数',
        \`generation_name\` VARCHAR(10)  DEFAULT '' COMMENT '字辈（如国、运、登、朝）',
        \`birth_date\`    VARCHAR(30)   DEFAULT '' COMMENT '出生日期',
        \`birth_place\`   VARCHAR(200)  DEFAULT '' COMMENT '出生地',
        \`is_alive\`      TINYINT(1)    DEFAULT 1 COMMENT '是否在世 1-在世 0-已故',
        \`death_date\`    VARCHAR(30)   DEFAULT '' COMMENT '逝世日期',
        \`death_place\`   VARCHAR(200)  DEFAULT '' COMMENT '墓茔/安葬地点',
        \`longitude\`     DECIMAL(10, 7) DEFAULT NULL COMMENT '墓茔经度',
        \`latitude\`      DECIMAL(10, 7) DEFAULT NULL COMMENT '墓茔纬度',
        \`bio\`           TEXT          COMMENT '生平简介',
        \`avatar_url\`    VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '头像URL（/uploads/xxx 或 http(s) 完整地址，最多500字符）',
        \`father_id\`     VARCHAR(32)   DEFAULT '' COMMENT '父亲成员ID',
        \`mother_id\`     INT           NOT NULL DEFAULT 0 COMMENT '母亲在父亲配偶信息数组中的序号（从0开始）',
        \`spouse_info\`   JSON          DEFAULT NULL COMMENT '配偶信息JSON数组：[{name,birthDate,bio,deathDate,deathPlace,longitude,latitude}]',
        \`sort_order\`    INT UNSIGNED  DEFAULT 0 COMMENT '排序(同辈中长幼)',
        \`status\`        TINYINT(1)    DEFAULT 1 COMMENT '状态 1-正常 0-已删除',
        \`create_time\`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        \`update_time\`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        PRIMARY KEY (\`id\`),
        INDEX \`idx_family_id\` (\`family_id\`),
        INDEX \`idx_father\` (\`father_id\`),
        INDEX \`idx_mother\` (\`mother_id\`),
        INDEX \`idx_generation\` (\`family_id\`, \`generation\`),
        INDEX \`idx_name\` (\`family_id\`, \`name\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家族成员表'
    `);
  }

  /** 生成全局唯一的家族种子分享码（8 位，去除易混淆字符） */
  private async generateUniqueSeedShareCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const chars: string[] = [];
      for (let j = 0; j < 8; j++) {
        chars.push(this.SHARE_CODE_ALPHABET[Math.floor(Math.random() * this.SHARE_CODE_ALPHABET.length)]);
      }
      const code = chars.join('');
      const [dup] = await this.dataSource.query<Pick<FamilyRow, 'id'>[]>(
        'SELECT `id` FROM `family` WHERE `seed_share_code` = ? LIMIT 1',
        [code]
      );
      if (!dup) return code;
    }
    throw new HttpException('家族种子分享码生成失败，请重试', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  /** 更新家族 */
  async update(id: number, data: FamilyUpdateData) {
    const [row] = await this.dataSource.query<Pick<FamilyRow, 'id' | 'name' | 'generation_table_id'>[]>(
      'SELECT `id`, `name`, `generation_table_id` FROM `family` WHERE `id` = ?',
      [id]
    );
    if (!row) throw new HttpException('家族不存在', HttpStatus.NOT_FOUND);

    // 姓氏ID有效性校验
    if (data.surnameId !== undefined && data.surnameId !== null) {
      await this.validateSurnameId(data.surnameId);
    }

    // 字辈表ID有效性校验（若提供且与当前不同）
    if (data.generationTableId !== undefined && data.generationTableId !== row.generation_table_id) {
      const [gt] = await this.dataSource.query<Pick<GenerationTableRow, 'id' | 'status'>[]>(
        'SELECT `id`, `status` FROM `generation_table` WHERE `id` = ?',
        [data.generationTableId]
      );
      if (!gt) throw new HttpException('关联字辈表不存在', HttpStatus.BAD_REQUEST);
      if (gt.status !== 1) throw new HttpException('只能关联启用的字辈表', HttpStatus.BAD_REQUEST);
    }

    if (data.name !== undefined && data.name.trim() !== row.name) {
      const [dup] = await this.dataSource.query<Pick<FamilyRow, 'id'>[]>(
        'SELECT `id` FROM `family` WHERE `name` = ? AND `id` != ? AND `status` = 1',
        [data.name.trim(), id]
      );
      if (dup) throw new HttpException('家族名称已存在', HttpStatus.BAD_REQUEST);
    }

    const fields: string[] = [];
    const values: QueryValues = [];
    if (data.surnameId !== undefined) { fields.push('`surname_id` = ?'); values.push(data.surnameId); }
    if (data.generationTableId !== undefined) { fields.push('`generation_table_id` = ?'); values.push(data.generationTableId); }
    if (data.name !== undefined) { fields.push('`name` = ?'); values.push(data.name.trim()); }
    if (data.logo !== undefined) { fields.push('`logo` = ?'); values.push(data.logo); }
    if (data.founder !== undefined) { fields.push('`founder` = ?'); values.push(data.founder); }
    if (data.origin !== undefined) { fields.push('`origin` = ?'); values.push(data.origin); }
    if (data.description !== undefined) { fields.push('`description` = ?'); values.push(data.description || null); }
    if (data.isPublic !== undefined) { fields.push('`is_public` = ?'); values.push(data.isPublic); }
    if (data.allowJoin !== undefined) { fields.push('`allow_join` = ?'); values.push(data.allowJoin); }
    if (data.status !== undefined) { fields.push('`status` = ?'); values.push(data.status); }

    if (fields.length === 0) throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);

    values.push(id);
    await this.dataSource.query(
      `UPDATE \`family\` SET ${fields.join(', ')} WHERE \`id\` = ?`,
      values
    );
    return { success: true };
  }

  /** 删除家族（软删除：status=0） */
  async delete(id: number) {
    const [row] = await this.dataSource.query<Pick<FamilyRow, 'id' | 'status'>[]>(
      'SELECT `id`, `status` FROM `family` WHERE `id` = ?',
      [id]
    );
    if (!row) throw new HttpException('家族不存在', HttpStatus.NOT_FOUND);
    await this.dataSource.query(
      "UPDATE `family` SET `status` = 0 WHERE `id` = ?",
      [id]
    );
    return { success: true };
  }

  /** 切换公开状态 */
  async togglePublic(id: number) {
    const [row] = await this.dataSource.query<Pick<FamilyRow, 'id' | 'is_public'>[]>(
      'SELECT `id`, `is_public` FROM `family` WHERE `id` = ?',
      [id]
    );
    if (!row) throw new HttpException('家族不存在', HttpStatus.NOT_FOUND);
    const newVal = row.is_public === 1 ? 0 : 1;
    await this.dataSource.query(
      'UPDATE `family` SET `is_public` = ? WHERE `id` = ?',
      [newVal, id]
    );
    return { id, isPublic: newVal };
  }

  /** 批量获取家族的关联统计 */
  private async batchStats(ids: number[]): Promise<Record<number, FamilyStats>> {
    const result: Record<number, FamilyStats> = {};
    if (!ids || ids.length === 0) return result;

    const placeholders = ids.map(() => '?').join(', ');

    // 成员数量：成员存储在各家族分表 family_members_{id}，逐个分表统计；
    // 分表可能不存在（旧数据/未初始化），按 0 计
    const memberRowLists = await Promise.all(
      ids.map(async id => {
        const tableName = `${this.MEMBER_TABLE_PREFIX}_${id}`;
        this.validateTableName(tableName);
        try {
          return await this.dataSource.query<CountRow[]>(
            `SELECT \`family_id\`, COUNT(*) AS cnt FROM \`${tableName}\` WHERE \`status\` = 1 GROUP BY \`family_id\``
          );
        } catch {
          return [] as CountRow[];
        }
      })
    );
    const memberRows = memberRowLists.flat();

    const eventRows = await this.dataSource.query<CountRow[]>(
      `SELECT \`family_id\`, COUNT(*) AS cnt FROM \`family_event\`
       WHERE \`family_id\` IN (${placeholders}) AND \`status\` = 1
       GROUP BY \`family_id\``, [...ids]
    );
    const photoRows = await this.dataSource.query<CountRow[]>(
      `SELECT \`family_id\`, COUNT(*) AS cnt FROM \`family_photo\`
       WHERE \`family_id\` IN (${placeholders}) AND \`status\` = 1
       GROUP BY \`family_id\``, [...ids]
    );
    const docRows = await this.dataSource.query<CountRow[]>(
      `SELECT \`family_id\`, COUNT(*) AS cnt FROM \`family_document\`
       WHERE \`family_id\` IN (${placeholders}) AND \`status\` = 1
       GROUP BY \`family_id\``, [...ids]
    );
    const dynamicRows = await this.dataSource.query<CountRow[]>(
      `SELECT \`family_id\`, COUNT(*) AS cnt FROM \`family_dynamic\`
       WHERE \`family_id\` IN (${placeholders}) AND \`status\` = 1
       GROUP BY \`family_id\``, [...ids]
    );
    const adminRows = await this.dataSource.query<CountRow[]>(
      `SELECT \`family_id\`, COUNT(*) AS cnt FROM \`sys_admin_family\`
       WHERE \`family_id\` IN (${placeholders})
       GROUP BY \`family_id\``, [...ids]
    );

    const toMap = (rows: CountRow[]): Record<number, number> => {
      const m: Record<number, number> = {};
      rows.forEach(r => { m[r.family_id] = Number(r.cnt); });
      return m;
    };
    const memberMap = toMap(memberRows);
    const eventMap = toMap(eventRows);
    const photoMap = toMap(photoRows);
    const docMap = toMap(docRows);
    const dynamicMap = toMap(dynamicRows);
    const adminMap = toMap(adminRows);

    ids.forEach(id => {
      result[id] = {
        memberCount: memberMap[id] || 0,
        eventCount: eventMap[id] || 0,
        photoCount: photoMap[id] || 0,
        documentCount: docMap[id] || 0,
        dynamicCount: dynamicMap[id] || 0,
        adminCount: adminMap[id] || 0
      };
    });
    return result;
  }
}

interface InsertResult {
  insertId: number;
}

interface CountRow extends DataRow {
  family_id: number;
  cnt: number | string;
}

interface GenerationTableRow extends DataRow {
  id: string;
  status: number;
  generation_sequence: string | string[];
}
