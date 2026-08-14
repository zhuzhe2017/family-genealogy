import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { type ContentType, type ContentConfig, type ContentRow, type ContentQueryParams, type ContentCreateData, type EventDetailData, type EventMemberData } from './types/content.types';
import { type QueryValues } from '../common/types/common';

const CONTENT_CONFIG: Record<ContentType, ContentConfig> = {
  dynamic: {
    table: 'family_dynamic',
    fields: ['id', 'family_id', 'user_id', 'user_name', 'user_gender', 'content', 'like_count', 'comment_count', 'status', 'audit_status', 'create_time', 'update_time'],
    searchFields: ['content', 'user_name']
  },
  photo: {
    table: 'family_photo',
    fields: ['id', 'family_id', 'category_id', 'url', 'title', 'description', 'year', 'uploader_id', 'uploader_name', 'status', 'audit_status', 'create_time', 'update_time'],
    searchFields: ['title', 'description', 'uploader_name']
  },
  document: {
    table: 'family_document',
    fields: ['id', 'family_id', 'category_id', 'name', 'volume', 'description', 'page_count', 'file_url', 'cover_url', 'uploader_id', 'status', 'audit_status', 'create_time', 'update_time'],
    searchFields: ['name', 'description']
  },
  event: {
    table: 'family_event',
    fields: ['id', 'family_id', 'year', 'month', 'day', 'title', 'description', 'type', 'type_name', 'status', 'audit_status', 'create_time', 'update_time'],
    searchFields: ['title', 'description']
  }
};

@Injectable()
export class ContentService {
  constructor(private readonly dataSource: DataSource) {}

  /** 列表查询（分页 + 筛选） */
  async getList(type: ContentType, params: ContentQueryParams, userId?: string) {
    const cfg = CONTENT_CONFIG[type];
    const { page, pageSize, familyId, auditStatus, keyword } = params;
    const offset = (page - 1) * pageSize;

    const where: string[] = ['`status` = 1'];
    const values: QueryValues = [];

    if (familyId) {
      where.push('`family_id` = ?');
      values.push(familyId);
    }
    if (auditStatus !== undefined && auditStatus !== null) {
      where.push('`audit_status` = ?');
      values.push(auditStatus);
    }
    if (keyword) {
      const ors = cfg.searchFields.map(f => `\`${f}\` LIKE ?`).join(' OR ');
      where.push(`(${ors})`);
      cfg.searchFields.forEach(() => values.push(`%${keyword}%`));
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const fieldList = cfg.fields.map(f => `\`${f}\``).join(', ');

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`${cfg.table}\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<ContentRow[]>(
      `SELECT ${fieldList} FROM \`${cfg.table}\` ${whereClause} ORDER BY \`create_time\` DESC, \`id\` DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    // 动态附加图片列表（family_dynamic_image 按 sort_order 排序）
    if (type === 'dynamic' && list.length > 0) {
      const ids = list.map(r => r.id);
      const images = await this.dataSource.query<{ dynamic_id: string; image_url: string }[]>(
        `SELECT \`dynamic_id\`, \`image_url\` FROM \`family_dynamic_image\`
         WHERE \`dynamic_id\` IN (?) ORDER BY \`dynamic_id\`, \`sort_order\``,
        [ids]
      );
      const group = new Map<string, string[]>();
      images.forEach(img => {
        if (!group.has(img.dynamic_id)) group.set(img.dynamic_id, []);
        group.get(img.dynamic_id)!.push(img.image_url);
      });
      list.forEach(r => {
        (r as ContentRow & { images?: string[] }).images = group.get(r.id) || [];
      });

      // 附加当前用户是否已点赞（传入 userId 时查询点赞表）
      if (userId) {
        const likes = await this.dataSource.query<{ dynamic_id: string }[]>(
          'SELECT `dynamic_id` FROM `family_dynamic_like` WHERE `user_id` = ? AND `dynamic_id` IN (?)',
          [userId, ids]
        );
        const likedSet = new Set(likes.map(l => l.dynamic_id));
        list.forEach(r => {
          (r as ContentRow & { isLiked?: boolean }).isLiked = likedSet.has(r.id);
        });
      } else {
        list.forEach(r => {
          (r as ContentRow & { isLiked?: boolean }).isLiked = false;
        });
      }
    }

