import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import * as XLSX from 'xlsx';
import { SystemLogService } from '../system-log/system-log.service';
import { MemberService } from './member.service';
import { type QueryValues } from '../common/types/common';
import {
  type MemberRow,
  type LevelRow,
  type PointsRuleRow,
  type PointsRecordRow,
  type ConsumeRow,
  type MemberCreateData,
  type MemberUpdateData,
  type LevelUpsertData,
  type PointsRuleUpsertData,
  type PointsAdjustData,
  type ConsumeCreateData,
  type MemberStatsOverview,
  type ConsumeTrendItem
} from './types/member-admin.types';

/** 手机号正则（中国大陆 11 位） */
const PHONE_REGEX = /^1[3-9]\d{9}$/;
/** 性别合法值 */
const GENDER_VALUES = [0, 1, 2];
/** 消费类型枚举 */
const CONSUME_TYPES = ['goods', 'service', 'recharge', 'membership', 'other'];
/** 积分业务类型枚举 */
const POINTS_BIZ_TYPES = ['consume', 'register', 'signin', 'adjust', 'refund'];

interface OpLogParams {
  action: string;
  path: string;
  operator: string;
  operatorId: number | null;
  detail: string;
}

@Injectable()
export class MemberAdminService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly systemLogService: SystemLogService,
    private readonly memberService: MemberService
  ) {}

  // ==================== 会员信息 ====================

  /** 会员分页列表（join 等级名） */
  async getMemberList(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    levelId?: number;
    status?: number;
  }) {
    const { page, pageSize, keyword, levelId, status } = params;
    const offset = (page - 1) * pageSize;
    const where: string[] = [];
    const values: QueryValues = [];

    if (keyword) {
      where.push('(m.`name` LIKE ? OR m.`member_no` LIKE ? OR m.`phone` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (levelId && levelId > 0) {
      where.push('m.`level_id` = ?');
      values.push(levelId);
    }
    if (status !== undefined && status !== null) {
      where.push('m.`status` = ?');
      values.push(status);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`member\` m ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<MemberRow[]>(
      `SELECT m.\`id\`, m.\`member_no\`, m.\`name\`, m.\`phone\`, m.\`gender\`, m.\`birthday\`,
              m.\`level_id\`, COALESCE(l.\`name\`, '') AS \`level_name\`,
              m.\`points\`, m.\`total_consume\`, m.\`consume_count\`, m.\`status\`, m.\`remark\`,
              m.\`create_time\`, m.\`update_time\`
       FROM \`member\` m
       LEFT JOIN \`member_level\` l ON l.\`id\` = m.\`level_id\`
       ${whereClause}
       ORDER BY m.\`id\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return {
      list: list.map((row) => this.mapMember(row)),
      total,
      page,
      pageSize
    };
  }

  /** 会员详情（含累计消费与积分概览） */
  async getMemberById(id: number) {
    const [row] = await this.dataSource.query<MemberRow[]>(
      `SELECT m.\`id\`, m.\`member_no\`, m.\`name\`, m.\`phone\`, m.\`gender\`, m.\`birthday\`,
              m.\`level_id\`, COALESCE(l.\`name\`, '') AS \`level_name\`,
              m.\`points\`, m.\`total_consume\`, m.\`consume_count\`, m.\`status\`, m.\`remark\`,
              m.\`create_time\`, m.\`update_time\`
       FROM \`member\` m
       LEFT JOIN \`member_level\` l ON l.\`id\` = m.\`level_id\`
       WHERE m.\`id\` = ?`,
      [id]
    );
    if (!row) {
      throw new HttpException('会员不存在', HttpStatus.NOT_FOUND);
    }

    const [consumeStats] = await this.dataSource.query<{
      count: number;
      amount: string | number;
      last_pay_time: Date | string | null;
    }[]>(
      `SELECT COUNT(*) AS \`count\`, COALESCE(SUM(\`amount\`), 0) AS \`amount\`, MAX(\`pay_time\`) AS \`last_pay_time\`
       FROM \`member_consume\` WHERE \`member_id\` = ? AND \`status\` = 1`,
      [id]
    );

    return {
      ...this.mapMember(row),
      consumeStats: {
        count: Number(consumeStats?.count) || 0,
        amount: Number(consumeStats?.amount) || 0,
        lastPayTime: consumeStats?.last_pay_time ?? null
      }
    };
  }

  /** 创建会员（自动编号 + 等级初始化 + 注册积分） */
  async createMember(data: MemberCreateData, operator: string, operatorId: number | null) {
    const name = (data.name || '').trim();
    if (!name) {
      throw new HttpException('会员姓名不能为空', HttpStatus.BAD_REQUEST);
    }
    if (name.length > 50) {
      throw new HttpException('会员姓名不能超过 50 个字符', HttpStatus.BAD_REQUEST);
    }

    const phone = this.normalizePhone(data.phone);
    if (phone !== null && !PHONE_REGEX.test(phone)) {
      throw new HttpException('手机号格式不正确', HttpStatus.BAD_REQUEST);
    }
    if (phone !== null) {
      const [exists] = await this.dataSource.query<{ id: number }[]>(
        'SELECT `id` FROM `member` WHERE `phone` = ?',
        [phone]
      );
      if (exists) {
        throw new HttpException('该手机号已存在会员', HttpStatus.BAD_REQUEST);
      }
    }

    const gender = this.sanitizeGender(data.gender);
    const levelId = data.levelId && data.levelId > 0 ? Number(data.levelId) : await this.getDefaultLevelId();
    let points = data.points !== undefined && data.points !== null ? Math.round(Number(data.points)) : 0;
    if (points < 0) {
      throw new HttpException('初始积分不能为负数', HttpStatus.BAD_REQUEST);
    }
    const status = data.status === 0 ? 0 : 1;
    const birthday = this.normalizeDate(data.birthday);

    const memberNo = await this.generateMemberNo();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // 注册赠送积分（规则 register 启用时，且未手动指定初始积分时）
      const registerPoints = await this.getRulePoints('register');
      if (points <= 0 && registerPoints > 0) {
        points = registerPoints;
      }

      const finalLevelId = await this.recalcLevelTx(queryRunner, memberNo, points, levelId);

      const result = (await queryRunner.query(
        `INSERT INTO \`member\` (\`member_no\`, \`name\`, \`phone\`, \`gender\`, \`birthday\`, \`level_id\`, \`points\`, \`status\`, \`remark\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [memberNo, name, phone, gender, birthday, finalLevelId, points, status, (data.remark || '').slice(0, 500)]
      )) as { insertId: number };

      // 初始积分 > 0 时记录积分变动
      if (points > 0) {
        await queryRunner.query(
          'INSERT INTO `points_record` (`member_id`, `change_points`, `balance_points`, `biz_type`, `source_id`, `remark`, `operator`) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [result.insertId, points, points, 'register', '', '创建会员初始/注册赠送积分', operator]
        );
      }

      await queryRunner.commitTransaction();

      this.writeLog({
        action: '新增会员',
        path: '/api/member/members/create',
        operator,
        operatorId,
        detail: `memberNo=${memberNo} name=${name} phone=${phone || ''} points=${points}`
      });

      // 按手机号反向绑定已有小程序用户（幂等）
      await this.memberService.bindUserByPhone(result.insertId, phone);
      return { id: result.insertId, memberNo };
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /** 更新会员信息 */
  async updateMember(id: number, data: MemberUpdateData, operator: string, operatorId: number | null) {
    const [member] = await this.dataSource.query<{ id: number; points: number; phone: string | null }[]>(
      'SELECT `id`, `points`, `phone` FROM `member` WHERE `id` = ?',
      [id]
    );
    if (!member) {
      throw new HttpException('会员不存在', HttpStatus.NOT_FOUND);
    }

    if (data.name !== undefined) {
      const name = (data.name || '').trim();
      if (!name) throw new HttpException('会员姓名不能为空', HttpStatus.BAD_REQUEST);
      if (name.length > 50) throw new HttpException('会员姓名不能超过 50 个字符', HttpStatus.BAD_REQUEST);
    }

    let phone = member.phone;
    if (data.phone !== undefined) {
      phone = this.normalizePhone(data.phone);
      if (phone !== null && !PHONE_REGEX.test(phone)) {
        throw new HttpException('手机号格式不正确', HttpStatus.BAD_REQUEST);
      }
      if (phone !== null) {
        const [exists] = await this.dataSource.query<{ id: number }[]>(
          'SELECT `id` FROM `member` WHERE `phone` = ? AND `id` != ?',
          [phone, id]
        );
        if (exists) {
          throw new HttpException('该手机号已被其他会员使用', HttpStatus.BAD_REQUEST);
        }
      }
    }

    const gender = data.gender !== undefined ? this.sanitizeGender(data.gender) : undefined;
    const birthday = data.birthday !== undefined ? this.normalizeDate(data.birthday) : undefined;
    const levelId = data.levelId !== undefined && data.levelId !== null && data.levelId > 0 ? Number(data.levelId) : undefined;
    const status = data.status !== undefined ? (data.status === 0 ? 0 : 1) : undefined;

    const fields: string[] = [];
    const values: QueryValues = [];
    if (data.name !== undefined) { fields.push('`name` = ?'); values.push((data.name || '').trim()); }
    if (phone !== member.phone) { fields.push('`phone` = ?'); values.push(phone); }
    if (gender !== undefined) { fields.push('`gender` = ?'); values.push(gender); }
    if (birthday !== undefined) { fields.push('`birthday` = ?'); values.push(birthday); }
    if (levelId !== undefined) { fields.push('`level_id` = ?'); values.push(levelId); }
    if (status !== undefined) { fields.push('`status` = ?'); values.push(status); }
    if (data.remark !== undefined) { fields.push('`remark` = ?'); values.push(String(data.remark || '').slice(0, 500)); }

    if (fields.length === 0) {
      throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);
    }

    values.push(id);
    await this.dataSource.query(`UPDATE \`member\` SET ${fields.join(', ')} WHERE \`id\` = ?`, values);

    // 未指定等级时按积分自动重算等级，保证一致性
    if (levelId === undefined) {
      await this.recalcLevelTx(this.dataSource, String(id), member.points, undefined);
    }

    this.writeLog({
      action: '编辑会员',
      path: `/api/member/members/update/${id}`,
      operator,
      operatorId,
      detail: `member=${id} fields=${fields.length}`
    });

    // 手机号变更后按新号反向绑定已有用户（幂等）
    if (phone !== null) {
      await this.memberService.bindUserByPhone(id, phone);
    }
    return { success: true };
  }

  /** 删除会员（事务：级联删除积分与消费记录） */
  async deleteMember(id: number, operator: string, operatorId: number | null) {
    const [member] = await this.dataSource.query<{ id: number; member_no: string; name: string }[]>(
      'SELECT `id`, `member_no`, `name` FROM `member` WHERE `id` = ?',
      [id]
    );
    if (!member) {
      throw new HttpException('会员不存在', HttpStatus.NOT_FOUND);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query('DELETE FROM `points_record` WHERE `member_id` = ?', [id]);
      await queryRunner.query('DELETE FROM `member_consume` WHERE `member_id` = ?', [id]);
      await queryRunner.query('DELETE FROM `member` WHERE `id` = ?', [id]);
      await queryRunner.commitTransaction();

      this.writeLog({
        action: '删除会员',
        path: `/api/member/members/delete/${id}`,
        operator,
        operatorId,
        detail: `member=${id} memberNo=${member.member_no} name=${member.name}`
      });
      return { success: true };
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      throw new HttpException(this.errMsg(err), HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== 会员等级 ====================

  /** 等级列表（全部，供下拉选择） */
  async getLevelList() {
    const list = await this.dataSource.query<LevelRow[]>(
      'SELECT `id`, `name`, `code`, `points_min`, `points_max`, `discount_rate`, `sort_order`, `status`, `remark`, `create_time`, `update_time` FROM `member_level` ORDER BY `sort_order` ASC, `id` ASC'
    );
    return {
      list: list.map((row) => this.mapLevel(row)),
      total: list.length
    };
  }

  /** 新增等级 */
  async createLevel(data: LevelUpsertData, operator: string, operatorId: number | null) {
    const name = (data.name || '').trim();
    const code = (data.code || '').trim();
    if (!name) throw new HttpException('等级名称不能为空', HttpStatus.BAD_REQUEST);
    if (!code) throw new HttpException('等级编码不能为空', HttpStatus.BAD_REQUEST);

    const [exists] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `member_level` WHERE `code` = ?',
      [code]
    );
    if (exists) throw new HttpException(`等级编码已存在: ${code}`, HttpStatus.BAD_REQUEST);

    await this.dataSource.query(
      'INSERT INTO `member_level` (`name`, `code`, `points_min`, `points_max`, `discount_rate`, `sort_order`, `status`, `remark`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        name,
        code,
        Math.max(0, Math.round(Number(data.pointsMin) || 0)),
        Math.max(0, Math.round(Number(data.pointsMax) || 0)),
        this.sanitizeDiscount(data.discountRate),
        Math.max(0, Math.round(Number(data.sortOrder) || 0)),
        data.status === 0 ? 0 : 1,
        (data.remark || '').slice(0, 200)
      ]
    );
    this.writeLog({
      action: '新增会员等级',
      path: '/api/member/levels/create',
      operator,
      operatorId,
      detail: `code=${code} name=${name}`
    });
    return { success: true };
  }

  /** 更新等级 */
  async updateLevel(id: number, data: LevelUpsertData, operator: string, operatorId: number | null) {
    const [level] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `member_level` WHERE `id` = ?',
      [id]
    );
    if (!level) throw new HttpException('等级不存在', HttpStatus.NOT_FOUND);

    if (data.name !== undefined && !(data.name || '').trim()) {
      throw new HttpException('等级名称不能为空', HttpStatus.BAD_REQUEST);
    }
    if (data.code !== undefined) {
      const code = (data.code || '').trim();
      if (!code) throw new HttpException('等级编码不能为空', HttpStatus.BAD_REQUEST);
      const [exists] = await this.dataSource.query<{ id: number }[]>(
        'SELECT `id` FROM `member_level` WHERE `code` = ? AND `id` != ?',
        [code, id]
      );
      if (exists) throw new HttpException(`等级编码已存在: ${code}`, HttpStatus.BAD_REQUEST);
    }

    const fields: string[] = [];
    const values: QueryValues = [];
    if (data.name !== undefined) { fields.push('`name` = ?'); values.push((data.name || '').trim()); }
    if (data.code !== undefined) { fields.push('`code` = ?'); values.push((data.code || '').trim()); }
    if (data.pointsMin !== undefined) { fields.push('`points_min` = ?'); values.push(Math.max(0, Math.round(Number(data.pointsMin) || 0))); }
    if (data.pointsMax !== undefined) { fields.push('`points_max` = ?'); values.push(Math.max(0, Math.round(Number(data.pointsMax) || 0))); }
    if (data.discountRate !== undefined) { fields.push('`discount_rate` = ?'); values.push(this.sanitizeDiscount(data.discountRate)); }
    if (data.sortOrder !== undefined) { fields.push('`sort_order` = ?'); values.push(Math.max(0, Math.round(Number(data.sortOrder) || 0))); }
    if (data.status !== undefined) { fields.push('`status` = ?'); values.push(data.status === 0 ? 0 : 1); }
    if (data.remark !== undefined) { fields.push('`remark` = ?'); values.push(String(data.remark || '').slice(0, 200)); }

    if (fields.length === 0) throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);

    values.push(id);
    await this.dataSource.query(`UPDATE \`member_level\` SET ${fields.join(', ')} WHERE \`id\` = ?`, values);
    this.writeLog({
      action: '编辑会员等级',
      path: `/api/member/levels/update/${id}`,
      operator,
      operatorId,
      detail: `level=${id} fields=${fields.length}`
    });
    return { success: true };
  }

  /** 删除等级（被会员引用时禁止删除，建议改为停用） */
  async deleteLevel(id: number, operator: string, operatorId: number | null) {
    const [level] = await this.dataSource.query<{ id: number; name: string }[]>(
      'SELECT `id`, `name` FROM `member_level` WHERE `id` = ?',
      [id]
    );
    if (!level) throw new HttpException('等级不存在', HttpStatus.NOT_FOUND);

    const [ref] = await this.dataSource.query<{ cnt: number }[]>(
      'SELECT COUNT(*) AS `cnt` FROM `member` WHERE `level_id` = ?',
      [id]
    );
    if ((ref?.cnt || 0) > 0) {
      throw new HttpException('该等级下存在会员，无法删除，可改为停用', HttpStatus.BAD_REQUEST);
    }

    await this.dataSource.query('DELETE FROM `member_level` WHERE `id` = ?', [id]);
    this.writeLog({
      action: '删除会员等级',
      path: `/api/member/levels/delete/${id}`,
      operator,
      operatorId,
      detail: `level=${id} name=${level.name}`
    });
    return { success: true };
  }

  // ==================== 积分规则 ====================

  /** 积分规则列表 */
  async getPointsRuleList() {
    const list = await this.dataSource.query<PointsRuleRow[]>(
      'SELECT `id`, `name`, `code`, `points`, `points_per_amount`, `enabled`, `sort_order`, `remark`, `create_time`, `update_time` FROM `points_rule` ORDER BY `sort_order` ASC, `id` ASC'
    );
    return {
      list: list.map((row) => this.mapRule(row)),
      total: list.length
    };
  }

  /** 新增积分规则 */
  async createPointsRule(data: PointsRuleUpsertData, operator: string, operatorId: number | null) {
    const name = (data.name || '').trim();
    const code = (data.code || '').trim();
    if (!name) throw new HttpException('规则名称不能为空', HttpStatus.BAD_REQUEST);
    if (!code) throw new HttpException('规则编码不能为空', HttpStatus.BAD_REQUEST);

    const [exists] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `points_rule` WHERE `code` = ?',
      [code]
    );
    if (exists) throw new HttpException(`规则编码已存在: ${code}`, HttpStatus.BAD_REQUEST);

    await this.dataSource.query(
      'INSERT INTO `points_rule` (`name`, `code`, `points`, `points_per_amount`, `enabled`, `sort_order`, `remark`) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        name,
        code,
        Math.round(Number(data.points) || 0),
        Math.max(0, Number(data.pointsPerAmount) || 0),
        data.enabled === 0 ? 0 : 1,
        Math.max(0, Math.round(Number(data.sortOrder) || 0)),
        (data.remark || '').slice(0, 200)
      ]
    );
    this.writeLog({
      action: '新增积分规则',
      path: '/api/member/points-rules/create',
      operator,
      operatorId,
      detail: `code=${code} name=${name}`
    });
    return { success: true };
  }

  /** 更新积分规则 */
  async updatePointsRule(id: number, data: PointsRuleUpsertData, operator: string, operatorId: number | null) {
    const [rule] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `points_rule` WHERE `id` = ?',
      [id]
    );
    if (!rule) throw new HttpException('积分规则不存在', HttpStatus.NOT_FOUND);

    if (data.name !== undefined && !(data.name || '').trim()) {
      throw new HttpException('规则名称不能为空', HttpStatus.BAD_REQUEST);
    }
    if (data.code !== undefined) {
      const code = (data.code || '').trim();
      if (!code) throw new HttpException('规则编码不能为空', HttpStatus.BAD_REQUEST);
      const [exists] = await this.dataSource.query<{ id: number }[]>(
        'SELECT `id` FROM `points_rule` WHERE `code` = ? AND `id` != ?',
        [code, id]
      );
      if (exists) throw new HttpException(`规则编码已存在: ${code}`, HttpStatus.BAD_REQUEST);
    }

    const fields: string[] = [];
    const values: QueryValues = [];
    if (data.name !== undefined) { fields.push('`name` = ?'); values.push((data.name || '').trim()); }
    if (data.code !== undefined) { fields.push('`code` = ?'); values.push((data.code || '').trim()); }
    if (data.points !== undefined) { fields.push('`points` = ?'); values.push(Math.round(Number(data.points) || 0)); }
    if (data.pointsPerAmount !== undefined) { fields.push('`points_per_amount` = ?'); values.push(Math.max(0, Number(data.pointsPerAmount) || 0)); }
    if (data.enabled !== undefined) { fields.push('`enabled` = ?'); values.push(data.enabled === 0 ? 0 : 1); }
    if (data.sortOrder !== undefined) { fields.push('`sort_order` = ?'); values.push(Math.max(0, Math.round(Number(data.sortOrder) || 0))); }
    if (data.remark !== undefined) { fields.push('`remark` = ?'); values.push(String(data.remark || '').slice(0, 200)); }

    if (fields.length === 0) throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);

    values.push(id);
    await this.dataSource.query(`UPDATE \`points_rule\` SET ${fields.join(', ')} WHERE \`id\` = ?`, values);
    this.writeLog({
      action: '编辑积分规则',
      path: `/api/member/points-rules/update/${id}`,
      operator,
      operatorId,
      detail: `rule=${id} fields=${fields.length}`
    });
    return { success: true };
  }

  /** 删除积分规则 */
  async deletePointsRule(id: number, operator: string, operatorId: number | null) {
    const [rule] = await this.dataSource.query<{ id: number; name: string }[]>(
      'SELECT `id`, `name` FROM `points_rule` WHERE `id` = ?',
      [id]
    );
    if (!rule) throw new HttpException('积分规则不存在', HttpStatus.NOT_FOUND);

    await this.dataSource.query('DELETE FROM `points_rule` WHERE `id` = ?', [id]);
    this.writeLog({
      action: '删除积分规则',
      path: `/api/member/points-rules/delete/${id}`,
      operator,
      operatorId,
      detail: `rule=${id} name=${rule.name}`
    });
    return { success: true };
  }

  // ==================== 积分变动记录 ====================

  /** 积分变动记录分页列表 */
  async getPointsRecordList(params: {
    page: number;
    pageSize: number;
    memberId?: number;
    bizType?: string;
    keyword?: string;
  }) {
    const { page, pageSize, memberId, bizType, keyword } = params;
    const offset = (page - 1) * pageSize;
    const where: string[] = [];
    const values: QueryValues = [];

    if (memberId && memberId > 0) {
      where.push('pr.`member_id` = ?');
      values.push(memberId);
    }
    if (bizType && POINTS_BIZ_TYPES.includes(bizType)) {
      where.push('pr.`biz_type` = ?');
      values.push(bizType);
    }
    if (keyword) {
      where.push('(m.`name` LIKE ? OR m.`member_no` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`points_record\` pr LEFT JOIN \`member\` m ON m.\`id\` = pr.\`member_id\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<PointsRecordRow[]>(
      `SELECT pr.\`id\`, pr.\`member_id\`, COALESCE(m.\`name\`, '(已删除)') AS \`member_name\`,
              COALESCE(m.\`member_no\`, '') AS \`member_no\`,
              pr.\`change_points\`, pr.\`balance_points\`, pr.\`biz_type\`, pr.\`source_id\`,
              pr.\`remark\`, pr.\`operator\`, pr.\`create_time\`
       FROM \`points_record\` pr
       LEFT JOIN \`member\` m ON m.\`id\` = pr.\`member_id\`
       ${whereClause}
       ORDER BY pr.\`id\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return {
      list: list.map((row) => this.mapPointsRecord(row)),
      total,
      page,
      pageSize
    };
  }

  /** 人工调整会员积分（变动记录 + 等级联动） */
  async adjustPoints(data: PointsAdjustData, operator: string, operatorId: number | null) {
    if (!data.memberId || data.memberId <= 0) {
      throw new HttpException('缺少会员ID', HttpStatus.BAD_REQUEST);
    }
    const changePoints = Math.round(Number(data.changePoints));
    if (!Number.isFinite(changePoints) || changePoints === 0) {
      throw new HttpException('调整积分不能为 0', HttpStatus.BAD_REQUEST);
    }
    if (Math.abs(changePoints) > 1_000_000) {
      throw new HttpException('单次调整积分过大', HttpStatus.BAD_REQUEST);
    }

    const [member] = await this.dataSource.query<{ id: number; points: number }[]>(
      'SELECT `id`, `points` FROM `member` WHERE `id` = ?',
      [data.memberId]
    );
    if (!member) throw new HttpException('会员不存在', HttpStatus.NOT_FOUND);

    const newPoints = member.points + changePoints;
    if (newPoints < 0) {
      throw new HttpException('调整后积分不能为负数', HttpStatus.BAD_REQUEST);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query('UPDATE `member` SET `points` = ? WHERE `id` = ?', [newPoints, member.id]);
      await queryRunner.query(
        'INSERT INTO `points_record` (`member_id`, `change_points`, `balance_points`, `biz_type`, `source_id`, `remark`, `operator`) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [member.id, changePoints, newPoints, 'adjust', '', (data.remark || '').slice(0, 500), operator]
      );
      await this.recalcLevelTx(queryRunner, String(member.id), newPoints, undefined);
      await queryRunner.commitTransaction();

      this.writeLog({
        action: '调整会员积分',
        path: '/api/member/points/adjust',
        operator,
        operatorId,
        detail: `member=${member.id} change=${changePoints} balance=${newPoints}`
      });
      return { success: true, balancePoints: newPoints };
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== 消费记录 ====================

  /** 消费记录分页列表 */
  async getConsumeList(params: {
    page: number;
    pageSize: number;
    memberId?: number;
    consumeType?: string;
    status?: number;
    keyword?: string;
    startTime?: string;
    endTime?: string;
  }) {
    const { page, pageSize, memberId, consumeType, status, keyword, startTime, endTime } = params;
    const offset = (page - 1) * pageSize;
    const where: string[] = [];
    const values: QueryValues = [];

    if (memberId && memberId > 0) {
      where.push('c.`member_id` = ?');
      values.push(memberId);
    }
    if (consumeType && CONSUME_TYPES.includes(consumeType)) {
      where.push('c.`consume_type` = ?');
      values.push(consumeType);
    }
    if (status !== undefined && status !== null) {
      where.push('c.`status` = ?');
      values.push(status);
    }
    if (keyword) {
      where.push('(c.`order_no` LIKE ? OR m.`name` LIKE ? OR m.`member_no` LIKE ? OR m.`phone` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (startTime) {
      where.push('c.`pay_time` >= ?');
      values.push(startTime);
    }
    if (endTime) {
      where.push('c.`pay_time` < DATE_ADD(?, INTERVAL 1 DAY)');
      values.push(endTime);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`member_consume\` c LEFT JOIN \`member\` m ON m.\`id\` = c.\`member_id\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<ConsumeRow[]>(
      `SELECT c.\`id\`, c.\`order_no\`, c.\`member_id\`, COALESCE(m.\`name\`, '(已删除)') AS \`member_name\`,
              COALESCE(m.\`member_no\`, '') AS \`member_no\`,
              c.\`consume_type\`, c.\`amount\`, c.\`points_gained\`, c.\`pay_time\`, c.\`status\`, c.\`operator\`, c.\`remark\`, c.\`create_time\`
       FROM \`member_consume\` c
       LEFT JOIN \`member\` m ON m.\`id\` = c.\`member_id\`
       ${whereClause}
       ORDER BY c.\`id\` DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return {
      list: list.map((row) => this.mapConsume(row)),
      total,
      page,
      pageSize
    };
  }

  /** 新增消费记录（事务：入账 + 积分 + 等级联动） */
  async createConsume(data: ConsumeCreateData, operator: string, operatorId: number | null) {
    if (!data.memberId || data.memberId <= 0) {
      throw new HttpException('缺少会员ID', HttpStatus.BAD_REQUEST);
    }
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpException('消费金额必须大于 0', HttpStatus.BAD_REQUEST);
    }
    if (amount > 99_999_999.99) {
      throw new HttpException('消费金额超出上限', HttpStatus.BAD_REQUEST);
    }

    const orderNo = (data.orderNo || '').trim();
    if (orderNo.length > 64) {
      throw new HttpException('订单号不能超过 64 个字符', HttpStatus.BAD_REQUEST);
    }
    if (orderNo) {
      const [exists] = await this.dataSource.query<{ id: number }[]>(
        'SELECT `id` FROM `member_consume` WHERE `order_no` = ?',
        [orderNo]
      );
      if (exists) throw new HttpException('订单号已存在', HttpStatus.BAD_REQUEST);
    }

    const [member] = await this.dataSource.query<{ id: number; points: number }[]>(
      'SELECT `id`, `points` FROM `member` WHERE `id` = ?',
      [data.memberId]
    );
    if (!member) throw new HttpException('会员不存在', HttpStatus.NOT_FOUND);

    const consumeType = data.consumeType && CONSUME_TYPES.includes(data.consumeType) ? data.consumeType : 'other';
    const pointsGained = await this.calcConsumePoints(amount);
    const payTime = this.normalizeDateTime(data.payTime);
    const finalOrderNo = orderNo || this.generateOrderNo();
    const newPoints = member.points + pointsGained;
    const newTotal = Math.round(amount * 100) / 100;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        'INSERT INTO `member_consume` (`order_no`, `member_id`, `consume_type`, `amount`, `points_gained`, `pay_time`, `status`, `operator`, `remark`) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)',
        [finalOrderNo, member.id, consumeType, newTotal, pointsGained, payTime, operator, (data.remark || '').slice(0, 500)]
      );

      await queryRunner.query(
        'UPDATE `member` SET `total_consume` = `total_consume` + ?, `consume_count` = `consume_count` + 1, `points` = ? WHERE `id` = ?',
        [newTotal, newPoints, member.id]
      );

      if (pointsGained > 0) {
        await queryRunner.query(
          'INSERT INTO `points_record` (`member_id`, `change_points`, `balance_points`, `biz_type`, `source_id`, `remark`, `operator`) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [member.id, pointsGained, newPoints, 'consume', finalOrderNo, `消费入账 ${newTotal.toFixed(2)} 元`, operator]
        );
      }

      await this.recalcLevelTx(queryRunner, String(member.id), newPoints, undefined);
      await queryRunner.commitTransaction();

      this.writeLog({
        action: '新增消费记录',
        path: '/api/member/consume/create',
        operator,
        operatorId,
        detail: `member=${member.id} orderNo=${finalOrderNo} amount=${newTotal} points=${pointsGained}`
      });
      return { success: true, orderNo: finalOrderNo, pointsGained };
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /** 作废消费记录（事务：回冲累计金额与积分，写 refund 积分记录） */
  async deleteConsume(id: number, operator: string, operatorId: number | null) {
    const [consume] = await this.dataSource.query<{
      id: number;
      member_id: number;
      amount: string | number;
      points_gained: number;
      status: number;
      order_no: string;
    }[]>(
      'SELECT `id`, `member_id`, `amount`, `points_gained`, `status`, `order_no` FROM `member_consume` WHERE `id` = ?',
      [id]
    );
    if (!consume) throw new HttpException('消费记录不存在', HttpStatus.NOT_FOUND);
    if (consume.status !== 1) {
      throw new HttpException('该消费记录已作废', HttpStatus.BAD_REQUEST);
    }

    const [member] = await this.dataSource.query<{ id: number; points: number }[]>(
      'SELECT `id`, `points` FROM `member` WHERE `id` = ?',
      [consume.member_id]
    );
    if (!member) throw new HttpException('关联会员不存在', HttpStatus.NOT_FOUND);

    const amount = Number(consume.amount) || 0;
    // 回冲积分不超过当前余额，避免负数
    const deductPoints = Math.min(consume.points_gained, member.points);
    const newPoints = member.points - deductPoints;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query('UPDATE `member_consume` SET `status` = 0 WHERE `id` = ?', [id]);
      await queryRunner.query(
        'UPDATE `member` SET `total_consume` = GREATEST(`total_consume` - ?, 0), `consume_count` = GREATEST(`consume_count` - 1, 0), `points` = ? WHERE `id` = ?',
        [amount, newPoints, member.id]
      );

      if (deductPoints > 0) {
        await queryRunner.query(
          'INSERT INTO `points_record` (`member_id`, `change_points`, `balance_points`, `biz_type`, `source_id`, `remark`, `operator`) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [member.id, -deductPoints, newPoints, 'refund', consume.order_no, `作废消费回扣积分（单号 ${consume.order_no}）`, operator]
        );
      }

      await this.recalcLevelTx(queryRunner, String(member.id), newPoints, undefined);
      await queryRunner.commitTransaction();

      this.writeLog({
        action: '作废消费记录',
        path: `/api/member/consume/delete/${id}`,
        operator,
        operatorId,
        detail: `consume=${id} orderNo=${consume.order_no} amount=${amount} refundPoints=${deductPoints}`
      });
      return { success: true };
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      throw new HttpException(this.errMsg(err), HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== 统计 ====================

  /** 统计总览（会员规模/消费/积分/等级分布/类型分布） */
  async getStatsOverview(): Promise<MemberStatsOverview> {
    const [[memberAgg], [consumeAgg], [monthAgg], levelRows, typeRows] = await Promise.all([
      this.dataSource.query<{ total: number; active: number; points: number }[]>(
        'SELECT COUNT(*) AS `total`, SUM(CASE WHEN `status` = 1 THEN 1 ELSE 0 END) AS `active`, COALESCE(SUM(`points`), 0) AS `points` FROM `member`'
      ),
      this.dataSource.query<{ amount: string | number }[]>(
        'SELECT COALESCE(SUM(`amount`), 0) AS `amount` FROM `member_consume` WHERE `status` = 1'
      ),
      this.dataSource.query<{ amount: string | number }[]>(
        `SELECT COALESCE(SUM(\`amount\`), 0) AS \`amount\` FROM \`member_consume\`
         WHERE \`status\` = 1 AND \`pay_time\` >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`
      ),
      this.dataSource.query<{ level_id: number; level_name: string; count: number }[]>(
        `SELECT COALESCE(m.\`level_id\`, 0) AS \`level_id\`, COALESCE(l.\`name\`, '未分配') AS \`level_name\`, COUNT(*) AS \`count\`
         FROM \`member\` m LEFT JOIN \`member_level\` l ON l.\`id\` = m.\`level_id\`
         WHERE m.\`status\` = 1 GROUP BY m.\`level_id\`, l.\`name\` ORDER BY COUNT(*) DESC`
      ),
      this.dataSource.query<{ consume_type: string; count: number; amount: string | number }[]>(
        `SELECT \`consume_type\`, COUNT(*) AS \`count\`, COALESCE(SUM(\`amount\`), 0) AS \`amount\`
         FROM \`member_consume\` WHERE \`status\` = 1 GROUP BY \`consume_type\` ORDER BY \`amount\` DESC`
      )
    ]);

    return {
      memberCount: Number(memberAgg?.total) || 0,
      activeCount: Number(memberAgg?.active) || 0,
      totalConsume: Number(consumeAgg?.amount) || 0,
      monthConsume: Number(monthAgg?.amount) || 0,
      totalPoints: Number(memberAgg?.points) || 0,
      levelDistribution: (levelRows || []).map((r) => ({
        levelId: Number(r.level_id) || 0,
        levelName: r.level_name,
        count: Number(r.count) || 0
      })),
      typeDistribution: (typeRows || []).map((r) => ({
        consumeType: r.consume_type,
        count: Number(r.count) || 0,
        amount: Number(r.amount) || 0
      }))
    };
  }

  /** 消费趋势（近 N 个月，含月度总额与笔数） */
  async getConsumeTrend(months: number): Promise<ConsumeTrendItem[]> {
    const n = Math.min(Math.max(months || 6, 1), 24);
    const rows = await this.dataSource.query<{ month: string; amount: string | number; count: number }[]>(
      `SELECT DATE_FORMAT(\`pay_time\`, '%Y-%m') AS \`month\`, COALESCE(SUM(\`amount\`), 0) AS \`amount\`, COUNT(*) AS \`count\`
       FROM \`member_consume\`
       WHERE \`status\` = 1 AND \`pay_time\` >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ? MONTH), '%Y-%m-01')
       GROUP BY DATE_FORMAT(\`pay_time\`, '%Y-%m')`,
      [n - 1]
    );

    // 补齐缺月，保证前端曲线连续
    const map = new Map<string, ConsumeTrendItem>();
    for (const r of rows) {
      map.set(r.month, { month: r.month, amount: Number(r.amount) || 0, count: Number(r.count) || 0 });
    }
    const result: ConsumeTrendItem[] = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      result.push(map.get(key) || { month: key, amount: 0, count: 0 });
    }
    return result;
  }

  // ==================== Excel 导出 ====================

  /** 导出会员信息 Excel（按当前筛选条件全量导出） */
  async buildMemberExport(params: { keyword?: string; levelId?: number; status?: number }): Promise<Buffer> {
    const { keyword, levelId, status } = params;
    const where: string[] = [];
    const values: QueryValues = [];

    if (keyword) {
      where.push('(m.`name` LIKE ? OR m.`member_no` LIKE ? OR m.`phone` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (levelId && levelId > 0) {
      where.push('m.`level_id` = ?');
      values.push(levelId);
    }
    if (status !== undefined && status !== null) {
      where.push('m.`status` = ?');
      values.push(status);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const rows = await this.dataSource.query<MemberRow[]>(
      `SELECT m.\`member_no\`, m.\`name\`, m.\`phone\`, m.\`gender\`, m.\`birthday\`,
              COALESCE(l.\`name\`, '') AS \`level_name\`, m.\`points\`, m.\`total_consume\`, m.\`consume_count\`,
              m.\`status\`, m.\`remark\`, m.\`create_time\`
       FROM \`member\` m LEFT JOIN \`member_level\` l ON l.\`id\` = m.\`level_id\`
       ${whereClause} ORDER BY m.\`id\` DESC`,
      values
    );

    const sheetRows = rows.map((r) => ({
      会员编号: r.member_no,
      姓名: r.name,
      手机号: r.phone || '',
      性别: this.genderLabel(r.gender),
      生日: this.formatDate(r.birthday),
      等级: r.level_name,
      当前积分: Number(r.points) || 0,
      '累计消费(元)': Number(r.total_consume) || 0,
      消费次数: Number(r.consume_count) || 0,
      状态: r.status === 1 ? '正常' : '停用',
      备注: r.remark,
      注册时间: this.formatDateTime(r.create_time)
    }));

    return this.buildWorkbook('会员信息', sheetRows, [
      { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 12 },
      { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 8 },
      { wch: 20 }, { wch: 20 }
    ]);
  }

  /** 导出消费记录 Excel（按当前筛选条件全量导出） */
  async buildConsumeExport(params: {
    memberId?: number;
    consumeType?: string;
    status?: number;
    keyword?: string;
    startTime?: string;
    endTime?: string;
  }): Promise<Buffer> {
    const { memberId, consumeType, status, keyword, startTime, endTime } = params;
    const where: string[] = [];
    const values: QueryValues = [];

    if (memberId && memberId > 0) {
      where.push('c.`member_id` = ?');
      values.push(memberId);
    }
    if (consumeType && CONSUME_TYPES.includes(consumeType)) {
      where.push('c.`consume_type` = ?');
      values.push(consumeType);
    }
    if (status !== undefined && status !== null) {
      where.push('c.`status` = ?');
      values.push(status);
    }
    if (keyword) {
      where.push('(c.`order_no` LIKE ? OR m.`name` LIKE ? OR m.`member_no` LIKE ? OR m.`phone` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (startTime) {
      where.push('c.`pay_time` >= ?');
      values.push(startTime);
    }
    if (endTime) {
      where.push('c.`pay_time` < DATE_ADD(?, INTERVAL 1 DAY)');
      values.push(endTime);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const rows = await this.dataSource.query<ConsumeRow[]>(
      `SELECT c.\`order_no\`, COALESCE(m.\`name\`, '(已删除)') AS \`member_name\`, COALESCE(m.\`member_no\`, '') AS \`member_no\`,
              COALESCE(m.\`phone\`, '') AS \`phone\`, c.\`consume_type\`, c.\`amount\`, c.\`points_gained\`, c.\`pay_time\`,
              c.\`status\`, c.\`operator\`, c.\`remark\`, c.\`create_time\`
       FROM \`member_consume\` c LEFT JOIN \`member\` m ON m.\`id\` = c.\`member_id\`
       ${whereClause} ORDER BY c.\`id\` DESC`,
      values
    );

    const sheetRows = rows.map((r) => ({
      订单号: r.order_no,
      会员编号: r.member_no,
      会员姓名: r.member_name,
      手机号: (r as unknown as { phone: string }).phone || '',
      消费类型: this.consumeTypeLabel(r.consume_type),
      '金额(元)': Number(r.amount) || 0,
      获得积分: Number(r.points_gained) || 0,
      消费时间: this.formatDateTime(r.pay_time),
      状态: r.status === 1 ? '正常' : '已作废',
      录入人: r.operator,
      备注: r.remark
    }));

    return this.buildWorkbook('消费记录', sheetRows, [
      { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 10 },
      { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 20 }
    ]);
  }

  // ==================== 内部工具 ====================

  /** 生成会员编号 M + 日期 + 时间戳 + 随机数（唯一性冲突时重试） */
  private async generateMemberNo(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const no = `M${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${String(Date.now()).slice(-6)}${String(Math.floor(Math.random() * 90) + 10)}`;
      const [exists] = await this.dataSource.query<{ id: number }[]>(
        'SELECT `id` FROM `member` WHERE `member_no` = ?',
        [no]
      );
      if (!exists) return no;
    }
    throw new HttpException('会员编号生成失败，请重试', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  /** 生成消费订单号（未填时自动生成） */
  private generateOrderNo(): string {
    return `C${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${String(Date.now()).slice(-8)}${String(Math.floor(Math.random() * 90) + 10)}`;
  }

  /** 默认等级（启用的最低排序等级） */
  private async getDefaultLevelId(): Promise<number> {
    const [level] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `member_level` WHERE `status` = 1 ORDER BY `sort_order` ASC, `id` ASC LIMIT 1'
    );
    return level?.id ?? 0;
  }

  /** 按积分自动匹配等级（取 points_min 不超过积分且区间匹配的最高档；显式指定等级时优先） */
  private async recalcLevelTx(
    executor: { query: <T>(sql: string, params?: unknown[]) => Promise<T> },
    memberRef: string,
    points: number,
    fallbackLevelId?: number
  ): Promise<number> {
    const levels = await executor.query<{ id: number; points_min: number; points_max: number }[]>(
      'SELECT `id`, `points_min`, `points_max` FROM `member_level` WHERE `status` = 1 ORDER BY `points_min` DESC'
    );
    let levelId = fallbackLevelId ?? 0;
    if (!levelId || levelId <= 0) {
      for (const lv of levels) {
        if (points >= lv.points_min && (lv.points_max === 0 || points <= lv.points_max)) {
          levelId = lv.id;
          break;
        }
      }
    }
    if (levelId && levelId > 0) {
      await executor.query('UPDATE `member` SET `level_id` = ? WHERE `id` = ?', [levelId, memberRef]);
    }
    return levelId;
  }

  /** 消费积分计算：按启用的消费规则倍率取整 */
  private async calcConsumePoints(amount: number): Promise<number> {
    const [rule] = await this.dataSource.query<{ points_per_amount: string | number }[]>(
      "SELECT `points_per_amount` FROM `points_rule` WHERE `code` = 'consume' AND `enabled` = 1 LIMIT 1"
    );
    const rate = Number(rule?.points_per_amount) || 0;
    return Math.floor(amount * rate);
  }

  /** 规则固定积分（启用时返回，否则 0） */
  private async getRulePoints(code: string): Promise<number> {
    const [rule] = await this.dataSource.query<{ points: number }[]>(
      'SELECT `points` FROM `points_rule` WHERE `code` = ? AND `enabled` = 1 LIMIT 1',
      [code]
    );
    return Math.round(Number(rule?.points) || 0);
  }

  /** 手机号归一化：空串/null → null */
  private normalizePhone(phone?: string | null): string | null {
    const p = (phone ?? '').trim();
    return p === '' ? null : p;
  }

  /** 性别校验 */
  private sanitizeGender(gender?: number): number {
    return GENDER_VALUES.includes(Number(gender)) ? Number(gender) : 0;
  }

  /** 折扣率校验（0-1） */
  private sanitizeDiscount(rate?: number): number {
    const r = Number(rate);
    if (!Number.isFinite(r)) return 1;
    if (r < 0) return 0;
    if (r > 1) return 1;
    return Math.round(r * 100) / 100;
  }

  /** 日期归一化（无效值 → null） */
  private normalizeDate(date?: string | null): string | null {
    if (!date) return null;
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  /** 日期时间归一化（无效值 → null） */
  private normalizeDateTime(dateTime?: string | null): string | null {
    if (!dateTime) return null;
    const d = new Date(dateTime);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
  }

  /** 构建 xlsx 工作簿 Buffer */
  private buildWorkbook(sheetName: string, rows: Record<string, unknown>[], cols?: XLSX.ColInfo[]): Buffer {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    if (cols) ws['!cols'] = cols;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // ==================== 行映射与文案 ====================

  private mapMember(row: MemberRow) {
    return {
      id: row.id,
      memberNo: row.member_no,
      name: row.name,
      phone: row.phone || '',
      gender: Number(row.gender) || 0,
      birthday: row.birthday ?? null,
      levelId: row.level_id,
      levelName: row.level_name || '',
      points: Number(row.points) || 0,
      totalConsume: Number(row.total_consume) || 0,
      consumeCount: Number(row.consume_count) || 0,
      status: Number(row.status) || 0,
      remark: row.remark || '',
      createTime: row.create_time,
      updateTime: row.update_time
    };
  }

  private mapLevel(row: LevelRow) {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      pointsMin: Number(row.points_min) || 0,
      pointsMax: Number(row.points_max) || 0,
      discountRate: Number(row.discount_rate) || 1,
      sortOrder: row.sort_order,
      status: Number(row.status) || 0,
      remark: row.remark || '',
      createTime: row.create_time,
      updateTime: row.update_time
    };
  }

  private mapRule(row: PointsRuleRow) {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      points: Number(row.points) || 0,
      pointsPerAmount: Number(row.points_per_amount) || 0,
      enabled: Number(row.enabled) || 0,
      sortOrder: row.sort_order,
      remark: row.remark || '',
      createTime: row.create_time,
      updateTime: row.update_time
    };
  }

  private mapPointsRecord(row: PointsRecordRow) {
    return {
      id: row.id,
      memberId: row.member_id,
      memberName: row.member_name,
      memberNo: row.member_no,
      changePoints: Number(row.change_points) || 0,
      balancePoints: Number(row.balance_points) || 0,
      bizType: row.biz_type || '',
      sourceId: row.source_id || '',
      remark: row.remark || '',
      operator: row.operator || '',
      createTime: row.create_time
    };
  }

  private mapConsume(row: ConsumeRow) {
    return {
      id: row.id,
      orderNo: row.order_no,
      memberId: row.member_id,
      memberName: row.member_name,
      memberNo: row.member_no,
      consumeType: row.consume_type || 'other',
      amount: Number(row.amount) || 0,
      pointsGained: Number(row.points_gained) || 0,
      payTime: row.pay_time,
      status: Number(row.status) || 0,
      operator: row.operator || '',
      remark: row.remark || '',
      createTime: row.create_time
    };
  }

  private genderLabel(gender: number): string {
    if (gender === 1) return '男';
    if (gender === 2) return '女';
    return '未知';
  }

  private consumeTypeLabel(type: string): string {
    const map: Record<string, string> = {
      goods: '商品',
      service: '服务',
      recharge: '充值',
      membership: '会员续费',
      other: '其他'
    };
    return map[type] || type || '其他';
  }

  private formatDate(value: Date | string | null | undefined): string {
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  private formatDateTime(value: Date | string | null | undefined): string {
    if (!value) return '';
    return String(value).slice(0, 19).replace('T', ' ');
  }

  /** 管理后台操作日志统一记录（fire-and-forget） */
  private writeLog(params: OpLogParams) {
    void this.systemLogService.write({
      logType: 'operation',
      module: 'member',
      action: params.action,
      method: 'POST',
      path: params.path,
      operator: params.operator,
      operatorId: params.operatorId,
      success: true,
      detail: params.detail
    });
  }

  private errMsg(err: unknown): string {
    if (err instanceof HttpException) {
      return err.message;
    }
    if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
      return err.message;
    }
    return '操作失败';
  }
}
