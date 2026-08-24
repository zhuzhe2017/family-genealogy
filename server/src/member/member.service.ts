import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * 用户侧会员服务：打通小程序用户与 CRM 会员档案
 * - 绑定：用户登录/绑定手机号时按手机号匹配会员（bindByPhone）；
 *         后台建档时按手机号反查用户（bindUserByPhone）
 * - 积分自动触发：注册送（首次手机号绑定建档）、消费得（订阅支付回调）、签到得（每日）
 */

/** 会员行（用户侧需要的字段） */
interface MemberRow {
  id: number;
  member_no: string;
  name: string;
  phone: string | null;
  user_id: string;
  level_id: number;
  points: number;
  total_consume: string | number;
  consume_count: number;
  status: number;
}

/** 绑定结果对外结构 */
export interface MemberBindResult {
  id: number;
  memberNo: string;
  name: string;
  phone: string | null;
  levelId: number;
  points: number;
}

const PHONE_REGEX = /^1[3-9]\d{9}$/;

@Injectable()
export class MemberService {
  constructor(private readonly dataSource: DataSource) {}

  /** 用户侧：按手机号匹配并绑定 CRM 会员（幂等）。无匹配档案返回 null */
  async bindByPhone(userId: string, phone: string | null | undefined): Promise<MemberBindResult | null> {
    const normalized = (phone ?? '').trim();
    if (!normalized || !PHONE_REGEX.test(normalized)) return null;

    // 已绑定过 → 幂等返回
    const [bound] = await this.dataSource.query<MemberRow[]>(
      'SELECT `id`, `member_no`, `name`, `phone`, `user_id`, `level_id`, `points`, `total_consume`, `consume_count`, `status` FROM `member` WHERE `user_id` = ? LIMIT 1',
      [userId]
    );
    if (bound) return this.toBindResult(bound);

    // 按手机号匹配「尚未绑定用户」的会员档案
    const [member] = await this.dataSource.query<MemberRow[]>(
      'SELECT `id`, `member_no`, `name`, `phone`, `user_id`, `level_id`, `points`, `total_consume`, `consume_count`, `status` FROM `member` WHERE `phone` = ? AND `user_id` = ? LIMIT 1',
      [normalized, '']
    );
    if (!member) return null;

    // 抢占绑定（唯一键冲突兜底：并发下已被他人绑定则视为未匹配成功）
    const result = await this.dataSource.query(
      'UPDATE `member` SET `user_id` = ? WHERE `id` = ? AND `user_id` = ?',
      [userId, member.id, '']
    );
    if (this.affectedRows(result) === 0) return null;

    // 注册送积分（仅首次绑定建档）
    await this.awardRegisterPoints(member.id);

    const fresh = await this.findMemberById(member.id);
    return this.toBindResult(fresh);
  }

  /** 后台侧：新增/导入会员后，按手机号反向绑定已有用户（幂等） */
  async bindUserByPhone(memberId: number, phone: string | null | undefined): Promise<void> {
    const normalized = (phone ?? '').trim();
    if (!normalized || !PHONE_REGEX.test(normalized)) return;

    const [binding] = await this.dataSource.query<{ user_id: string }[]>(
      'SELECT `user_id` FROM `user_auth_identity` WHERE `provider` = ? AND `provider_uid` = ? AND `status` = 1 LIMIT 1',
      ['phone', normalized]
    );
    if (!binding || !binding.user_id) return;

    await this.dataSource.query(
      'UPDATE `member` SET `user_id` = ? WHERE `id` = ? AND `user_id` = ?',
      [binding.user_id, memberId, '']
    );
  }

  /** 消费得积分：订阅支付成功回调调用（幂等，同一订单只入账一次） */
  async recordConsumeForUser(userId: string, orderNo: string, amount: number, sourceId: string): Promise<void> {
    const [member] = await this.dataSource.query<MemberRow[]>(
      'SELECT `id`, `member_no`, `name`, `phone`, `user_id`, `level_id`, `points`, `total_consume`, `consume_count`, `status` FROM `member` WHERE `user_id` = ? LIMIT 1',
      [userId]
    );
    if (!member) return;

    const [exists] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `member_consume` WHERE `order_no` = ?',
      [orderNo]
    );
    if (exists) return; // 幂等