    // 事件列表附带关联成员（family_event_member 按事件分组）
    if (type === 'event' && list.length > 0) {
      const ids = list.map(r => r.id);
      const members = await this.dataSource.query<{ event_id: string; member_id: string; member_name: string; member_gender: string; relation: string }[]>(
        'SELECT `event_id`, `member_id`, `member_name`, `member_gender`, `relation` FROM `family_event_member` WHERE `event_id` IN (?)',
        [ids]
      );
      const group = new Map<string, EventMemberData[]>();
      members.forEach(m => {
        if (!group.has(m.event_id)) group.set(m.event_id, []);
        group.get(m.event_id)!.push({
          id: m.member_id,
          name: m.member_name,
          gender: m.member_gender,
          relation: m.relation
        });
      });
      list.forEach(r => {
        (r as ContentRow & { relatedMembers?: EventMemberData[] }).relatedMembers = group.get(r.id) || [];
      });
    }

    return { list, total, page, pageSize };
  }

  /** 审核操作：设置 audit_status（0-待审核 1-已通过 2-已下架） */
  async audit(type: ContentType, id: string, auditStatus: number) {
    if (![0, 1, 2].includes(auditStatus)) {
      throw new HttpException('audit_status 取值非法（0/1/2）', HttpStatus.BAD_REQUEST);
    }
    await this.ensureExist(type, id);
    await this.dataSource.query(
      `UPDATE \`${CONTENT_CONFIG[type].table}\` SET \`audit_status\` = ? WHERE \`id\` = ?`,
      [auditStatus, id]
    );
    return { id, auditStatus };
  }

  /** 下架/上架切换：1→2 下架，2→1 上架，0→1 通过 */
  async toggle(type: ContentType, id: string) {
    const row = await this.ensureExist(type, id);
    let newStatus: number;
    if (row.audit_status === 1) {
      newStatus = 2; // 下架
    } else {
      newStatus = 1; // 上架（含 0 待审核直接上架、2 重新上架）
    }
    await this.dataSource.query(
      `UPDATE \`${CONTENT_CONFIG[type].table}\` SET \`audit_status\` = ? WHERE \`id\` = ?`,
      [newStatus, id]
    );
    return { id, auditStatus: newStatus };
  }

  /** 软删除：status = 0 */
  async delete(type: ContentType, id: string) {
    await this.ensureExist(type, id);
    await this.dataSource.query(
      `UPDATE \`${CONTENT_CONFIG[type].table}\` SET \`status\` = 0 WHERE \`id\` = ?`,
      [id]
    );
    return { success: true };
  }

  /**
   * 点赞/取消点赞（toggle）
   * 事务保证 点赞表 + like_count 计数 原子更新
   */
  async toggleLike(dynamicId: string, userId: string) {
    await this.ensureExist('dynamic', dynamicId);
    if (!userId) {
      throw new HttpException('用户未登录', HttpStatus.UNAUTHORIZED);
    }
    const [row] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_dynamic_like` WHERE `dynamic_id` = ? AND `user_id` = ?',
      [dynamicId, userId]
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (row) {
        // 取消点赞
        await queryRunner.query(
          'DELETE FROM `family_dynamic_like` WHERE `dynamic_id` = ? AND `user_id` = ?',
          [dynamicId, userId]
        );
        await queryRunner.query(
          'UPDATE `family_dynamic` SET `like_count` = GREATEST(`like_count` - 1, 0) WHERE `id` = ?',
          [dynamicId]
        );
      } else {
        // 点赞
        await queryRunner.query(
          'INSERT INTO `family_dynamic_like` (`dynamic_id`, `user_id`) VALUES (?, ?)',
          [dynamicId, userId]
        );
        await queryRunner.query(
          'UPDATE `family_dynamic` SET `like_count` = `like_count` + 1 WHERE `id` = ?',
          [dynamicId]
        );
      }
      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    const [dyn] = await this.dataSource.query<{ like_count: number }[]>(
      'SELECT `like_count` FROM `family_dynamic` WHERE `id` = ?',
      [dynamicId]
    );
    return { isLiked: !row, likeCount: dyn?.like_count ?? 0 };
  }

  /** 评论列表（分页,按时间倒序,最新在前） */
  async getComments(dynamicId: string, page = 1, pageSize = 20) {
    await this.ensureExist('dynamic', dynamicId);
    const p = Math.max(1, Math.floor(page));
    const size = Math.min(50, Math.max(1, Math.floor(pageSize)));
    const offset = (p - 1) * size;

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      'SELECT COUNT(*) AS total FROM `family_dynamic_comment` WHERE `dynamic_id` = ?',
      [dynamicId]
    );
    const total = countResult?.total ?? 0;

    const rows = await this.dataSource.query<
      { id: number; user_id: string; user_name: string; content: string; create_time: string }[]
    >(
      `SELECT \`id\`, \`user_id\`, \`user_name\`, \`content\`, \`create_time\`
       FROM \`family_dynamic_comment\` WHERE \`dynamic_id\` = ? ORDER BY \`id\` DESC LIMIT ? OFFSET ?`,
      [dynamicId, size, offset]
    );
    const list = rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      content: r.content,
      createTime: r.create_time
    }));
    return { list, total, page: p, pageSize: size };
  }

  /** 发表评论（事务保证 评论表 + comment_count 计数 原子更新） */
  async createComment(dynamicId: string, userId: string, userName: string, content: string) {
    await this.ensureExist('dynamic', dynamicId);
    if (!userId) {
      throw new HttpException('用户未登录', HttpStatus.UNAUTHORIZED);
    }
    const text = (content || '').trim();
    if (!text) {
      throw new HttpException('评论内容不能为空', HttpStatus.BAD_REQUEST);
    }
    if (text.length > 500) {
      throw new HttpException('评论内容过长（最多500字）', HttpStatus.BAD_REQUEST);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const result = await queryRunner.query(
        `INSERT INTO \`family_dynamic_comment\` (\`dynamic_id\`, \`user_id\`, \`user_name\`, \`content\`)
         VALUES (?, ?, ?, ?)`,
        [dynamicId, userId, userName, text]
      );
      await queryRunner.query(
        'UPDATE `family_dynamic` SET `comment_count` = `comment_count` + 1 WHERE `id` = ?',
        [dynamicId]
      );
      await queryRunner.commitTransaction();
      return {
        id: (result as unknown as { insertId?: number })?.insertId || 0,
        userId,
        userName,
        content: text
      };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  /** 单条内容详情（仅审核通过且未删除；dynamic 附带图片与当前用户点赞状态） */
  async getById(type: ContentType, id: string, userId?: string) {
    const cfg = CONTENT_CONFIG[type];
    const fieldList = cfg.fields.map(f => `\`${f}\``).join(', ');
    const [row] = await this.dataSource.query<ContentRow[]>(
      `SELECT ${fieldList} FROM \`${cfg.table}\`
       WHERE \`id\` = ? AND \`status\` = 1 AND \`audit_status\` = 1`,
      [id]
    );
    if (!row) {
      throw new HttpException('内容不存在或未通过审核', HttpStatus.NOT_FOUND);
    }
    if (type === 'dynamic') {
      // 附带图片列表
      const images = await this.dataSource.query<{ image_url: string }[]>(
        'SELECT `image_url` FROM `family_dynamic_image` WHERE `dynamic_id` = ? ORDER BY `sort_order`',
        [id]
      );
      (row as ContentRow & { images?: string[] }).images = images.map(i => i.image_url);
      // 附带当前用户点赞状态（传入 userId 时）
      let isLiked = false;
      if (userId) {
        const [like] = await this.dataSource.query<{ id: number }[]>(
          'SELECT `id` FROM `family_dynamic_like` WHERE `dynamic_id` = ? AND `user_id` = ?',
          [id, userId]
        );
        isLiked = !!like;
      }
      (row as ContentRow & { isLiked?: boolean }).isLiked = isLiked;
    }
    if (type === 'event') {
      // 附带扩展属性
      const details = await this.dataSource.query<{ label: string; value: string }[]>(
        'SELECT `label`, `value` FROM `family_event_detail` WHERE `event_id` = ? ORDER BY `sort_order`',
        [id]
      );
      (row as ContentRow & { details?: EventDetailData[] }).details = details;
      // 附带关联成员
      const members = await this.dataSource.query<{ member_id: string; member_name: string; member_gender: string; relation: string }[]>(
        'SELECT `member_id`, `member_name`, `member_gender`, `relation` FROM `family_event_member` WHERE `event_id` = ?',
        [id]
      );
      (row as ContentRow & { relatedMembers?: EventMemberData[] }).relatedMembers = members.map(m => ({
        id: m.member_id,
        name: m.member_name,
        gender: m.member_gender,
        relation: m.relation
      }));
      // 附带相关照片
      const photos = await this.dataSource.query<{ photo_url: string }[]>(
        'SELECT `photo_url` FROM `family_event_photo` WHERE `event_id` = ? ORDER BY `sort_order`',
        [id]
      );
      (row as ContentRow & { photos?: string[] }).photos = photos.map(p => p.photo_url);
    }
    return row;
  }

  /** 创建内容（小程序端发布直接通过，dynamic 支持图片批量入库） */
  async create(type: ContentType, data: ContentCreateData) {
    if (!data.familyId) {
      throw new HttpException('familyId 不能为空', HttpStatus.BAD_REQUEST);
    }
    const id = randomBytes(16).toString('hex');

    if (type === 'dynamic') {
      if (!data.content?.trim()) {
        throw new HttpException('动态内容不能为空', HttpStatus.BAD_REQUEST);
      }
      // audit_status=1 直接发布:portal 是唯一发布入口且列表仅展示审核通过内容,
      // 若写 0(待审核)发布者自己都看不到;管理员仍可下架
      await this.dataSource.query(
        `INSERT INTO \`family_dynamic\`
         (\`id\`, \`family_id\`, \`user_id\`, \`user_name\`, \`user_gender\`, \`content\`, \`audit_status\`)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [id, data.familyId, data.userId || '', data.userName || '', data.userGender || '', data.content.trim()]
      );
      const images = (data.images || []).slice(0, 9).filter(Boolean);
      for (let i = 0; i < images.length; i++) {
        await this.dataSource.query(
          'INSERT INTO `family_dynamic_image` (`dynamic_id`, `image_url`, `sort_order`) VALUES (?, ?, ?)',
          [id, images[i], i]
        );
      }
      return { id };
    }

    if (type === 'photo') {
      if (!data.url) {
        throw new HttpException('照片URL不能为空', HttpStatus.BAD_REQUEST);
      }
      await this.dataSource.query(
        `INSERT INTO \`family_photo\`
         (\`id\`, \`family_id\`, \`category_id\`, \`url\`, \`title\`, \`description\`, \`year\`, \`uploader_id\`, \`uploader_name\`, \`audit_status\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          id, data.familyId, data.categoryId || '', data.url, data.title || '',
          data.description || null, data.year || '', data.uploaderId || '', data.uploaderName || ''
        ]
      );
      return { id };
    }

    if (type === 'event') {
      const t = this.parseEventData(data);
      await this.saveEventWithRelations(id, data.familyId, t, data);
      return { id };
    }

    throw new HttpException('该内容类型暂不支持直接发布', HttpStatus.BAD_REQUEST);
  }

  /** 更新内容（目前支持 event，事务内重建关联数据） */
  async update(type: ContentType, id: string, data: ContentCreateData) {
    if (type !== 'event') {
      throw new HttpException('该内容类型暂不支持编辑', HttpStatus.BAD_REQUEST);
    }
    if (!data.familyId) {
      throw new HttpException('familyId 不能为空', HttpStatus.BAD_REQUEST);
    }
    await this.ensureExist(type, id);
    const t = this.parseEventData(data);
    await this.saveEventWithRelations(id, data.familyId, t, data, true);
    return { id };
  }

  /** 校验并归一化事件时间字段（year/month/day 取值范围） */
  private parseEventData(data: ContentCreateData) {
    if (!data.title?.trim()) {
      throw new HttpException('事件标题不能为空', HttpStatus.BAD_REQUEST);
    }
    const year = Number(data.year);
    const month = Number(data.month) || 0;
    const day = Number(data.day) || 0;
    if (!Number.isInteger(year) || year < 0 || year > 9999) {
      throw new HttpException('事件年份非法', HttpStatus.BAD_REQUEST);
    }
    if (month < 0 || month > 12 || day < 0 || day > 31) {
      throw new HttpException('事件月份或日期非法', HttpStatus.BAD_REQUEST);
    }
    return {
      year,
      month,
      day,
      title: data.title.trim(),
      description: data.description || null,
      type: data.type || 'other',
      typeName: data.typeName || ''
    };
  }

  /**
   * 事件主表 + 关联表（detail/member/photo）整体落库
   * @param overwrite true=更新模式：清空旧关联后重插；false=创建模式
   */
  private async saveEventWithRelations(
    id: string,
    familyId: number,
    t: { year: number; month: number; day: number; title: string; description: string | null; type: string; typeName: string },
    data: ContentCreateData,
    overwrite = false
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (overwrite) {
        await queryRunner.query(
          `UPDATE \`family_event\` SET \`year\` = ?, \`month\` = ?, \`day\` = ?, \`title\` = ?, \`description\` = ?, \`type\` = ?, \`type_name\` = ? WHERE \`id\` = ? AND \`status\` = 1`,
          [t.year, t.month, t.day, t.title, t.description, t.type, t.typeName, id]
        );
        await queryRunner.query('DELETE FROM `family_event_detail` WHERE `event_id` = ?', [id]);
        await queryRunner.query('DELETE FROM `family_event_member` WHERE `event_id` = ?', [id]);
        await queryRunner.query('DELETE FROM `family_event_photo` WHERE `event_id` = ?', [id]);
      } else {
        await queryRunner.query(
          `INSERT INTO \`family_event\`
           (\`id\`, \`family_id\`, \`year\`, \`month\`, \`day\`, \`title\`, \`description\`, \`type\`, \`type_name\`, \`audit_status\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [id, familyId, t.year, t.month, t.day, t.title, t.description, t.type, t.typeName]
        );
      }

      const details = (data.details || []).slice(0, 20).filter(d => d && d.label);
      for (let i = 0; i < details.length; i++) {
        await queryRunner.query(
          'INSERT INTO `family_event_detail` (`event_id`, `label`, `value`, `sort_order`) VALUES (?, ?, ?, ?)',
          [id, String(details[i].label).trim(), String(details[i].value || '').trim(), i]
        );
      }

      const members = (data.relatedMembers || []).slice(0, 50).filter(m => m && m.id);
      for (let i = 0; i < members.length; i++) {
        await queryRunner.query(
          'INSERT INTO `family_event_member` (`event_id`, `member_id`, `member_name`, `member_gender`, `relation`) VALUES (?, ?, ?, ?, ?)',
          [id, String(members[i].id), String(members[i].name || ''), String(members[i].gender || ''), String(members[i].relation || '')]
        );
      }

      const photos = (data.photos || []).slice(0, 9).filter(Boolean);
      for (let i = 0; i < photos.length; i++) {
        await queryRunner.query(
          'INSERT INTO `family_event_photo` (`event_id`, `photo_url`, `sort_order`) VALUES (?, ?, ?)',
          [id, String(photos[i]), i]
        );
      }

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  /** 确认记录存在且未删除，返回行 */
  private async ensureExist(type: ContentType, id: string): Promise<ContentRow> {
    const [row] = await this.dataSource.query<ContentRow[]>(
      `SELECT \`id\`, \`audit_status\`, \`status\` FROM \`${CONTENT_CONFIG[type].table}\` WHERE \`id\` = ? AND \`status\` = 1`,
      [id]
    );
    if (!row) {
      throw new HttpException('内容不存在或已删除', HttpStatus.NOT_FOUND);
    }
    return row;
  }
}

export type { ContentType } from './types/content.types';
export { CONTENT_CONFIG };
