import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type AdminBannerItem,
  type AdminBannerListResult,
  type AdminBannerQueryParams,
  type BannerRow,
  type BannerUpsertData
} from './types/banner.types';
import { type QueryValues } from '../common/types/common';

const LINK_TYPES = ['none', 'page', 'url'];

/**
 * 广告轮播后台管理服务
 * - 分页列表（familyId/keyword/status 筛选）
 * - 新增 / 编辑 / 删除（物理删除）
 */
@Injectable()
export class BannerAdminService {
  constructor(private readonly dataSource: DataSource) {}

  /** 分页列表 */
  async getList(params: AdminBannerQueryParams): Promise<AdminBannerListResult> {
    const { page, pageSize, familyId, keyword, status } = params;
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const values: QueryValues = [];

    if (familyId !== undefined) {
      where.push('`family_id` = ?');
      values.push(familyId);
    }
    if (status !== undefined) {
      where.push('`status` = ?');
      values.push(status);
    }
    if (keyword) {
      where.push('`title` LIKE ?');
      values.push(`%${keyword}%`);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`family_banner\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<BannerRow[]>(
      `SELECT \`id\`, \`family_id\`, \`title\`, \`image_url\`, \`link_type\`, \`link_url\`, \`sort_order\`, \`status\`, \`start_time\`, \`end_time\`, \`creator_user_id\`, \`create_time\`, \`update_time\`
       FROM \`family_banner\` ${whereClause}
       ORDER BY \`sort_order\` ASC, \`id\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return {
      list: list.map((r) => this.toItem(r)),
      total,
      page,
      pageSize
    };
  }

  /** 新增 */
  async create(data: BannerUpsertData, operator: string) {
    const clean = this.validate(data);
    await this.dataSource.query(
      `INSERT INTO \`family_banner\`
       (\`family_id\`, \`title\`, \`image_url\`, \`link_type\`, \`link_url\`, \`sort_order\`, \`status\`, \`start_time\`, \`end_time\`, \`creator_user_id\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clean.familyId,
        clean.title,
        clean.imageUrl,
        clean.linkType,
        clean.linkUrl,
        clean.sortOrder,
        clean.status,
        clean.startTime ?? null,
        clean.endTime ?? null,
        operator
      ]
    );
    return { success: true };
  }

  /** 编辑 */
  async update(id: number, data: BannerUpsertData, operator: string) {
    const [exist] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_banner` WHERE `id` = ?',
      [id]
    );
    if (!exist) {
      throw new HttpException('广告不存在或已删除', HttpStatus.NOT_FOUND);
    }

    const clean = this.validate(data, true);
    const fields: string[] = [];
    const values: QueryValues = [];

    if (clean.familyId !== undefined) { fields.push('`family_id` = ?'); values.push(clean.familyId); }
    if (clean.title !== undefined) { fields.push('`title` = ?'); values.push(clean.title); }
    if (clean.imageUrl !== undefined) { fields.push('`image_url` = ?'); values.push(clean.imageUrl); }
    if (clean.linkType !== undefined) { fields.push('`link_type` = ?'); values.push(clean.linkType); }
    if (clean.linkUrl !== undefined) { fields.push('`link_url` = ?'); values.push(clean.linkUrl); }
    if (clean.sortOrder !== undefined) { fields.push('`sort_order` = ?'); values.push(clean.sortOrder); }
    if (clean.status !== undefined) { fields.push('`status` = ?'); values.push(clean.status); }
    if (clean.startTime !== undefined) { fields.push('`start_time` = ?'); values.push(clean.startTime ?? null); }
    if (clean.endTime !== undefined) { fields.push('`end_time` = ?'); values.push(clean.endTime ?? null); }

    if (fields.length === 0) {
      throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);
    }

