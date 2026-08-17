import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type QueryValues } from '../common/types/common';
import { Capability } from '../membership/types/membership.types';
import { EntitlementService } from '../membership/membership.service';
import {
  WORSHIP_TYPES,
  type WorshipMemorialCandidate,
  type WorshipMemorialDetail,
  type WorshipMemorialItem,
  type WorshipMemorialRow,
  type WorshipRecordItem,
  type WorshipRecordPageResult,
  type WorshipRecordRow,
  type WorshipReminderResult,
  type WorshipReminderItem,
  type WorshipRemindType,
  type WorshipStats,
  type WorshipSummary,
  type WorshipType
} from './types/worship.types';

/**
 * 小程序用户端祭祀服务
 * 数据持久化到 family_worship_record / family_worship_memorial，提供：
 * - getSummary：祭祀页面汇总（今日各类型统计 + 最近祈福记录）
 * - createRecord：提交祭祀操作（上香/祈福/献祭/许愿）并返回最新统计
 * - 纪念对象：列表 / 候选 / 创建 / 删除
 *
 * 会员额度（worship_pro，额度型，订阅周期内有效）：
 * - 献祭（虚拟祭品供奉）每次消耗 1 次
 * - 创建纪念对象（纪念堂）每次消耗 1 次
 * - 上香/祈福/许愿为基础祭祀祈福，免费
 * 免费版无额度 → 4001 引导升级；额度用尽 → 4003。
 *
 * 家族归属校验（操作前必须属于目标家族）：
 * - family_permission 有效记录（status=1）
 * - 或 user.family_id 已关联该家族（joinFamily 的实际归属途径）
 * - 或家族创建者
 */
