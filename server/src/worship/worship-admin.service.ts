import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type QueryValues } from '../common/types/common';
import { WORSHIP_TYPES, type WorshipType } from './types/worship.types';

/** 祭祀记录管理条目（后台） */
export interface AdminWorshipRecordItem {
  id: number;
  familyId: number;
  familyName: string;
  userId: string;
  userName: string;
  type: WorshipType;
  content: string;
  createTime: string;
}

/** 纪念对象管理条目（后台） */
export interface AdminWorshipMemorialItem {
  id: number;
  familyId: number;
  familyName: string;
  memberId: string;
  memberName: string;
  avatarUrl: string;
  epitaph: string;
  creatorUserId: string;
  createTime: string;
}

export interface AdminPaged<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 祭祀后台管理服务：祭祀记录 / 纪念对象 的全局查询与删除。
 * 接口由 JwtAuthGuard + RolesGuard + PermissionsGuard 保护（权限码 system:worship:*）。
 */
@Injectable()
export class WorshipAdminService {
  constructor(private readonly dataSource: DataSource) {}

  /** 祭祀记录分页（可选：家族ID / 类型 / 姓名关键词） */
  async getRecordList(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    type?: string;
    familyId?: number;
  }): Promise<AdminPaged<AdminWorshipRecordItem>> {
    const { page, pageSize } = this.safePage(params.page, params.pageSize);

    const where: string[] = [];
    const values: QueryValues = [];
    if (params.familyId && params.familyId > 0) {
      where.push('r.`family_id` = ?');
      values.push(params.familyId);
    }
    if (params.type && WORSHIP_TYPES.includes(params.type as WorshipType)) {
      where.push('r.`type` = ?');
      values.push(params.type);
    }
    if (params.keyword) {
      where.push('r.`user_name` LIKE ?');
      values.push(`%${params.keyword}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRow] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`family_worship_record\` r ${whereSql}`,
      values
    );
    const rows = await this.dataSource.query<
      {
        id: number;
        family_id: number;
        family_name: string;
        user_id: string;
        user_name: string;
        type: WorshipType;
        content: string;
        create_time: string;
      }[]
    >(
      `SELECT r.\`id\`, CAST(r.\`family_id\` AS UNSIGNED) AS family_id, f.\`name\` AS family_name,
              r.\`user_id\`, r.\`user_name\`, r.\`type\`, r.\`content\`, r.\`create_time\`
       FROM \`family_worship_record\` r
       LEFT JOIN \`family\` f ON f.\`id\` = r.\`family_id\`
       ${whereSql}
       ORDER BY r.\`create_time\` DESC, r.\`id\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize] as QueryValues
    );

    return {
      list: rows.map((r) => ({
        id: r.id,
        familyId: Number(r.family_id),
        familyName: r.family_name || '',
        userId: r.user_id,
        userName: r.user_name,
        type: r.type,
        content: r.content || '',
        createTime: r.create_time
      })),
      total: Number(countRow?.total) || 0,
      page,
      pageSize
    };
  }

  /** 删除祭祀记录（物理删除；无 status 字段，后台管理直接删除） */
  async deleteRecord(id: number): Promise<{ success: true }> {
    const result = await this.dataSource.query<{ affectedRows: number }>(
      'DELETE FROM `family_worship_record` WHERE `id` = ?',
      [id]
    );
    if (!result?.affectedRows) {
      throw new HttpException('祭祀记录不存在', HttpStatus.NOT_FOUND);
    }
    return { success: true };
  }

  /** 纪念对象分页（可选：家族ID / 姓名关键词） */
  async getMemorialList(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    familyId?: number;
  }): Promise<AdminPaged<AdminWorshipMemorialItem>> {
    const { page, pageSize } = this.safePage(params.page, params.pageSize);

    const where: string[] = ['m.`status` = 1'];
    const values: QueryValues = [];
    if (params.familyId && params.familyId > 0) {
      where.push('m.`family_id` = ?');
      values.push(params.familyId);
    }
    if (params.keyword) {
      where.push('m.`member_name` LIKE ?');
      values.push(`%${params.keyword}%`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [countRow] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`family_worship_memorial\` m ${whereSql}`,
      values
    );
    const rows = await this.dataSource.query<
      {
        id: number;
        family_id: number;
        family_name: string;
        member_id: string;
        member_name: string;
        avatar_url: string;
        epitaph: string;
        creator_user_id: string;
        create_time: string;
      }[]
    >(
      `SELECT m.\`id\`, m.\`family_id\`, f.\`name\` AS family_name,
              m.\`member_id\`, m.\`member_name\`, m.\`avatar_url\`, m.\`epitaph\`, m.\`creator_user_id\`, m.\`create_time\`
       FROM \`family_worship_memorial\` m
       LEFT JOIN \`family\` f ON f.\`id\` = m.\`family_id\`
       ${whereSql}
       ORDER BY m.\`create_time\` DESC, m.\`id\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize] as QueryValues
    );

    return {
      list: rows.map((r) => ({
        id: r.id,
        familyId: r.family_id,
        familyName: r.family_name || '',
        memberId: r.member_id,
        memberName: r.member_name,
        avatarUrl: r.avatar_url || '',
        epitaph: r.epitaph || '',
        creatorUserId: r.creator_user_id,
        createTime: r.create_time
      })),
      total: Number(countRow?.total) || 0,
      page,
      pageSize
    };
  }

  /** 删除纪念对象（软删除 status=0） */
  async deleteMemorial(id: number): Promise<{ success: true }> {
    const result = await this.dataSource.query<{ affectedRows: number }>(
      'UPDATE `family_worship_memorial` SET `status` = 0 WHERE `id` = ?',
      [id]
    );
    if (!result?.affectedRows) {
      throw new HttpException('纪念对象不存在', HttpStatus.NOT_FOUND);
    }
    return { success: true };
  }

  private safePage(page: number, pageSize: number): { page: number; pageSize: number } {
    return {
      page: Number.isInteger(page) && page > 0 ? page : 1,
      pageSize: Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20
    };
  }
}
