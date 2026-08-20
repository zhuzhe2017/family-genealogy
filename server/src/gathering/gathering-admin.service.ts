import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type GatheringRow, type GatheringUpsertData, type AgendaItem } from './types/gathering.types';
import { type PaginationResult } from '../common/types/common';

/**
 * 宗亲聚会后台管理服务（系统级，不受家族归属限制）
 * 权限码：system:gathering:list / create / update / delete
 */
@Injectable()
export class GatheringAdminService {
  constructor(private readonly dataSource: DataSource) {}

  /** 全家族分页列表 */
  async getList(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    familyId?: number;
    status?: number;
  }): Promise<PaginationResult<Record<string, unknown>>> {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 10));
    const where: string[] = ['1 = 1'];
    const args: unknown[] = [];
    if (params.familyId) {
      where.push('g.`family_id` = ?');
      args.push(params.familyId);
    }
    if (params.status !== undefined) {
      where.push('g.`status` = ?');
      args.push(params.status);
    }
    if (params.keyword) {
      where.push('g.`title` LIKE ?');
      args.push(`%${params.keyword}%`);
    }
    const whereSql = where.join(' AND ');

    const [[totalRow], rows] = await Promise.all([
      this.dataSource.query<{ cnt: number }[]>(
        `SELECT COUNT(*) AS cnt FROM \`family_gathering\` g WHERE ${whereSql}`,
        args
      ),
      this.dataSource.query<GatheringRow[]>(
        `SELECT g.*, f.\`name\` AS \`family_name\`,
          (SELECT COUNT(*) FROM \`family_gathering_registration\` r
            WHERE r.\`gathering_id\` = g.\`id\` AND r.\`status\` IN (1, 3)) AS \`signed_total\`,
          (SELECT COUNT(*) FROM \`family_gathering_registration\` r
            WHERE r.\`gathering_id\` = g.\`id\` AND r.\`status\` = 3) AS \`checkin_total\`
         FROM \`family_gathering\` g
         LEFT JOIN \`family\` f ON f.\`id\` = g.\`family_id\`
         WHERE ${whereSql}
         ORDER BY g.\`id\` DESC
         LIMIT ? OFFSET ?`,
        [...args, pageSize, (page - 1) * pageSize]
      )
    ]);
    return {
      list: rows.map((r) => ({
        id: r.id,
        familyId: r.family_id,
        familyName: (r as any).family_name || `#${r.family_id}`,
        title: r.title,
        location: r.location || '',
        startTime: r.start_time,
        endTime: r.end_time,
        capacity: r.capacity,
        status: r.status,
        signedTotal: Number((r as any).signed_total || 0),
        checkinTotal: Number((r as any).checkin_total || 0),
        organizerUserId: r.organizer_user_id,
        createTime: r.create_time
      })),
      total: Number(totalRow?.cnt || 0),
      page,
      pageSize
    };
  }

  /** 详情（含场次与报名汇总） */
  async getDetail(id: number) {
    const gathering = await this.getGathering(id);
    if (!gathering) {
      throw new HttpException('聚会不存在', HttpStatus.NOT_FOUND);
    }
    const [familyRow, sessions] = await Promise.all([
      this.dataSource.query<{ name: string }[]>('SELECT `name` FROM `family` WHERE `id` = ?', [gathering.family_id]),
      this.dataSource.query<any[]>(
        'SELECT * FROM `family_gathering_session` WHERE `gathering_id` = ? ORDER BY `start_time` ASC, `id` ASC',
        [id]
      )
    ]);
    return {
      id: gathering.id,
      familyId: gathering.family_id,
      familyName: familyRow[0]?.name || `#${gathering.family_id}`,
      title: gathering.title,
      description: gathering.description || '',
      coverImage: gathering.cover_image || '',
      location: gathering.location || '',
      addressDetail: gathering.address_detail || '',
      startTime: gathering.start_time,
      endTime: gathering.end_time,
      signupDeadline: gathering.signup_deadline,
      agenda: this.parseAgenda(gathering.agenda),
      capacity: gathering.capacity,
      status: gathering.status,
      organizerUserId: gathering.organizer_user_id,
      sessions: sessions.map((s) => ({
        id: s.id,
        name: s.name,
        startTime: s.start_time,
        endTime: s.end_time,
        capacity: s.capacity,
        signedCount: s.signed_count
      })),
      createTime: gathering.create_time
    };
  }

  /** 创建聚会 */
  async create(data: GatheringUpsertData, operatorId: string) {
    const familyId = Number(data.familyId) || 0;
    if (!familyId || familyId <= 0) {
      throw new HttpException('请选择家族', HttpStatus.BAD_REQUEST);
    }
    const title = (data.title || '').trim();
    if (!title) {
      throw new HttpException('请填写聚会名称', HttpStatus.BAD_REQUEST);
    }
    const [result] = await this.dataSource.query(
      `INSERT INTO \`family_gathering\`
       (\`family_id\`, \`title\`, \`description\`, \`cover_image\`, \`location\`, \`address_detail\`,
        \`start_time\`, \`end_time\`, \`signup_deadline\`, \`agenda\`, \`capacity\`, \`status\`, \`organizer_user_id\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        familyId,
        title,
        data.description || '',
        data.coverImage || '',
        data.location || '',
        data.addressDetail || '',
        this.nullableDate(data.startTime),
        this.nullableDate(data.endTime),
        this.nullableDate(data.signupDeadline),
        this.serializeAgenda(data.agenda),
        Math.max(0, Number(data.capacity) || 0),
        data.status === 1 ? 1 : 0,
        operatorId || ''
      ]
    );
    const gatheringId = Number(result.insertId);
    await this.replaceSessions(gatheringId, data.sessions);
    return { success: true, id: gatheringId };
  }

  /** 编辑聚会 */
  async update(id: number, data: GatheringUpsertData) {
    const gathering = await this.getGathering(id);
    if (!gathering) {
      throw new HttpException('聚会不存在', HttpStatus.NOT_FOUND);
    }
    await this.dataSource.query(
      `UPDATE \`family_gathering\`
       SET \`title\` = ?, \`description\` = ?, \`cover_image\` = ?, \`location\` = ?, \`address_detail\` = ?,
           \`start_time\` = ?, \`end_time\` = ?, \`signup_deadline\` = ?, \`agenda\` = ?, \`capacity\` = ?
       WHERE \`id\` = ?`,
      [
        (data.title ?? gathering.title).trim(),
        data.description ?? (gathering.description || ''),
        data.coverImage ?? (gathering.cover_image || ''),
        data.location ?? (gathering.location || ''),
        data.addressDetail ?? (gathering.address_detail || ''),
        this.nullableDate(data.startTime),
        this.nullableDate(data.endTime),
        this.nullableDate(data.signupDeadline),
        this.serializeAgenda(data.agenda),
        data.capacity !== undefined ? Math.max(0, Number(data.capacity) || 0) : gathering.capacity,
        id
      ]
    );
    if (Array.isArray(data.sessions)) {
      await this.replaceSessions(id, data.sessions);
    }
    return { success: true };
  }

  /** 状态流转 */
  async updateStatus(id: number, status: number) {
    const gathering = await this.getGathering(id);
    if (!gathering) {
      throw new HttpException('聚会不存在', HttpStatus.NOT_FOUND);
    }
    const next = Number(status);
    if (![0, 1, 2, 3, 4].includes(next)) {
      throw new HttpException('状态不合法', HttpStatus.BAD_REQUEST);
    }
    await this.dataSource.query('UPDATE `family_gathering` SET `status` = ? WHERE `id` = ?', [next, id]);
    return { success: true, status: next };
  }

  /** 删除聚会（级联） */
  async delete(id: number) {
    const gathering = await this.getGathering(id);
    if (!gathering) {
      throw new HttpException('聚会不存在', HttpStatus.NOT_FOUND);
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      await queryRunner.query('DELETE FROM `family_gathering_archive` WHERE `gathering_id` = ?', [id]);
      await queryRunner.query('DELETE FROM `family_gathering_registration` WHERE `gathering_id` = ?', [id]);
      await queryRunner.query('DELETE FROM `family_gathering_session` WHERE `gathering_id` = ?', [id]);
      await queryRunner.query('DELETE FROM `family_gathering` WHERE `id` = ?', [id]);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
    return { success: true };
  }

  /** 报名名单（分页） */
  async getRegistrations(
    id: number,
    params: { page?: number; pageSize?: number; status?: number; keyword?: string }
  ): Promise<PaginationResult<Record<string, unknown>>> {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
    const where: string[] = ['r.`gathering_id` = ?'];
    const args: unknown[] = [id];
    if (params.status !== undefined) {
      where.push('r.`status` = ?');
      args.push(params.status);
    }
    if (params.keyword) {
      where.push('(r.`name` LIKE ? OR r.`phone` LIKE ?)');
      const kw = `%${params.keyword}%`;
      args.push(kw, kw);
    }
    const whereSql = where.join(' AND ');
    const [[totalRow], rows] = await Promise.all([
      this.dataSource.query<{ cnt: number }[]>(
        `SELECT COUNT(*) AS cnt FROM \`family_gathering_registration\` r WHERE ${whereSql}`,
        args
      ),
      this.dataSource.query<any[]>(
        `SELECT r.*, s.\`name\` AS \`session_name\`
         FROM \`family_gathering_registration\` r
         LEFT JOIN \`family_gathering_session\` s ON s.\`id\` = r.\`session_id\`
         WHERE ${whereSql}
         ORDER BY r.\`id\` ASC
         LIMIT ? OFFSET ?`,
        [...args, pageSize, (page - 1) * pageSize]
      )
    ]);
    const dietLabels: Record<string, string> = { normal: '无要求', vegetarian: '素食', halal: '清真', custom: '其他' };
    return {
      list: rows.map((r) => ({
        id: r.id,
        sessionName: r.session_name || '',
        name: r.name,
        phone: r.phone,
        dietType: r.diet_type,
        dietLabel: dietLabels[r.diet_type] || r.diet_type,
        dietNote: r.diet_note,
        specialNeed: r.special_need,
        guestCount: r.guest_count,
        status: r.status,
        checkinCode: r.checkin_code,
        checkinTime: r.checkin_time,
        checkinMethod: r.checkin_method,
        createTime: r.create_time
      })),
      total: Number(totalRow?.cnt || 0),
      page,
      pageSize
    };
  }

  /** 参会统计分析 */
  async getStats(id: number) {
    const gathering = await this.getGathering(id);
    if (!gathering) {
      throw new HttpException('聚会不存在', HttpStatus.NOT_FOUND);
    }
    const [totalRow, checkedRow, cancelledRow, sessionRows, dietRows, guestRow] = await Promise.all([
      this.dataSource.query<{ cnt: number }[]>(
        'SELECT COUNT(*) AS cnt FROM `family_gathering_registration` WHERE `gathering_id` = ? AND `status` IN (1, 3)',
        [id]
      ),
      this.dataSource.query<{ cnt: number }[]>(
        'SELECT COUNT(*) AS cnt FROM `family_gathering_registration` WHERE `gathering_id` = ? AND `status` = 3',
        [id]
      ),
      this.dataSource.query<{ cnt: number }[]>(
        'SELECT COUNT(*) AS cnt FROM `family_gathering_registration` WHERE `gathering_id` = ? AND `status` = 2',
        [id]
      ),
      this.dataSource.query<{ session_name: string; cnt: number; checked: number }[]>(
        `SELECT s.\`name\` AS \`session_name\`, COUNT(r.\`id\`) AS cnt,
                SUM(CASE WHEN r.\`status\` = 3 THEN 1 ELSE 0 END) AS checked
         FROM \`family_gathering_session\` s
         LEFT JOIN \`family_gathering_registration\` r ON r.\`session_id\` = s.\`id\` AND r.\`status\` IN (1, 3)
         WHERE s.\`gathering_id\` = ?
         GROUP BY s.\`id\`, s.\`name\`
         ORDER BY s.\`start_time\` ASC, s.\`id\` ASC`,
        [id]
      ),
      this.dataSource.query<{ diet_type: string; cnt: number }[]>(
        `SELECT \`diet_type\`, COUNT(*) AS cnt
         FROM \`family_gathering_registration\`
         WHERE \`gathering_id\` = ? AND \`status\` IN (1, 3)
         GROUP BY \`diet_type\``,
        [id]
      ),
      this.dataSource.query<{ total_guest: number }[]>(
        'SELECT COALESCE(SUM(`guest_count`), 0) AS total_guest FROM `family_gathering_registration` WHERE `gathering_id` = ? AND `status` IN (1, 3)',
        [id]
      )
    ]);
    const dietLabels: Record<string, string> = { normal: '无要求', vegetarian: '素食', halal: '清真', custom: '其他' };
    return {
      gatheringId: id,
      capacity: gathering.capacity,
      total: Number(totalRow[0]?.cnt || 0),
      checkedIn: Number(checkedRow[0]?.cnt || 0),
      cancelled: Number(cancelledRow[0]?.cnt || 0),
      totalGuest: Number(guestRow[0]?.total_guest || 0),
      sessions: sessionRows.map((s) => ({
        name: s.session_name || '未选场次',
        count: Number(s.cnt || 0),
        checkedIn: Number(s.checked || 0)
      })),
      diets: dietRows.map((d) => ({ type: d.diet_type, label: dietLabels[d.diet_type] || d.diet_type, count: Number(d.cnt) }))
    };
  }

  /** 归档资料列表 */
  async getArchives(id: number) {
    const gathering = await this.getGathering(id);
    if (!gathering) {
      throw new HttpException('聚会不存在', HttpStatus.NOT_FOUND);
    }
    const rows = await this.dataSource.query<any[]>(
      'SELECT * FROM `family_gathering_archive` WHERE `gathering_id` = ? ORDER BY `id` DESC',
      [id]
    );
    return {
      list: rows.map((a) => ({
        id: a.id,
        gatheringId: a.gathering_id,
        title: a.title,
        fileUrl: a.file_url,
        fileType: a.file_type,
        description: a.description,
        createTime: a.create_time
      }))
    };
  }

  /** 新增归档资料 */
  async createArchive(id: number, body: { title?: string; fileUrl?: string; fileType?: string; description?: string }, operatorId: string) {
    const gathering = await this.getGathering(id);
    if (!gathering) {
      throw new HttpException('聚会不存在', HttpStatus.NOT_FOUND);
    }
    const title = (body.title || '').trim();
    if (!title) {
      throw new HttpException('请填写资料标题', HttpStatus.BAD_REQUEST);
    }
    const [result] = await this.dataSource.query(
      `INSERT INTO \`family_gathering_archive\`
       (\`gathering_id\`, \`title\`, \`file_url\`, \`file_type\`, \`description\`, \`creator_user_id\`)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, title, body.fileUrl || '', body.fileType || 'image', (body.description || '').slice(0, 500), operatorId || '']
    );
    return { success: true, id: Number(result.insertId) };
  }

  /** 删除归档资料 */
  async deleteArchive(id: number, archiveId: number) {
    const result = await this.dataSource.query(
      'DELETE FROM `family_gathering_archive` WHERE `id` = ? AND `gathering_id` = ?',
      [archiveId, id]
    );
    if (Number((result as any)?.affectedRows || 0) === 0) {
      throw new HttpException('归档资料不存在', HttpStatus.NOT_FOUND);
    }
    return { success: true };
  }

  private async getGathering(id: number): Promise<GatheringRow | null> {
    const [row] = await this.dataSource.query<GatheringRow[]>('SELECT * FROM `family_gathering` WHERE `id` = ? LIMIT 1', [id]);
    return row || null;
  }

  private async replaceSessions(gatheringId: number, sessions?: Array<{ id?: number; name?: string; startTime?: string; endTime?: string; capacity?: number }>) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
      await this.dataSource.query('DELETE FROM `family_gathering_session` WHERE `gathering_id` = ?', [gatheringId]);
      return;
    }
    const keptIds: number[] = [];
    for (const s of sessions) {
      const name = (s.name || '').trim();
      const capacity = Math.max(0, Number(s.capacity) || 0);
      if (s.id) {
        keptIds.push(Number(s.id));
        await this.dataSource.query(
          'UPDATE `family_gathering_session` SET `name` = ?, `start_time` = ?, `end_time` = ?, `capacity` = ? WHERE `id` = ? AND `gathering_id` = ?',
          [name, this.nullableDate(s.startTime), this.nullableDate(s.endTime), capacity, Number(s.id), gatheringId]
        );
      } else {
        const [result] = await this.dataSource.query(
          'INSERT INTO `family_gathering_session` (`gathering_id`, `name`, `start_time`, `end_time`, `capacity`) VALUES (?, ?, ?, ?, ?)',
          [gatheringId, name, this.nullableDate(s.startTime), this.nullableDate(s.endTime), capacity]
        );
        keptIds.push(Number(result.insertId));
      }
    }
    if (keptIds.length) {
      const placeholders = keptIds.map(() => '?').join(',');
      await this.dataSource.query(
        `DELETE FROM \`family_gathering_session\` WHERE \`gathering_id\` = ? AND \`id\` NOT IN (${placeholders})`,
        [gatheringId, ...keptIds]
      );
    }
  }

  private serializeAgenda(agenda?: AgendaItem[] | string): string {
    if (agenda === undefined || agenda === null) return '';
    if (typeof agenda === 'string') return agenda;
    return JSON.stringify((agenda || []).filter((a) => a.item || a.time));
  }

  private parseAgenda(raw: string | null): AgendaItem[] {
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  private nullableDate(v?: string): string | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : v;
  }
}