@Injectable()
export class WorshipService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly entitlementService: EntitlementService
  ) {}

  /** 祭祀页面汇总：今日统计 + 最近记录（最多 20 条） */
  async getSummary(userId: string, familyId: number): Promise<WorshipSummary> {
    await this.assertFamilyMember(userId, familyId);
    const stats = await this.getStats(familyId);
    const rows = await this.dataSource.query<WorshipRecordRow[]>(
      `SELECT \`id\`, \`user_name\`, \`type\`, \`content\`, \`create_time\`
       FROM \`family_worship_record\`
       WHERE \`family_id\` = ?
       ORDER BY \`create_time\` DESC, \`id\` DESC
       LIMIT 20`,
      [familyId]
    );
    return {
      familyId,
      stats,
      records: rows.map((r) => this.toRecordItem(r))
    };
  }

  /**
   * 提交祭祀操作：
   * - type: incense-上香 pray-祈福 offer-献祭 wish-许愿
   * - content: 许愿必填，其余可空（献祭传所选祭品）
   * 写入成功返回最新今日统计 + 本次记录，供前端原子刷新。
   */
  async createRecord(
    userId: string,
    nickName: string,
    familyId: number,
    type: string,
    content: string
  ): Promise<{ stats: WorshipStats; record: WorshipRecordItem }> {
    await this.assertFamilyMember(userId, familyId);

    if (!WORSHIP_TYPES.includes(type as WorshipType)) {
      throw new HttpException('祭祀类型非法，仅支持 incense/pray/offer/wish', HttpStatus.BAD_REQUEST);
    }
    const trimmed = String(content || '').trim();
    if (trimmed.length > 500) {
      throw new HttpException('内容不能超过 500 字', HttpStatus.BAD_REQUEST);
    }
    if (type === 'wish' && !trimmed) {
      throw new HttpException('请填写心愿内容', HttpStatus.BAD_REQUEST);
    }

    // 献祭（虚拟祭品供奉）为会员增值能力，消耗 worship_pro 额度（免费版/额度不足抛 4xxx）
    if (type === 'offer') {
      await this.entitlementService.consumeQuota(familyId, Capability.WorshipPro, 1);
    }

    const userName = (nickName || '').trim() || '族人';
    const result = await this.dataSource.query<{ insertId: number }>(
      'INSERT INTO `family_worship_record` (`family_id`, `user_id`, `user_name`, `type`, `content`) VALUES (?, ?, ?, ?, ?)',
      [familyId, userId, userName, type, trimmed] as QueryValues
    );

    return {
      stats: await this.getStats(familyId),
      record: {
        id: Number(result?.insertId) || 0,
        userName,
        type: type as WorshipType,
        content: trimmed,
        createTime: this.nowString()
      }
    };
  }

  // ==================== 纪念对象（纪念堂） ====================

  /** 纪念对象列表（含已故成员生卒信息） */
  async getMemorials(userId: string, familyId: number): Promise<WorshipMemorialItem[]> {
    await this.assertFamilyMember(userId, familyId);
    const rows = await this.dataSource.query<
      (WorshipMemorialRow & { birth_date: string; death_date: string })[]
    >(
      `SELECT m.\`id\`, m.\`member_id\`, m.\`member_name\`, m.\`avatar_url\`, m.\`epitaph\`, m.\`create_time\`,
              fm.\`birth_date\`, fm.\`death_date\`
       FROM \`family_worship_memorial\` m
       JOIN \`family_member\` fm ON fm.\`id\` = m.\`member_id\`
       WHERE m.\`family_id\` = ? AND m.\`status\` = 1
       ORDER BY m.\`create_time\` DESC, m.\`id\` DESC`,
      [familyId]
    );
    return rows.map((r) => ({
      id: r.id,
      memberId: r.member_id,
      memberName: r.member_name,
      avatarUrl: r.avatar_url || '',
      epitaph: r.epitaph || '',
      birthDate: r.birth_date || '',
      deathDate: r.death_date || '',
      createTime: r.create_time
    }));
  }

  /** 可创建纪念的已故成员（家族内已故、未创建过纪念） */
  async getMemorialCandidates(userId: string, familyId: number): Promise<WorshipMemorialCandidate[]> {
    await this.assertFamilyMember(userId, familyId);
    const rows = await this.dataSource.query<
      { id: string; name: string; avatar_url: string; birth_date: string; death_date: string }[]
    >(
      `SELECT fm.\`id\`, fm.\`name\`, fm.\`avatar_url\`, fm.\`birth_date\`, fm.\`death_date\`
       FROM \`family_member\` fm
       WHERE fm.\`family_id\` = ? AND fm.\`status\` = 1 AND fm.\`is_alive\` = 0
         AND NOT EXISTS (
           SELECT 1 FROM \`family_worship_memorial\` m
           WHERE m.\`family_id\` = fm.\`family_id\` AND m.\`member_id\` = fm.\`id\` AND m.\`status\` = 1
         )
       ORDER BY fm.\`sort_order\` DESC, fm.\`id\` DESC`,
      [familyId]
    );
    return rows.map((r) => ({
      memberId: r.id,
      name: r.name,
      avatarUrl: r.avatar_url || '',
      birthDate: r.birth_date || '',
      deathDate: r.death_date || ''
    }));
  }

  /**
   * 创建纪念对象（纪念堂）：
   * - 目标成员须为家族内已故成员（is_alive=0）
   * - 同一成员仅允许一个纪念（唯一约束）
   * - 消耗 1 次 worship_pro 额度
   */
  async createMemorial(
    userId: string,
    familyId: number,
    memberId: string,
    epitaph: string
  ): Promise<WorshipMemorialItem> {
    await this.assertFamilyMember(userId, familyId);

    if (!memberId) {
      throw new HttpException('请选择要纪念的成员', HttpStatus.BAD_REQUEST);
    }
    const trimmedEpitaph = String(epitaph || '').trim();
    if (trimmedEpitaph.length > 200) {
      throw new HttpException('纪念寄语不能超过 200 字', HttpStatus.BAD_REQUEST);
    }

    const [member] = await this.dataSource.query<
      { id: string; name: string; avatar_url: string; birth_date: string; death_date: string }[]
    >(
      'SELECT `id`, `name`, `avatar_url`, `birth_date`, `death_date` FROM `family_member` WHERE `id` = ? AND `family_id` = ? AND `status` = 1 AND `is_alive` = 0',
      [memberId, familyId]
    );
    if (!member) {
      throw new HttpException('未找到该已故成员，无法创建纪念', HttpStatus.NOT_FOUND);
    }

    const [dup] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_worship_memorial` WHERE `family_id` = ? AND `member_id` = ? AND `status` = 1',
      [familyId, memberId]
    );
    if (dup) {
      throw new HttpException('该成员已创建纪念', HttpStatus.CONFLICT);
    }

    // 创建纪念（纪念堂）为会员增值能力，消耗 worship_pro 额度
    await this.entitlementService.consumeQuota(familyId, Capability.WorshipPro, 1);

    const result = await this.dataSource.query<{ insertId: number }>(
      'INSERT INTO `family_worship_memorial` (`family_id`, `member_id`, `member_name`, `avatar_url`, `epitaph`, `creator_user_id`) VALUES (?, ?, ?, ?, ?, ?)',
      [familyId, memberId, member.name, member.avatar_url || '', trimmedEpitaph, userId] as QueryValues
    );

    return {
      id: Number(result?.insertId) || 0,
      memberId,
      memberName: member.name,
      avatarUrl: member.avatar_url || '',
      epitaph: trimmedEpitaph,
      birthDate: member.birth_date || '',
      deathDate: member.death_date || '',
      createTime: this.nowString()
    };
  }

  /** 删除纪念对象：仅创建者或家族创建者可删除（不退还额度） */
  async deleteMemorial(userId: string, familyId: number, id: number): Promise<void> {
    await this.assertFamilyMember(userId, familyId);
    if (!id || id <= 0) {
      throw new HttpException('纪念ID非法', HttpStatus.BAD_REQUEST);
    }

    const [mem] = await this.dataSource.query<{ creator_user_id: string }[]>(
      'SELECT `creator_user_id` FROM `family_worship_memorial` WHERE `id` = ? AND `family_id` = ? AND `status` = 1',
      [id, familyId]
    );
    if (!mem) {
      throw new HttpException('纪念对象不存在', HttpStatus.NOT_FOUND);
    }

    const [family] = await this.dataSource.query<{ creator_user_id: string | null }[]>(
      'SELECT `creator_user_id` FROM `family` WHERE `id` = ? AND `status` = 1',
      [familyId]
    );
    if (mem.creator_user_id !== userId && family?.creator_user_id !== userId) {
      throw new HttpException('仅纪念创建者或家族创建者可删除', HttpStatus.FORBIDDEN);
    }

    await this.dataSource.query(
      'UPDATE `family_worship_memorial` SET `status` = 0 WHERE `id` = ? AND `family_id` = ?',
      [id, familyId]
    );
  }

  // ==================== 祈福记录分页 ====================

  /**
   * 祈福记录分页（「查看更多」）：
   * - page 从 1 开始，pageSize 默认 20，上限 50
   * - 可选 type 过滤（incense/pray/offer/wish）
   */
  async getRecordPage(
    userId: string,
    familyId: number,
    page: number,
    pageSize: number,
    type?: string
  ): Promise<WorshipRecordPageResult> {
    await this.assertFamilyMember(userId, familyId);

    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safeSize = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : 20;
    const offset = (safePage - 1) * safeSize;

    const where = '`family_id` = ?' + (type && WORSHIP_TYPES.includes(type as WorshipType) ? ' AND `type` = ?' : '');
    const params: QueryValues = type && WORSHIP_TYPES.includes(type as WorshipType) ? [familyId, type] : [familyId];

    const [countRow] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`family_worship_record\` WHERE ${where}`,
      params
    );
    const rows = await this.dataSource.query<WorshipRecordRow[]>(
      `SELECT \`id\`, \`user_name\`, \`type\`, \`content\`, \`create_time\`
       FROM \`family_worship_record\`
       WHERE ${where}
       ORDER BY \`create_time\` DESC, \`id\` DESC
       LIMIT ? OFFSET ?`,
      [...params, safeSize, offset] as QueryValues
    );

    return {
      list: rows.map((r) => this.toRecordItem(r)),
      total: Number(countRow?.total) || 0,
      page: safePage,
      pageSize: safeSize,
      hasMore: safePage * safeSize < Number(countRow?.total)
    };
  }

  // ==================== 纪念对象详情 ====================

  /** 纪念对象详情：纪念信息 + 家族最近祭祀记录（供详情页展示） */
  async getMemorialDetail(userId: string, familyId: number, id: number): Promise<WorshipMemorialDetail> {
    await this.assertFamilyMember(userId, familyId);
    if (!id || id <= 0) {
      throw new HttpException('纪念ID非法', HttpStatus.BAD_REQUEST);
    }

    const [mem] = await this.dataSource.query<
      (WorshipMemorialRow & { birth_date: string; death_date: string })[]
    >(
      `SELECT m.\`id\`, m.\`member_id\`, m.\`member_name\`, m.\`avatar_url\`, m.\`epitaph\`, m.\`create_time\`,
              fm.\`birth_date\`, fm.\`death_date\`
       FROM \`family_worship_memorial\` m
       JOIN \`family_member\` fm ON fm.\`id\` = m.\`member_id\`
       WHERE m.\`id\` = ? AND m.\`family_id\` = ? AND m.\`status\` = 1`,
      [id, familyId]
    );
    if (!mem) {
      throw new HttpException('纪念对象不存在', HttpStatus.NOT_FOUND);
    }

    const rows = await this.dataSource.query<WorshipRecordRow[]>(
      `SELECT \`id\`, \`user_name\`, \`type\`, \`content\`, \`create_time\`
       FROM \`family_worship_record\`
       WHERE \`family_id\` = ?
       ORDER BY \`create_time\` DESC, \`id\` DESC
       LIMIT 20`,
      [familyId]
    );

    return {
      memorial: {
        id: mem.id,
        memberId: mem.member_id,
        memberName: mem.member_name,
        avatarUrl: mem.avatar_url || '',
        epitaph: mem.epitaph || '',
        birthDate: mem.birth_date || '',
        deathDate: mem.death_date || '',
        createTime: mem.create_time
      },
      records: rows.map((r) => this.toRecordItem(r))
    };
  }

  // ==================== 纪念日提醒（reminder 权益） ====================

  /**
   * 纪念日/生日提醒（reminder 能力点，拦截型）：
   * - 在世成员 → 出生日期周年（生日）
   * - 已故成员 → 逝世日期周年（忌日）
   * - 返回未来 days 天内（含今天）的提醒，按剩余天数升序
   * 未开通该权益时抛 4001 引导升级。
   */
  async getReminders(userId: string, familyId: number, days: number): Promise<WorshipReminderResult> {
    await this.assertFamilyMember(userId, familyId);
    // 拦截型能力点：套餐未含 reminder → EntitlementException(4001)；订阅过期 → 4004
    await this.entitlementService.assertCapability(familyId, Capability.Reminder);

    const safeDays = Number.isInteger(days) && days >= 0 && days <= 365 ? days : 30;

    const rows = await this.dataSource.query<
      { id: string; name: string; is_alive: number; birth_date: string; death_date: string }[]
    >(
      `SELECT \`id\`, \`name\`, \`is_alive\`, \`birth_date\`, \`death_date\`
       FROM \`family_member\`
       WHERE \`family_id\` = ? AND \`status\` = 1`,
      [familyId]
    );

    const now = new Date();
    const list: WorshipReminderItem[] = [];
    rows.forEach((r) => {
      const dateStr = Number(r.is_alive) === 1 ? r.birth_date : r.death_date;
      const sourceDate = this.parseDate(dateStr);
      if (!sourceDate) return;

      const remindType: WorshipRemindType = Number(r.is_alive) === 1 ? 'birth' : 'death';
      const next = this.nextAnniversary(sourceDate, now);
      if (next === null) return;
      if (next.daysUntil > safeDays) return;

      const mmdd = `${String(sourceDate.getMonth() + 1).padStart(2, '0')}-${String(sourceDate.getDate()).padStart(2, '0')}`;
      list.push({
        memberId: r.id,
        memberName: r.name,
        remindType,
        date: mmdd,
        daysUntil: next.daysUntil,
        desc: `${remindType === 'birth' ? '生日' : '忌日'} ${mmdd}`
      });
    });

    list.sort((a, b) => a.daysUntil - b.daysUntil);
    return { familyId, days: safeDays, list };
  }

  /** 解析日期字符串（兼容 'YYYY-MM-DD' / 'YYYY/MM/DD' / 'YYYY.MM.DD'），非法返回 null */
  private parseDate(value: string): Date | null {
    if (!value) return null;
    const m = String(value).trim().match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * 计算某日期下一个周年（从今天起）：
   * - 今天恰逢周年 → daysUntil = 0
   * - 已过 → 计算到次年；2 月 29 日非闰年顺延至 3 月 1 日
   * 返回 null 表示无法计算（仅理论上不可能）
   */
  private nextAnniversary(source: Date, now: Date): { daysUntil: number } | null {
    let year = now.getFullYear();
    let month = source.getMonth();
    let day = source.getDate();
    if (month === 1 && day === 29) {
      // 非闰年 2 月无 29 日，顺延到 3 月 1 日
      const inThisYear = new Date(year, 1, 29);
      if (inThisYear.getMonth() !== 1) {
        month = 2;
        day = 1;
      }
    }
    let next = new Date(year, month, day);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (next.getTime() < todayStart.getTime()) {
      next = new Date(year + 1, month, day);
    }
    const daysUntil = Math.round((next.getTime() - todayStart.getTime()) / 86400000);
    return daysUntil >= 0 ? { daysUntil } : null;
  }

  /** 今日各类型统计（DATE(create_time) = CURDATE() 与存储时区保持一致） */
  private async getStats(familyId: number): Promise<WorshipStats> {
    const rows = await this.dataSource.query<{ type: WorshipType; cnt: number }[]>(
      `SELECT \`type\`, COUNT(*) AS cnt
       FROM \`family_worship_record\`
       WHERE \`family_id\` = ? AND DATE(\`create_time\`) = CURDATE()
       GROUP BY \`type\``,
      [familyId]
    );
    const map: Record<string, number> = {};
    rows.forEach((r) => {
      map[r.type] = Number(r.cnt);
    });
    return {
      incenseCount: map['incense'] || 0,
      prayCount: map['pray'] || 0,
      offerCount: map['offer'] || 0,
      wishCount: map['wish'] || 0,
      totalCount: rows.reduce((sum, r) => sum + Number(r.cnt), 0)
    };
  }

  /** 行记录 → 对外条目 */
  private toRecordItem(r: WorshipRecordRow): WorshipRecordItem {
    return {
      id: r.id,
      userName: r.user_name,
      type: r.type,
      content: r.content || '',
      createTime: r.create_time
    };
  }

  /** 当前时间字符串（与 MySQL DATETIME 格式一致，供新记录即时展示） */
  private nowString(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /**
   * 用户是否属于该家族：
   * - family_permission 有效记录
   * - 或 user.family_id 已关联该家族（joinFamily 的实际归属途径）
   * - 或家族创建者
   * 三者任一满足即可，否则 403。
   */
  private async assertFamilyMember(userId: string, familyId: number): Promise<void> {
    if (!familyId || familyId <= 0) {
      throw new HttpException('缺少家族ID', HttpStatus.BAD_REQUEST);
    }

    const [perm] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_permission` WHERE `family_id` = ? AND `user_id` = ? AND `status` = 1',
      [familyId, userId]
    );
    if (perm) return;

    const [binding] = await this.dataSource.query<{ family_id: number | null }[]>(
      'SELECT `family_id` FROM `user` WHERE `id` = ? AND `status` = 1 LIMIT 1',
      [userId]
    );
    if (binding && Number(binding.family_id) === Number(familyId)) return;

    const [family] = await this.dataSource.query<{ creator_user_id: string | null }[]>(
      'SELECT `creator_user_id` FROM `family` WHERE `id` = ? AND `status` = 1',
      [familyId]
    );
    if (family && family.creator_user_id === userId) return;

    throw new HttpException('您不属于该家族，无权操作', HttpStatus.FORBIDDEN);
  }
}
