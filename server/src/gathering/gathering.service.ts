import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomInt } from 'crypto';
import * as QRCode from 'qrcode';
import {
  type GatheringRow,
  type GatheringSessionRow,
  type RegistrationRow,
  type ArchiveRow,
  type RegisterData,
  type GatheringUpsertData,
  type AgendaItem
} from './types/gathering.types';
import { type PaginationResult } from '../common/types/common';

/** 签到码长度 */
const CHECKIN_CODE_LEN = 6;
/** 签到码生成重试次数 */
const CODE_RETRY = 5;

/**
 * 宗亲聚会用户端服务
 * - 家族归属校验：非成员不可见/不可操作该家族聚会
 * - 组织者权限：聚会创建者 / 家族创建者 / 家族管理员 可管理聚会与名单
 * - 报名成功生成 6 位签到码，支持参会者自助签到与组织者扫码核销（双通道）
 */
@Injectable()
export class GatheringService {
  constructor(private readonly dataSource: DataSource) {}

  // ==================== 查询 ====================

  /** 聚会分页列表（当前家族；组织者可见全部含草稿，成员仅可见已发布及以后） */
  async getList(
    userId: string,
    familyId: number,
    params: { page?: number; pageSize?: number; status?: number; keyword?: string }
  ): Promise<PaginationResult<Record<string, unknown>>> {
    if (!familyId || familyId <= 0) {
      throw new HttpException('缺少家族ID', HttpStatus.BAD_REQUEST);
    }
    const isOrganizer = await this.isFamilyOrganizer(userId, familyId);
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 10));
    const where: string[] = ['g.`family_id` = ?'];
    const args: unknown[] = [familyId];

    if (!isOrganizer) {
      where.push('g.`status` >= 1');
    }
    if (params.status !== undefined) {
      where.push('g.`status` = ?');
      args.push(Number(params.status));
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
        `SELECT g.*,
          (SELECT COUNT(*) FROM \`family_gathering_registration\` r
            WHERE r.\`gathering_id\` = g.\`id\` AND r.\`status\` IN (1, 3)) AS \`signed_total\`,
          (SELECT COUNT(*) FROM \`family_gathering_registration\` r
            WHERE r.\`gathering_id\` = g.\`id\` AND r.\`status\` = 3) AS \`checkin_total\`,
          (SELECT COUNT(*) FROM \`family_gathering_session\` s WHERE s.\`gathering_id\` = g.\`id\`) AS \`session_count\`
         FROM \`family_gathering\` g
         WHERE ${whereSql}
         ORDER BY g.\`start_time\` DESC, g.\`id\` DESC
         LIMIT ? OFFSET ?`,
        [...args, pageSize, (page - 1) * pageSize]
      )
    ]);

    return {
      list: rows.map((r) => this.toListItem(r)),
      total: Number(totalRow?.cnt || 0),
      page,
      pageSize
    };
  }

  /** 聚会详情（含场次、我的报名、是否组织者；结束/归档后附带归档资料） */
  async getDetail(userId: string, familyId: number, id: number) {
    if (!id || id <= 0) {
      throw new HttpException('缺少聚会ID', HttpStatus.BAD_REQUEST);
    }
    const gathering = await this.getGathering(id);
    if (!gathering || Number(gathering.family_id) !== Number(familyId)) {
      throw new HttpException('聚会不存在', HttpStatus.NOT_FOUND);
    }
    const [isMember, isOrganizer] = await Promise.all([
      this.isFamilyMember(userId, familyId),
      this.isFamilyOrganizerFor(userId, gathering)
    ]);
    if (!isMember) {
      throw new HttpException('您不属于该家族，无权查看', HttpStatus.FORBIDDEN);
    }

    const [sessions, registration, archives] = await Promise.all([
      this.dataSource.query<GatheringSessionRow[]>(
        'SELECT * FROM `family_gathering_session` WHERE `gathering_id` = ? ORDER BY `start_time` ASC, `id` ASC',
        [id]
      ),
      this.dataSource.query<RegistrationRow[]>(
        `SELECT * FROM \`family_gathering_registration\`
         WHERE \`gathering_id\` = ? AND \`user_id\` = ? AND \`status\` IN (1, 3)
         ORDER BY \`id\` DESC LIMIT 1`,
        [id, userId]
      ),
      this.dataSource.query<ArchiveRow[]>(
        'SELECT * FROM `family_gathering_archive` WHERE `gathering_id` = ? ORDER BY `id` DESC',
        [id]
      )
    ]);

    return {
      ...this.toListItem(gathering),
      isOrganizer,
      sessions: sessions.map((s) => this.toSession(s)),
      myRegistration: registration.length ? this.toRegistration(registration[0]) : null,
      archives: archives.map((a) => this.toArchive(a))
    };
  }

  // ==================== 报名 / 签到 ====================

  /** 报名：校验聚会状态与截止时间，生成签到码，场次计数 +1 */
  async register(userId: string, familyId: number, id: number, data: RegisterData) {
    const gathering = await this.requireMemberGathering(userId, familyId, id);
    if (gathering.status === 0) {
      throw new HttpException('聚会尚未发布', HttpStatus.BAD_REQUEST);
    }
    if (gathering.status >= 3) {
      throw new HttpException('聚会已结束，无法报名', HttpStatus.BAD_REQUEST);
    }
    if (gathering.signup_deadline && new Date(gathering.signup_deadline).getTime() < Date.now()) {
      throw new HttpException('报名已截止', HttpStatus.BAD_REQUEST);
    }
    const name = (data.name || '').trim();
    if (!name) {
      throw new HttpException('请填写参会人姓名', HttpStatus.BAD_REQUEST);
    }
    if (data.phone && !/^1\d{10}$/.test(data.phone)) {
      throw new HttpException('手机号格式不正确', HttpStatus.BAD_REQUEST);
    }

    const sessionId = Number(data.sessionId) || 0;
    if (sessionId > 0) {
      const [session] = await this.dataSource.query<GatheringSessionRow[]>(
        'SELECT * FROM `family_gathering_session` WHERE `id` = ? AND `gathering_id` = ?',
        [sessionId, id]
      );
      if (!session) {
        throw new HttpException('所选场次不存在', HttpStatus.BAD_REQUEST);
      }
      if (session.capacity > 0 && session.signed_count >= session.capacity) {
        throw new HttpException('该场次名额已满', HttpStatus.BAD_REQUEST);
      }
    }

    // 同一用户重复报名（未取消）直接拒绝
    const [existing] = await this.dataSource.query<RegistrationRow[]>(
      `SELECT \`id\` FROM \`family_gathering_registration\`
       WHERE \`gathering_id\` = ? AND \`user_id\` = ? AND \`status\` IN (1, 3) LIMIT 1`,
      [id, userId]
    );
    if (existing) {
      throw new HttpException('您已报名该聚会，请勿重复报名', HttpStatus.BAD_REQUEST);
    }

    const checkinCode = await this.genUniqueCode(id);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      await queryRunner.query(
        `INSERT INTO \`family_gathering_registration\`
         (\`gathering_id\`, \`session_id\`, \`user_id\`, \`member_id\`, \`name\`, \`phone\`,
          \`diet_type\`, \`diet_note\`, \`special_need\`, \`guest_count\`, \`checkin_code\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          sessionId,
          userId,
          Number(data.memberId) || 0,
          name,
          data.phone || '',
          data.dietType || 'normal',
          (data.dietNote || '').slice(0, 200),
          (data.specialNeed || '').slice(0, 500),
          Math.max(0, Number(data.guestCount) || 0),
          checkinCode
        ]
      );
      if (sessionId > 0) {
        await queryRunner.query(
          'UPDATE `family_gathering_session` SET `signed_count` = `signed_count` + 1 WHERE `id` = ?',
          [sessionId]
        );
      }
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    // 应用内提醒：返回回执（含签到码），前端 toast 提示并展示
    return {
      success: true,
      checkinCode,
      gatheringTitle: gathering.title,
      startTime: gathering.start_time
    };
  }

  /** 我的报名记录（未取消） */
  async getMyRegistration(userId: string, familyId: number, gatheringId: number) {
    const rows = await this.dataSource.query<(RegistrationRow & { session_name?: string })[]>(
      `SELECT r.*, s.\`name\` AS \`session_name\`
       FROM \`family_gathering_registration\` r
       LEFT JOIN \`family_gathering_session\` s ON s.\`id\` = r.\`session_id\`
       WHERE r.\`gathering_id\` = ? AND r.\`user_id\` = ? AND r.\`status\` IN (1, 3)
       ORDER BY r.\`id\` DESC LIMIT 1`,
      [gatheringId, userId]
    );
    return rows.length ? this.toRegistration(rows[0], rows[0].session_name) : null;
  }

  /** 取消报名：仅本人，且未签到 */
  async cancelRegistration(userId: string, familyId: number, registrationId: number) {
    const [reg] = await this.dataSource.query<RegistrationRow[]>(
      'SELECT * FROM `family_gathering_registration` WHERE `id` = ?',
      [registrationId]
    );
    if (!reg || reg.user_id !== userId) {
      throw new HttpException('报名记录不存在', HttpStatus.NOT_FOUND);
    }
    if (reg.status === 3) {
      throw new HttpException('已签到，无法取消', HttpStatus.BAD_REQUEST);
    }
    if (reg.status === 2) {
      return { success: true, already: true };
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      await queryRunner.query(
        'UPDATE `family_gathering_registration` SET `status` = 2 WHERE `id` = ?',
        [registrationId]
      );
      if (reg.session_id > 0) {
        await queryRunner.query(
          'UPDATE `family_gathering_session` SET `signed_count` = GREATEST(0, `signed_count` - 1) WHERE `id` = ?',
          [reg.session_id]
        );
      }
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
    return { success: true };
  }

  /** 我的签到信息（报名成功后）：6 位签到码 + 二维码数据 */
  async getCheckinCode(userId: string, familyId: number, gatheringId: number) {
    const reg = await this.getMyRegistration(userId, familyId, gatheringId);
    if (!reg) {
      throw new HttpException('请先报名再签到', HttpStatus.BAD_REQUEST);
    }
    if (reg.status === 3) {
      return { ...reg, checkinCode: reg.checkinCode, qrCode: '', alreadyCheckedIn: true };
    }
    const qrCode = await QRCode.toDataURL(reg.checkinCode, { margin: 1, width: 240 });
    return { ...reg, checkinCode: reg.checkinCode, qrCode, alreadyCheckedIn: false };
  }

  /** 现场签到（双通道）：参会者输入 6 位签到码，或组织者扫码核销（扫码内容即签到码） */
  async checkin(userId: string, familyId: number, gatheringId: number, body: { code?: string; method?: string }) {
    const code = String(body.code || '').trim();
    if (!/^\d{6}$/.test(code)) {
      throw new HttpException('签到码为 6 位数字', HttpStatus.BAD_REQUEST);
    }
    const [reg] = await this.dataSource.query<RegistrationRow[]>(
      `SELECT * FROM \`family_gathering_registration\`
       WHERE \`gathering_id\` = ? AND \`checkin_code\` = ? AND \`status\` IN (1, 3)
       LIMIT 1`,
      [gatheringId, code]
    );
    if (!reg) {
      throw new HttpException('签到码无效，请核对后重试', HttpStatus.BAD_REQUEST);
    }
    if (reg.status === 3) {
      return { success: true, already: true, name: reg.name, checkinTime: reg.checkin_time };
    }
    await this.dataSource.query(
      'UPDATE `family_gathering_registration` SET `status` = 3, `checkin_time` = NOW(), `checkin_method` = ? WHERE `id` = ?',
      [body.method === 'qr' ? 'qr' : 'manual', reg.id]
    );
    return { success: true, already: false, name: reg.name, checkinTime: new Date() };
  }

  // ==================== 组织者管理 ====================

  /** 创建聚会（创建人即为组织者） */
  async create(userId: string, familyId: number, data: GatheringUpsertData) {
    if (!familyId || familyId <= 0) {
      throw new HttpException('缺少家族ID', HttpStatus.BAD_REQUEST);
    }
    if (!(await this.isFamilyMember(userId, familyId))) {
      throw new HttpException('您不属于该家族，无权发布聚会', HttpStatus.FORBIDDEN);
    }
    const title = (data.title || '').trim();
    if (!title) {
      throw new HttpException('请填写聚会名称', HttpStatus.BAD_REQUEST);
    }
    const agenda = this.serializeAgenda(data.agenda);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      const [result] = await queryRunner.query(
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
          agenda,
          Math.max(0, Number(data.capacity) || 0),
          data.status === 1 ? 1 : 0,
          userId
        ]
      );
      const gatheringId = Number(result.insertId);
      await this.replaceSessions(queryRunner, gatheringId, data.sessions);
      await queryRunner.commitTransaction();
      return { success: true, id: gatheringId };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /** 编辑聚会（组织者） */
  async update(userId: string, familyId: number, id: number, data: GatheringUpsertData) {
    const gathering = await this.requireOrganizerGathering(userId, familyId, id);
    const agenda = this.serializeAgenda(data.agenda);
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
        agenda,
        data.capacity !== undefined ? Math.max(0, Number(data.capacity) || 0) : gathering.capacity,
        id
      ]
    );
    // 场次全量替换（仅当传了 sessions）
    if (Array.isArray(data.sessions)) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await queryRunner.startTransaction();
        await this.replaceSessions(queryRunner, id, data.sessions);
        await queryRunner.commitTransaction();
      } catch (err) {
        await queryRunner.rollbackTransaction();
        throw err;
      } finally {
        await queryRunner.release();
      }
    }
    return { success: true };
  }

  /** 状态流转（草稿/发布/结束/归档） */
  async updateStatus(userId: string, familyId: number, id: number, status: number) {
    const gathering = await this.requireOrganizerGathering(userId, familyId, id);
    const next = Number(status);
    if (![0, 1, 2, 3, 4].includes(next)) {
      throw new HttpException('状态不合法', HttpStatus.BAD_REQUEST);
    }
    if (next === gathering.status) {
      return { success: true, status: next };
    }
    await this.dataSource.query('UPDATE `family_gathering` SET `status` = ? WHERE `id` = ?', [next, id]);
    return { success: true, status: next };
  }

  /** 删除聚会（组织者；级联删除场次/报名/归档） */
  async delete(userId: string, familyId: number, id: number) {
    await this.requireOrganizerGathering(userId, familyId, id);
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

  /** 报名名单（组织者，分页） */
  async getRegistrations(
    userId: string,
    familyId: number,
    id: number,
    params: { page?: number; pageSize?: number; status?: number; keyword?: string }
  ): Promise<PaginationResult<Record<string, unknown>>> {
    await this.requireOrganizerGathering(userId, familyId, id);
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
    const where: string[] = ['r.`gathering_id` = ?'];
    const args: unknown[] = [id];
    if (params.status !== undefined) {
      where.push('r.`status` = ?');
      args.push(Number(params.status));
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
      this.dataSource.query<(RegistrationRow & { session_name?: string })[]>(
        `SELECT r.*, s.\`name\` AS \`session_name\`
         FROM \`family_gathering_registration\` r
         LEFT JOIN \`family_gathering_session\` s ON s.\`id\` = r.\`session_id\`
         WHERE ${whereSql}
         ORDER BY r.\`id\` ASC
         LIMIT ? OFFSET ?`,
        [...args, pageSize, (page - 1) * pageSize]
      )
    ]);
    return {
      list: rows.map((r) => this.toRegistration(r, r.session_name)),
      total: Number(totalRow?.cnt || 0),
      page,
      pageSize
    };
  }

  /** 参会统计分析（组织者） */
  async getStats(userId: string, familyId: number, id: number) {
    const gathering = await this.requireOrganizerGathering(userId, familyId, id);
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

    const dietLabels: Record<string, string> = {
      normal: '无要求',
      vegetarian: '素食',
      halal: '清真',
      custom: '其他'
    };
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

  // ==================== 归档 ====================

  /** 新增归档资料（组织者） */
  async createArchive(userId: string, familyId: number, gatheringId: number, body: { title?: string; fileUrl?: string; fileType?: string; description?: string }) {
    await this.requireOrganizerGathering(userId, familyId, gatheringId);
    const title = (body.title || '').trim();
    if (!title) {
      throw new HttpException('请填写资料标题', HttpStatus.BAD_REQUEST);
    }
    const [result] = await this.dataSource.query(
      `INSERT INTO \`family_gathering_archive\`
       (\`gathering_id\`, \`title\`, \`file_url\`, \`file_type\`, \`description\`, \`creator_user_id\`)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [gatheringId, title, body.fileUrl || '', body.fileType || 'image', (body.description || '').slice(0, 500), userId]
    );
    return { success: true, id: Number(result.insertId) };
  }

  /** 删除归档资料（组织者） */
  async deleteArchive(userId: string, familyId: number, gatheringId: number, archiveId: number) {
    await this.requireOrganizerGathering(userId, familyId, gatheringId);
    await this.dataSource.query(
      'DELETE FROM `family_gathering_archive` WHERE `id` = ? AND `gathering_id` = ?',
      [archiveId, gatheringId]
    );
    return { success: true };
  }

  // ==================== 私有工具 ====================

  /** 读取聚会记录 */
  private async getGathering(id: number): Promise<GatheringRow | null> {
    const [row] = await this.dataSource.query<GatheringRow[]>(
      'SELECT * FROM `family_gathering` WHERE `id` = ? LIMIT 1',
      [id]
    );
    return row || null;
  }

  /** 校验成员身份并返回聚会（非成员 403） */
  private async requireMemberGathering(userId: string, familyId: number, id: number): Promise<GatheringRow> {
    if (!(await this.isFamilyMember(userId, familyId))) {
      throw new HttpException('您不属于该家族，无权操作', HttpStatus.FORBIDDEN);
    }
    const gathering = await this.getGathering(id);
    if (!gathering || Number(gathering.family_id) !== Number(familyId)) {
      throw new HttpException('聚会不存在', HttpStatus.NOT_FOUND);
    }
    return gathering;
  }

  /** 校验组织者身份并返回聚会（非组织者 403） */
  private async requireOrganizerGathering(userId: string, familyId: number, id: number): Promise<GatheringRow> {
    const gathering = await this.getGathering(id);
    if (!gathering || Number(gathering.family_id) !== Number(familyId)) {
      throw new HttpException('聚会不存在', HttpStatus.NOT_FOUND);
    }
    if (!(await this.isFamilyOrganizerFor(userId, gathering))) {
      throw new HttpException('仅组织者可执行该操作', HttpStatus.FORBIDDEN);
    }
    return gathering;
  }

  /** 是否为该家族组织者（聚会创建者 / 家族创建者 / 家族管理员） */
  private async isFamilyOrganizer(userId: string, familyId: number): Promise<boolean> {
    const [gathering] = await this.dataSource.query<GatheringRow[]>(
      'SELECT * FROM `family_gathering` WHERE `family_id` = ? AND `organizer_user_id` = ? LIMIT 1',
      [familyId, userId]
    );
    if (gathering) return true;
    return this.isFamilyAdmin(userId, familyId);
  }

  /** 针对某聚会的组织者判定 */
  private async isFamilyOrganizerFor(userId: string, gathering: GatheringRow): Promise<boolean> {
    if (gathering.organizer_user_id === userId) return true;
    return this.isFamilyAdmin(userId, Number(gathering.family_id));
  }

  /** 家族管理员/创建者判定 */
  private async isFamilyAdmin(userId: string, familyId: number): Promise<boolean> {
    const [perm] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_permission` WHERE `family_id` = ? AND `user_id` = ? AND `role` = \'admin\' AND `status` = 1 LIMIT 1',
      [familyId, userId]
    );
    if (perm) return true;
    const [family] = await this.dataSource.query<{ creator_user_id: string | null }[]>(
      'SELECT `creator_user_id` FROM `family` WHERE `id` = ? AND `status` = 1',
      [familyId]
    );
    return !!family && family.creator_user_id === userId;
  }

  /** 家族成员判定（权限表 / user.family_id / 家族创建者） */
  private async isFamilyMember(userId: string, familyId: number): Promise<boolean> {
    const [perm] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_permission` WHERE `family_id` = ? AND `user_id` = ? AND `status` = 1',
      [familyId, userId]
    );
    if (perm) return true;
    const [binding] = await this.dataSource.query<{ family_id: number | null }[]>(
      'SELECT `family_id` FROM `user` WHERE `id` = ? AND `status` = 1 LIMIT 1',
      [userId]
    );
    if (binding && Number(binding.family_id) === Number(familyId)) return true;
    const [family] = await this.dataSource.query<{ creator_user_id: string | null }[]>(
      'SELECT `creator_user_id` FROM `family` WHERE `id` = ? AND `status` = 1',
      [familyId]
    );
    return !!family && family.creator_user_id === userId;
  }

  /** 生成唯一 6 位签到码 */
  private async genUniqueCode(gatheringId: number): Promise<string> {
    for (let i = 0; i < CODE_RETRY; i++) {
      const code = String(randomInt(100000, 1000000));
      const [exists] = await this.dataSource.query<{ id: number }[]>(
        `SELECT \`id\` FROM \`family_gathering_registration\`
         WHERE \`gathering_id\` = ? AND \`checkin_code\` = ? LIMIT 1`,
        [gatheringId, code]
      );
      if (!exists) return code;
    }
    return String(randomInt(100000, 1000000));
  }

  /** 场次全量替换（保留已报名场次，防止误删计数丢失） */
  private async replaceSessions(queryRunner: any, gatheringId: number, sessions?: Array<{ id?: number; name?: string; startTime?: string; endTime?: string; capacity?: number }>) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
      // 未提供场次视为清空
      await queryRunner.query('DELETE FROM `family_gathering_session` WHERE `gathering_id` = ?', [gatheringId]);
      return;
    }
    const keptIds: number[] = [];
    for (const s of sessions) {
      const name = (s.name || '').trim();
      const capacity = Math.max(0, Number(s.capacity) || 0);
      if (s.id) {
        // 更新已有场次
        keptIds.push(Number(s.id));
        await queryRunner.query(
          'UPDATE `family_gathering_session` SET `name` = ?, `start_time` = ?, `end_time` = ?, `capacity` = ? WHERE `id` = ? AND `gathering_id` = ?',
          [name, this.nullableDate(s.startTime), this.nullableDate(s.endTime), capacity, Number(s.id), gatheringId]
        );
      } else {
        const [result] = await queryRunner.query(
          'INSERT INTO `family_gathering_session` (`gathering_id`, `name`, `start_time`, `end_time`, `capacity`) VALUES (?, ?, ?, ?, ?)',
          [gatheringId, name, this.nullableDate(s.startTime), this.nullableDate(s.endTime), capacity]
        );
        keptIds.push(Number(result.insertId));
      }
    }
    if (keptIds.length) {
      const placeholders = keptIds.map(() => '?').join(',');
      await queryRunner.query(
        `DELETE FROM \`family_gathering_session\` WHERE \`gathering_id\` = ? AND \`id\` NOT IN (${placeholders})`,
        [gatheringId, ...keptIds]
      );
    }
  }

  /** 议程序列化（JSON 字符串入库） */
  private serializeAgenda(agenda?: AgendaItem[] | string): string {
    if (agenda === undefined || agenda === null) return '';
    if (typeof agenda === 'string') return agenda;
    return JSON.stringify((agenda || []).filter((a) => a.item || a.time));
  }

  private nullableDate(v?: string): string | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : v;
  }

  private toListItem(r: GatheringRow & { signed_total?: number; checkin_total?: number; session_count?: number }) {
    return {
      id: r.id,
      familyId: r.family_id,
      title: r.title,
      description: r.description || '',
      coverImage: r.cover_image || '',
      location: r.location || '',
      addressDetail: r.address_detail || '',
      startTime: r.start_time,
      endTime: r.end_time,
      signupDeadline: r.signup_deadline,
      agenda: this.parseAgenda(r.agenda),
      capacity: r.capacity,
      status: r.status,
      signedTotal: Number(r.signed_total || 0),
      checkinTotal: Number(r.checkin_total || 0),
      sessionCount: Number(r.session_count || 0),
      organizerUserId: r.organizer_user_id,
      createTime: r.create_time
    };
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

  private toSession(s: GatheringSessionRow) {
    return {
      id: s.id,
      name: s.name,
      startTime: s.start_time,
      endTime: s.end_time,
      capacity: s.capacity,
      signedCount: s.signed_count
    };
  }

  private toRegistration(r: RegistrationRow, sessionName?: string) {
    return {
      id: r.id,
      gatheringId: r.gathering_id,
      sessionId: r.session_id,
      sessionName: sessionName || '',
      name: r.name,
      phone: r.phone,
      dietType: r.diet_type,
      dietNote: r.diet_note,
      specialNeed: r.special_need,
      guestCount: r.guest_count,
      status: r.status,
      checkinCode: r.checkin_code,
      checkinTime: r.checkin_time,
      checkinMethod: r.checkin_method,
      createTime: r.create_time
    };
  }

  private toArchive(a: ArchiveRow) {
    return {
      id: a.id,
      gatheringId: a.gathering_id,
      title: a.title,
      fileUrl: a.file_url,
      fileType: a.file_type,
      description: a.description,
      createTime: a.create_time
    };
  }
}