    const pointsGained = await this.calcConsumePoints(amount);
    const newPoints = member.points + pointsGained;
    const newTotal = Math.round(amount * 100) / 100;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        'INSERT INTO `member_consume` (`order_no`, `member_id`, `consume_type`, `amount`, `points_gained`, `pay_time`, `status`, `operator`, `remark`) VALUES (?, ?, ?, ?, ?, NOW(), 1, ?, ?)',
        [orderNo, member.id, 'membership', newTotal, pointsGained, '', `订阅订单 ${sourceId}`]
      );
      await queryRunner.query(
        'UPDATE `member` SET `total_consume` = `total_consume` + ?, `consume_count` = `consume_count` + 1, `points` = ? WHERE `id` = ?',
        [newTotal, newPoints, member.id]
      );
      if (pointsGained > 0) {
        await queryRunner.query(
          'INSERT INTO `points_record` (`member_id`, `change_points`, `balance_points`, `biz_type`, `source_id`, `remark`, `operator`) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [member.id, pointsGained, newPoints, 'consume', sourceId, `订阅消费入账 ${newTotal.toFixed(2)} 元`, '']
        );
      }
      await this.recalcLevelTx(queryRunner, member.id, newPoints);
      await queryRunner.commitTransaction();
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /** 每日签到得积分（幂等：同一会员当天只可签到一次） */
  async signIn(userId: string): Promise<{ points: number; balancePoints: number }> {
    const [member] = await this.dataSource.query<MemberRow[]>(
      'SELECT `id`, `member_no`, `name`, `phone`, `user_id`, `level_id`, `points`, `total_consume`, `consume_count`, `status` FROM `member` WHERE `user_id` = ? LIMIT 1',
      [userId]
    );
    if (!member) {
      throw new HttpException('尚未开通会员档案，请先在会员中心绑定手机号', HttpStatus.NOT_FOUND);
    }

    const [rule] = await this.dataSource.query<{ points: number }[]>(
      "SELECT `points` FROM `points_rule` WHERE `code` = 'signin' AND `enabled` = 1 LIMIT 1"
    );
    if (!rule || Number(rule.points) <= 0) {
      throw new HttpException('签到积分规则未启用', HttpStatus.BAD_REQUEST);
    }

    const [today] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `points_record` WHERE `member_id` = ? AND `biz_type` = ? AND DATE(`create_time`) = CURDATE() LIMIT 1',
      [member.id, 'signin']
    );
    if (today) {
      throw new HttpException('今日已签到', HttpStatus.CONFLICT);
    }

    const balance = await this.changePoints(member.id, Number(rule.points), 'signin', '', '每日签到');
    return { points: Number(rule.points), balancePoints: balance };
  }

  /** 我的会员信息（含等级与积分明细），未建档返回 null */
  async getMyMember(userId: string): Promise<Record<string, unknown> | null> {
    const member = await this.findMemberByIdByUser(userId);
    if (!member) return null;

    const [level] = await this.dataSource.query<{ id: number; name: string; code: string }[]>(
      'SELECT `id`, `name`, `code` FROM `member_level` WHERE `id` = ?',
      [member.level_id]
    );
    const records = await this.dataSource.query<{ change_points: number; balance_points: number; biz_type: string; remark: string; create_time: Date }[]>(
      'SELECT `change_points`, `balance_points`, `biz_type`, `remark`, `create_time` FROM `points_record` WHERE `member_id` = ? ORDER BY `id` DESC LIMIT 20',
      [member.id]
    );

    return {
      member: {
        id: member.id,
        memberNo: member.member_no,
        name: member.name,
        phone: member.phone,
        points: member.points,
        totalConsume: Number(member.total_consume),
        consumeCount: member.consume_count,
        status: member.status
      },
      level: level ? { id: level.id, name: level.name, code: level.code } : null,
      pointsRecords: records.map(r => ({
        changePoints: r.change_points,
        balancePoints: r.balance_points,
        bizType: r.biz_type,
        remark: r.remark,
        createTime: r.create_time
      }))
    };
  }

  // ==================== 私有方法 ====================

  /** 注册送积分（仅首次：该会员从未有过 register 记录时赠送） */
  private async awardRegisterPoints(memberId: number): Promise<void> {
    const [rule] = await this.dataSource.query<{ points: number }[]>(
      "SELECT `points` FROM `points_rule` WHERE `code` = 'register' AND `enabled` = 1 LIMIT 1"
    );
    if (!rule || Number(rule.points) <= 0) return;

    const [existed] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `points_record` WHERE `member_id` = ? AND `biz_type` = ? LIMIT 1',
      [memberId, 'register']
    );
    if (existed) return;

    await this.changePoints(memberId, Number(rule.points), 'register', '', '手机号绑定注册赠送');
  }

  /** 积分变更（事务：更新余额 + 写变动记录 + 等级联动） */
  private async changePoints(memberId: number, changePoints: number, bizType: string, sourceId: string, remark: string): Promise<number> {
    const [member] = await this.dataSource.query<{ id: number; points: number }[]>(
      'SELECT `id`, `points` FROM `member` WHERE `id` = ?',
      [memberId]
    );
    if (!member) return 0;

    const newPoints = Math.max(0, member.points + changePoints);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query('UPDATE `member` SET `points` = ? WHERE `id` = ?', [newPoints, memberId]);
      await queryRunner.query(
        'INSERT INTO `points_record` (`member_id`, `change_points`, `balance_points`, `biz_type`, `source_id`, `remark`, `operator`) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [memberId, changePoints, newPoints, bizType, sourceId, remark.slice(0, 500), '']
      );
      await this.recalcLevelTx(queryRunner, memberId, newPoints);
      await queryRunner.commitTransaction();
      return newPoints;
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /** 按积分重算等级（与后台 adjust 逻辑一致） */
  private async recalcLevelTx(
    executor: { query: <T>(sql: string, params?: unknown[]) => Promise<T> },
    memberId: number,
    points: number
  ): Promise<void> {
    const levels = await executor.query<{ id: number; points_min: number; points_max: number }[]>(
      'SELECT `id`, `points_min`, `points_max` FROM `member_level` WHERE `status` = 1 ORDER BY `points_min` DESC'
    );
    for (const lv of levels) {
      if (points >= lv.points_min && (lv.points_max === 0 || points <= lv.points_max)) {
        await executor.query('UPDATE `member` SET `level_id` = ? WHERE `id` = ?', [lv.id, memberId]);
        return;
      }
    }
  }

  /** 消费积分：按启用的消费规则倍率取整 */
  private async calcConsumePoints(amount: number): Promise<number> {
    const [rule] = await this.dataSource.query<{ points_per_amount: string | number }[]>(
      "SELECT `points_per_amount` FROM `points_rule` WHERE `code` = 'consume' AND `enabled` = 1 LIMIT 1"
    );
    const rate = Number(rule?.points_per_amount) || 0;
    return Math.floor(amount * rate);
  }

  private async findMemberById(memberId: number): Promise<MemberRow> {
    const [member] = await this.dataSource.query<MemberRow[]>(
      'SELECT `id`, `member_no`, `name`, `phone`, `user_id`, `level_id`, `points`, `total_consume`, `consume_count`, `status` FROM `member` WHERE `id` = ?',
      [memberId]
    );
    return member;
  }

  private async findMemberByIdByUser(userId: string): Promise<MemberRow | null> {
    const [member] = await this.dataSource.query<MemberRow[]>(
      'SELECT `id`, `member_no`, `name`, `phone`, `user_id`, `level_id`, `points`, `total_consume`, `consume_count`, `status` FROM `member` WHERE `user_id` = ? LIMIT 1',
      [userId]
    );
    return member || null;
  }

  private toBindResult(m: MemberRow): MemberBindResult {
    return {
      id: m.id,
      memberNo: m.member_no,
      name: m.name,
      phone: m.phone,
      levelId: m.level_id,
      points: m.points
    };
  }

  private affectedRows(result: unknown): number {
    return (result as { affectedRows?: number })?.affectedRows ?? 0;
  }
}