    fields.push('`update_time` = NOW()');
    values.push(id);
    await this.dataSource.query(
      `UPDATE \`family_banner\` SET ${fields.join(', ')} WHERE \`id\` = ?`,
      values
    );
    return { success: true };
  }

  /** 删除（物理删除） */
  async delete(id: number) {
    const result = await this.dataSource.query<{ affectedRows?: number }>(
      'DELETE FROM `family_banner` WHERE `id` = ?',
      [id]
    );
    // TypeORM query 对 DELETE 返回 OkPacket 对象（mysql2 driver 可能包装为数组），兼容两种形态
    const affected = Array.isArray(result)
      ? Number(result[0]?.affectedRows ?? 0)
      : Number(result?.affectedRows ?? 0);
    if (affected === 0) {
      throw new HttpException('广告不存在或已删除', HttpStatus.NOT_FOUND);
    }
    return { success: true };
  }

  /** 参数校验与归一化（partial=true 时允许缺省字段） */
  private validate(data: BannerUpsertData, partial = false) {
    const clean: Required<Pick<BannerUpsertData, 'title' | 'imageUrl' | 'linkType' | 'linkUrl' | 'sortOrder' | 'status' | 'startTime' | 'endTime'>> & { familyId: number } = {
      familyId: 0,
      title: '',
      imageUrl: '',
      linkType: 'none',
      linkUrl: '',
      sortOrder: 0,
      status: 1,
      startTime: null,
      endTime: null
    };

    if (data.familyId !== undefined) {
      clean.familyId = Number(data.familyId) || 0;
    } else if (!partial) {
      throw new HttpException('缺少家族ID', HttpStatus.BAD_REQUEST);
    }

    if (data.title !== undefined) {
      clean.title = String(data.title).trim();
    } else if (!partial) {
      throw new HttpException('缺少广告标题', HttpStatus.BAD_REQUEST);
    }

    if (data.imageUrl !== undefined) {
      clean.imageUrl = String(data.imageUrl).trim();
    } else if (!partial) {
      throw new HttpException('缺少广告图片', HttpStatus.BAD_REQUEST);
    }

    if (data.linkType !== undefined) {
      if (!LINK_TYPES.includes(String(data.linkType))) {
        throw new HttpException('跳转类型非法，仅支持 none/page/url', HttpStatus.BAD_REQUEST);
      }
      clean.linkType = String(data.linkType) as typeof clean.linkType;
    }

    if (data.linkUrl !== undefined) {
      clean.linkUrl = String(data.linkUrl).trim();
    }

    if (data.sortOrder !== undefined) {
      clean.sortOrder = Number(data.sortOrder) || 0;
    }

    if (data.status !== undefined) {
      const s = Number(data.status);
      if (s !== 0 && s !== 1) {
        throw new HttpException('状态非法，仅支持 0/1', HttpStatus.BAD_REQUEST);
      }
      clean.status = s;
    }

    if (data.startTime !== undefined) {
      clean.startTime = data.startTime ? String(data.startTime) : null;
    }

    if (data.endTime !== undefined) {
      clean.endTime = data.endTime ? String(data.endTime) : null;
    }

    // 新增时必须校验非空；部分更新按字段级处理，缺失字段保持原值
    if (!partial) {
      if (clean.title.length === 0) {
        throw new HttpException('广告标题不能为空', HttpStatus.BAD_REQUEST);
      }
      if (clean.imageUrl.length === 0) {
        throw new HttpException('广告图片不能为空', HttpStatus.BAD_REQUEST);
      }
    }

    return clean;
  }

  /** 行记录 → 对外条目 */
  private toItem(r: BannerRow): AdminBannerItem {
    return {
      id: r.id,
      familyId: r.family_id,
      title: r.title,
      imageUrl: r.image_url,
      linkType: (r.link_type || 'none') as AdminBannerItem['linkType'],
      linkUrl: r.link_url || '',
      sortOrder: r.sort_order,
      status: r.status,
      startTime: r.start_time,
      endTime: r.end_time,
      creatorUserId: r.creator_user_id,
      createTime: r.create_time,
      updateTime: r.update_time
    };
  }
}
