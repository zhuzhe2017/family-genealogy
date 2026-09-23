import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type FundRow,
  type FundMemberRow,
  type FundTxRow,
  type RankTotalRow,
  type RankLatestRow,
  type FundCreateData,
  type FundUpdateData,
  type FundOpData,
  type FundMemberData,
  type FundApproveData,
  type FundDissolveData,
  TX_TYPE,
  TX_STATUS,
  FUND_PERMS,
  DEFAULT_PERMS,
  ROLE_LABELS,
  TX_TYPE_LABELS,
  PAYMENT_LABELS,
  type FundPerm
} from './types/fund.types';
import { type PaginationResult } from '../common/types/common';

/**
 * 家族基金用户端服务
 * - 个人子账户模型：fund.total_amount 为公共池，fund_member.balance 为个人净余额
 *   存入 → 公共池+个人+；取出 → 公共池-个人-；成员间转账 → 仅个人余额转移，公共池不变
 * - 经济平衡：单次/每日/每月限额（存入与取出分别计数），大额取出需审批（approve 权限）
 * - 权限体系：族长(leader)=基金创建者/家族创建者/家族管理员；admin/member 由族长在成员管理分配
 * - 并发安全：所有资金操作在事务内 SELECT ... FOR UPDATE 锁基金行
 */
@Injectable()
export class FundService {
  constructor(private readonly dataSource: DataSource) {}

  // ==================== 查询 ====================

  /** 基金信息 + 我的角色/权限（无基金时返回 hasFund=false） */
  async getInfo(userId: string, familyId: number) {
    this.requireFamilyId(familyId);
    const fund = await this.getFund(familyId);
    if (!fund) {
      return { hasFund: false, fund: null, myRole: '', roleLabel: '', permissions: [], isLeader: false };
    }
    const [isMember, isLeader] = await Promise.all([
      this.isFamilyMember(userId, familyId),
      this.isFundLeader(userId, fund)
    ]);
    if (!isMember) {
      throw new HttpException('您不属于该家族，无权查看', HttpStatus.FORBIDDEN);
    }
    const member = await this.getFundMember(fund.id, userId);
    const perms = this.memberPerms(fund, isLeader, member);
    return {
      hasFund: true,
      fund: this.toFund(fund),
      myRole: isLeader ? 'leader' : (member?.role || 'member'),
      roleLabel: ROLE_LABELS[isLeader ? 'leader' : (member?.role || 'member')] || '成员',
      permissions: perms,
      isLeader,
      myBalance: this.num(member?.balance || 0)
    };
  }

  /** 成员列表（需 view_all 权限，否则仅本人） */
  async getMembers(userId: string, familyId: number) {
    this.requireFamilyId(familyId);
    const fund = await this.requireFund(familyId, userId);
    // 查看全部：需 view_all 权限；有转账权限时也可见成员列表（用于选择转账接收人）
    const canViewAll =
      (await this.hasPerm(userId, fund, FUND_PERMS.viewAll)) ||
      (await this.hasPerm(userId, fund, FUND_PERMS.transfer));
    const rows = await this.dataSource.query<FundMemberRow[]>(
      `SELECT m.*, u.\`nickname\`, u.\`avatar_url\`
       FROM \`family_fund_member\` m
       LEFT JOIN \`user\` u ON u.\`id\` = m.\`user_id\`
       WHERE m.\`fund_id\` = ? AND m.\`status\` = 1
       ${canViewAll ? '' : 'AND m.`user_id` = ?'}
       ORDER BY FIELD(m.\`role\`, 'leader', 'admin', 'member'), m.\`id\` ASC`,
      canViewAll ? [fund.id] : [fund.id, userId]
    );
    return {
      list: rows.map((r) => this.toMember(r)),
      total: rows.length
    };
  }

  /** 交易明细分页（view_all 可见全部，否则仅本人相关） */
  async getTransactions(
    userId: string,
    familyId: number,
    params: {
      page?: number;
      pageSize?: number;
      type?: string;
      status?: number;
      userId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<PaginationResult<Record<string, unknown>> & { income: number; expense: number }> {
    this.requireFamilyId(familyId);
    const fund = await this.requireFund(familyId, userId);
    const canViewAll = await this.hasPerm(userId, fund, FUND_PERMS.viewAll);
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 10));
    const where: string[] = ['t.`fund_id` = ?'];
    const args: unknown[] = [fund.id];

    if (!canViewAll) {
      where.push('(t.`operator_user_id` = ? OR t.`target_user_id` = ?)');
      args.push(userId, userId);
    }
    if (params.type) {
      where.push('t.`type` = ?');
      args.push(params.type);
    }
    if (params.status !== undefined && params.status !== null) {
      where.push('t.`status` = ?');
      args.push(Number(params.status));
    }
    if (params.userId) {
      where.push('(t.`operator_user_id` = ? OR t.`target_user_id` = ?)');
      args.push(params.userId, params.userId);
    }
    if (params.startDate) {
      where.push('t.`create_time` >= ?');
      args.push(`${params.startDate} 00:00:00`);
    }
    if (params.endDate) {
      where.push('t.`create_time` <= ?');
      args.push(`${params.endDate} 23:59:59`);
    }
    const whereSql = where.join(' AND ');

    const [[totalRow], [sumRow], rows] = await Promise.all([
      this.dataSource.query<{ cnt: number }[]>(
        `SELECT COUNT(*) AS cnt FROM \`family_fund_transaction\` t WHERE ${whereSql}`,
        args
      ),
      this.dataSource.query<{ income: string; expense: string }[]>(
        `SELECT
           COALESCE(SUM(CASE WHEN t.\`status\` = ${TX_STATUS.SUCCESS} AND t.\`direction\` = 1 THEN t.\`amount\` ELSE 0 END), 0) AS income,
           COALESCE(SUM(CASE WHEN t.\`status\` = ${TX_STATUS.SUCCESS} AND t.\`direction\` = -1 THEN t.\`amount\` ELSE 0 END), 0) AS expense
         FROM \`family_fund_transaction\` t WHERE ${whereSql}`,
        args
      ),
      this.dataSource.query<(FundTxRow & { operator_name?: string; target_name?: string })[]>(
        `SELECT t.*, u1.\`nickname\` AS \`operator_name\`, u2.\`nickname\` AS \`target_name\`
         FROM \`family_fund_transaction\` t
         LEFT JOIN \`user\` u1 ON u1.\`id\` = t.\`operator_user_id\`
         LEFT JOIN \`user\` u2 ON u2.\`id\` = t.\`target_user_id\`
         WHERE ${whereSql}
         ORDER BY t.\`id\` DESC
         LIMIT ? OFFSET ?`,
        [...args, pageSize, (page - 1) * pageSize]
      )
    ]);

    return {
      list: rows.map((r) => this.toTx(r)),
      total: Number(totalRow?.cnt || 0),
      page,
      pageSize,
      income: this.num(sumRow?.income || 0),
      expense: this.num(sumRow?.expense || 0)
    };
  }

  /** 慈善榜单：按成员成功存入金额聚合，返回捐赠者/累计金额/捐赠项目/最近捐赠时间 */
  async getRank(userId: string, familyId: number, limit = 10) {
    this.requireFamilyId(familyId);
    const fund = await this.requireFund(familyId, userId);
    const top = Math.min(20, Math.max(1, Number(limit) || 10));

    // 各捐赠者成功存入的总金额与次数（姓名优先取基金成员名，缺失回退用户昵称）
    const [totalRows, latestRows] = await Promise.all([
      this.dataSource.query<RankTotalRow[]>(
        `SELECT t.\`operator_user_id\` AS userId,
                COALESCE(fm.\`name\`, u.\`nickname\`) AS donorName,
                SUM(t.\`amount\`) AS totalAmount,
                COUNT(*) AS donationCount
         FROM \`family_fund_transaction\` t
         LEFT JOIN \`family_fund_member\` fm
           ON fm.\`fund_id\` = t.\`fund_id\` AND fm.\`user_id\` = t.\`operator_user_id\` AND fm.\`status\` = 1
         LEFT JOIN \`user\` u ON u.\`id\` = t.\`operator_user_id\`
         WHERE t.\`fund_id\` = ? AND t.\`type\` = 'deposit' AND t.\`status\` = ?
         GROUP BY t.\`operator_user_id\`, fm.\`name\`, u.\`nickname\`
         ORDER BY totalAmount DESC
         LIMIT ?`,
        [fund.id, TX_STATUS.SUCCESS, top]
      ),
      // 每位捐赠者最近一次成功存入的备注(捐赠项目)与时间
      this.dataSource.query<RankLatestRow[]>(
        `SELECT l.\`operator_user_id\` AS userId, l.\`remark\` AS project, l.\`create_time\` AS lastTime
         FROM \`family_fund_transaction\` l
         JOIN (
           SELECT \`operator_user_id\`, MAX(\`id\`) AS max_id
           FROM \`family_fund_transaction\`
           WHERE \`fund_id\` = ? AND \`type\` = 'deposit' AND \`status\` = ?
           GROUP BY \`operator_user_id\`
         ) m ON m.max_id = l.\`id\``,
        [fund.id, TX_STATUS.SUCCESS]
      )
    ]);

    const latestMap = new Map(latestRows.map(r => [r.userId, r]));
    const list = totalRows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      donorName: r.donorName || '匿名捐赠',
      totalAmount: this.num(r.totalAmount),
      donationCount: Number(r.donationCount),
      project: latestMap.get(r.userId)?.project || '家族基金捐赠',
      lastTime: latestMap.get(r.userId)?.lastTime || null
    }));
    return { list, total: list.length };
  }

  /** 统计：基金总额 + 今日/本月收支 + 我的余额与累计 */
  async getStats(userId: string, familyId: number) {
    this.requireFamilyId(familyId);
    const fund = await this.requireFund(familyId, userId);
    const member = await this.getFundMember(fund.id, userId);
    const [[todayRow], [monthRow], [myRow]] = await Promise.all([
      this.dataSource.query<{ income: string; expense: string }[]>(
        `SELECT
           COALESCE(SUM(CASE WHEN \`direction\` = 1 AND \`status\` = 1 THEN \`amount\` ELSE 0 END), 0) AS income,
           COALESCE(SUM(CASE WHEN \`direction\` = -1 AND \`status\` IN (1, 2) THEN \`amount\` ELSE 0 END), 0) AS expense
         FROM \`family_fund_transaction\`
         WHERE \`fund_id\` = ? AND DATE(\`create_time\`) = CURDATE()`,
        [fund.id]
      ),
      this.dataSource.query<{ income: string; expense: string }[]>(
        `SELECT
           COALESCE(SUM(CASE WHEN \`direction\` = 1 AND \`status\` = 1 THEN \`amount\` ELSE 0 END), 0) AS income,
           COALESCE(SUM(CASE WHEN \`direction\` = -1 AND \`status\` IN (1, 2) THEN \`amount\` ELSE 0 END), 0) AS expense
         FROM \`family_fund_transaction\`
         WHERE \`fund_id\` = ? AND DATE_FORMAT(\`create_time\`, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
        [fund.id]
      ),
      this.dataSource.query<{ deposit: string; withdraw: string; count: number }[]>(
        `SELECT
           COALESCE(SUM(CASE WHEN \`type\` = 'deposit' AND \`status\` = 1 THEN \`amount\` ELSE 0 END), 0) AS deposit,
           COALESCE(SUM(CASE WHEN \`type\` = 'withdraw' AND \`status\` = 1 THEN \`amount\` ELSE 0 END), 0) AS withdraw,
           COUNT(*) AS count
         FROM \`family_fund_transaction\`
         WHERE \`fund_id\` = ? AND \`operator_user_id\` = ?`,
        [fund.id, userId]
      )
    ]);
    const [pendingRow] = await this.dataSource.query<{ cnt: number }[]>(
      `SELECT COUNT(*) AS cnt FROM \`family_fund_transaction\`
       WHERE \`fund_id\` = ? AND \`status\` = ${TX_STATUS.PENDING}`,
      [fund.id]
    );
    return {
      totalAmount: this.num(fund.total_amount),
      todayIncome: this.num(todayRow?.income || 0),
      todayExpense: this.num(todayRow?.expense || 0),
      monthIncome: this.num(monthRow?.income || 0),
      monthExpense: this.num(monthRow?.expense || 0),
      myBalance: this.num(member?.balance || 0),
      myDeposit: this.num(myRow?.deposit || 0),
      myWithdraw: this.num(myRow?.withdraw || 0),
      myTxCount: Number(myRow?.count || 0),
      pendingCount: Number(pendingRow?.cnt || 0)
    };
  }

  // ==================== 创建 / 设置 / 解散 ====================

  /** 创建基金（每家族唯一），创建人自动成为族长 */
  async create(userId: string, familyId: number, data: FundCreateData) {
    this.requireFamilyId(familyId);
    if (!(await this.isFamilyMember(userId, familyId))) {
      throw new HttpException('您不属于该家族，无权操作', HttpStatus.FORBIDDEN);
    }
    if (await this.getFund(familyId)) {
      throw new HttpException('该家族已创建基金，每个家族仅限一个基金', HttpStatus.BAD_REQUEST);
    }
    const name = (data.name || '').trim();
    if (!name) {
      throw new HttpException('请填写基金名称', HttpStatus.BAD_REQUEST);
    }
    const initAmount = this.moneyOrZero(data.initAmount);
    const limits = this.normalizeLimits(data);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [exists] = await qr.query(
        'SELECT `id` FROM `family_fund` WHERE `family_id` = ? LIMIT 1 FOR UPDATE',
        [familyId]
      );
      if (exists) {
        throw new HttpException('该家族已创建基金，每个家族仅限一个基金', HttpStatus.BAD_REQUEST);
      }
      const [userRow] = await qr.query(
        'SELECT `nickname`, `member_id` FROM `user` WHERE `id` = ? LIMIT 1',
        [userId]
      );
      const result = await qr.query(
        `INSERT INTO \`family_fund\`
         (\`family_id\`, \`name\`, \`logo_url\`, \`description\`, \`total_amount\`,
          \`single_deposit_limit\`, \`single_withdraw_limit\`, \`daily_deposit_limit\`, \`daily_withdraw_limit\`,
          \`monthly_deposit_limit\`, \`monthly_withdraw_limit\`, \`withdraw_approval_threshold\`, \`need_approval\`,
          \`creator_user_id\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          familyId,
          name,
          (data.logoUrl || '').trim(),
          (data.description || '').trim(),
          initAmount,
          limits.singleDepositLimit,
          limits.singleWithdrawLimit,
          limits.dailyDepositLimit,
          limits.dailyWithdrawLimit,
          limits.monthlyDepositLimit,
          limits.monthlyWithdrawLimit,
          limits.withdrawApprovalThreshold,
          data.needApproval === 0 || data.needApproval === false ? 0 : 1,
          userId
        ]
      );
      const fundId = Number(result.insertId);
      // 创建人自动成为族长
      await qr.query(
        `INSERT INTO \`family_fund_member\`
         (\`fund_id\`, \`family_id\`, \`user_id\`, \`member_id\`, \`name\`, \`role\`, \`permissions\`, \`balance\`)
         VALUES (?, ?, ?, ?, ?, 'leader', ?, ?)`,
        [
          fundId,
          familyId,
          userId,
          (userRow?.member_id || '').trim(),
          (userRow?.nickname || '族长').trim(),
          JSON.stringify(DEFAULT_PERMS.leader),
          initAmount
        ]
      );
      // 初始资金流水
      if (initAmount > 0) {
        await qr.query(
          `INSERT INTO \`family_fund_transaction\`
           (\`fund_id\`, \`family_id\`, \`type\`, \`amount\`, \`direction\`, \`operator_user_id\`,
            \`payment_method\`, \`status\`, \`remark\`, \`balance_after\`)
           VALUES (?, ?, 'init', ?, 1, ?, 'cash', 1, '创建基金初始资金', ?)`,
          [fundId, familyId, initAmount, userId, initAmount]
        );
      }
      await qr.commitTransaction();
      return { id: fundId, totalAmount: initAmount };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /** 更新基本信息与限额规则（需 manage_rule 权限） */
  async updateSettings(userId: string, familyId: number, data: FundUpdateData) {
    this.requireFamilyId(familyId);
    const fund = await this.requireFund(familyId, userId);
    await this.requirePerm(userId, fund, FUND_PERMS.manageRule);
    const sets: string[] = [];
    const args: unknown[] = [];
    const push = (sql: string, val: unknown) => {
      sets.push(sql);
      args.push(val);
    };
    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new HttpException('基金名称不能为空', HttpStatus.BAD_REQUEST);
      push('`name` = ?', name);
    }
    if (data.logoUrl !== undefined) push('`logo_url` = ?', String(data.logoUrl).trim());
    if (data.description !== undefined) push('`description` = ?', String(data.description).trim());
    if (data.needApproval !== undefined) push('`need_approval` = ?', data.needApproval === 0 || data.needApproval === false ? 0 : 1);

    const limits = this.normalizeLimits(data);
    if (limits.singleDepositLimit) push('`single_deposit_limit` = ?', limits.singleDepositLimit);
    if (limits.singleWithdrawLimit) push('`single_withdraw_limit` = ?', limits.singleWithdrawLimit);
    if (limits.dailyDepositLimit) push('`daily_deposit_limit` = ?', limits.dailyDepositLimit);
    if (limits.dailyWithdrawLimit) push('`daily_withdraw_limit` = ?', limits.dailyWithdrawLimit);
    if (limits.monthlyDepositLimit) push('`monthly_deposit_limit` = ?', limits.monthlyDepositLimit);
    if (limits.monthlyWithdrawLimit) push('`monthly_withdraw_limit` = ?', limits.monthlyWithdrawLimit);
    if (limits.withdrawApprovalThreshold) push('`withdraw_approval_threshold` = ?', limits.withdrawApprovalThreshold);

    if (sets.length === 0) {
      return { updated: false };
    }
    await this.dataSource.query(
      `UPDATE \`family_fund\` SET ${sets.join(', ')} WHERE \`id\` = ?`,
      [...args, fund.id]
    );
    return { updated: true };
  }

  /** 解散基金（需 dissolve 权限，且公共池余额必须为 0） */
  async dissolve(userId: string, familyId: number, data: FundDissolveData) {
    this.requireFamilyId(familyId);
    const fund = await this.requireFund(familyId, userId);
    await this.requirePerm(userId, fund, FUND_PERMS.dissolve);
    if (this.num(fund.total_amount) > 0) {
      throw new HttpException(
        `基金当前余额 ${this.fmt(fund.total_amount)} 元，请先通过取出/转账/调账清零后再解散`,
        HttpStatus.BAD_REQUEST
      );
    }
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [locked] = await qr.query(
        'SELECT * FROM `family_fund` WHERE `id` = ? FOR UPDATE',
        [fund.id]
      );
      if (this.num(locked.total_amount) > 0) {
        throw new HttpException('基金余额不为 0，无法解散', HttpStatus.BAD_REQUEST);
      }
      await qr.query(
        `UPDATE \`family_fund\` SET \`status\` = 2, \`dissolved_at\` = NOW(), \`dissolve_reason\` = ?
         WHERE \`id\` = ?`,
        [(data?.reason || '').trim(), fund.id]
      );
      await qr.query(
        'UPDATE `family_fund_member` SET `status` = 0 WHERE `fund_id` = ?',
        [fund.id]
      );
      await qr.commitTransaction();
      return { dissolved: true };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ==================== 成员管理 ====================

  /** 添加基金成员（需 manage_member 权限），默认角色 member + 存入权限 */
  async addMember(userId: string, familyId: number, data: FundMemberData) {
    this.requireFamilyId(familyId);
    const fund = await this.requireFund(familyId, userId);
    await this.requirePerm(userId, fund, FUND_PERMS.manageMember);
    // 支持按 memberId（家族成员ID，反查已绑定账号）或 userId 添加
    const memberId = String(data?.memberId || '').trim();
    let targetUserId = String(data?.userId || '').trim();
    if (!memberId && !targetUserId) {
      throw new HttpException('请选择要添加的成员', HttpStatus.BAD_REQUEST);
    }
    if (memberId) {
      const [bound] = await this.dataSource.query<{ id: string; nickname: string }[]>(
        'SELECT `id`, `nickname` FROM `user` WHERE `member_id` = ? AND `family_id` = ? AND `status` = 1 LIMIT 1',
        [memberId, familyId]
      );
      if (!bound) {
        throw new HttpException('该成员尚未绑定账号，无法加入基金', HttpStatus.BAD_REQUEST);
      }
      targetUserId = bound.id;
    }
    if (!(await this.isFamilyMember(targetUserId, familyId))) {
      throw new HttpException('对方不属于该家族，无法添加', HttpStatus.BAD_REQUEST);
    }
    const [exists] = await this.dataSource.query<FundMemberRow[]>(
      'SELECT * FROM `family_fund_member` WHERE `fund_id` = ? AND `user_id` = ?',
      [fund.id, targetUserId]
    );
    if (exists && Number(exists.status) === 1) {
      throw new HttpException('该成员已在基金中', HttpStatus.BAD_REQUEST);
    }
    const [userRow] = await this.dataSource.query<{ nickname: string; member_id: string | null }[]>(
      'SELECT `nickname`, `member_id` FROM `user` WHERE `id` = ? LIMIT 1',
      [targetUserId]
    );
    if (exists) {
      await this.dataSource.query(
        `UPDATE \`family_fund_member\`
         SET \`status\` = 1, \`role\` = 'member', \`permissions\` = ?,
             \`name\` = ?, \`member_id\` = ?
         WHERE \`id\` = ?`,
        [JSON.stringify(DEFAULT_PERMS.member), (userRow?.nickname || '').trim(), (userRow?.member_id || '').trim(), exists.id]
      );
      return { userId: targetUserId, role: 'member' };
    }
    const result = await this.dataSource.query<{ insertId: number }>(
      `INSERT INTO \`family_fund_member\`
       (\`fund_id\`, \`family_id\`, \`user_id\`, \`member_id\`, \`name\`, \`role\`, \`permissions\`)
       VALUES (?, ?, ?, ?, ?, 'member', ?)`,
      [
        fund.id,
        familyId,
        targetUserId,
        (userRow?.member_id || '').trim(),
        (userRow?.nickname || '').trim(),
        JSON.stringify(DEFAULT_PERMS.member)
      ]
    );
    return { userId: targetUserId, role: 'member', id: Number(result.insertId) };
  }

  /** 更新成员角色/权限（需 manage_member 权限；族长不可被修改） */
  async updateMember(userId: string, familyId: number, targetUserId: string, data: FundMemberData) {
    this.requireFamilyId(familyId);
    const fund = await this.requireFund(familyId, userId);
    await this.requirePerm(userId, fund, FUND_PERMS.manageMember);
    const target = await this.getFundMember(fund.id, targetUserId);
    if (!target || Number(target.status) !== 1) {
      throw new HttpException('对方不在基金成员中', HttpStatus.BAD_REQUEST);
    }
    if (target.role === 'leader' || (await this.isFundLeader(targetUserId, fund))) {
      throw new HttpException('族长不可被修改权限', HttpStatus.BAD_REQUEST);
    }
    const role = String(data?.role || '').trim() || target.role;
    if (!ROLE_LABELS[role]) {
      throw new HttpException('无效的角色', HttpStatus.BAD_REQUEST);
    }
    if (role === 'leader') {
      throw new HttpException('不能将其他成员设为族长', HttpStatus.BAD_REQUEST);
    }
    let permissions: FundPerm[] | undefined;
    if (Array.isArray(data?.permissions)) {
      permissions = this.validPerms(data.permissions);
    } else if (role !== target.role) {
      permissions = DEFAULT_PERMS[role];
    }
    const sets: string[] = ['`role` = ?'];
    const args: unknown[] = [role];
    if (permissions) {
      sets.push('`permissions` = ?');
      args.push(JSON.stringify(permissions));
    }
    await this.dataSource.query(
      `UPDATE \`family_fund_member\` SET ${sets.join(', ')} WHERE \`id\` = ?`,
      [...args, target.id]
    );
    return { userId: targetUserId, role, permissions: permissions || this.parsePerms(target.permissions) };
  }

  /** 移除基金成员（需 manage_member 权限；余额不为 0 需先处理） */
  async removeMember(userId: string, familyId: number, targetUserId: string) {
    this.requireFamilyId(familyId);
    const fund = await this.requireFund(familyId, userId);
    await this.requirePerm(userId, fund, FUND_PERMS.manageMember);
    if (String(targetUserId) === String(userId)) {
      throw new HttpException('不能移除自己，可联系其他族长处理', HttpStatus.BAD_REQUEST);
    }
    const target = await this.getFundMember(fund.id, targetUserId);
    if (!target || Number(target.status) !== 1) {
      throw new HttpException('对方不在基金成员中', HttpStatus.BAD_REQUEST);
    }
    if (target.role === 'leader' || (await this.isFundLeader(targetUserId, fund))) {
      throw new HttpException('族长不可被移除', HttpStatus.BAD_REQUEST);
    }
    if (this.num(target.balance) > 0) {
      throw new HttpException(
        `该成员尚有余额 ${this.fmt(target.balance)} 元，请先转出或调账清零后再移除`,
        HttpStatus.BAD_REQUEST
      );
    }
    await this.dataSource.query(
      'UPDATE `family_fund_member` SET `status` = 0 WHERE `id` = ?',
      [target.id]
    );
    return { removed: true };
  }

  // ==================== 资金操作 ====================

  /** 存入：公共池 + 个人余额 +（需 deposit 权限，受单次/日/月限额约束） */
  async deposit(userId: string, familyId: number, data: FundOpData) {
    this.requireFamilyId(familyId);
    const fund = await this.requireFund(familyId, userId);
    await this.requirePerm(userId, fund, FUND_PERMS.deposit);
    const amount = this.toMoney(data?.amount, '存入金额');
    await this.checkLimit(fund, userId, 'deposit', amount);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [locked] = await qr.query(
        'SELECT * FROM `family_fund` WHERE `id` = ? FOR UPDATE',
        [fund.id]
      );
      if (Number(locked.status) !== 1) {
        throw new HttpException('基金已解散，无法操作', HttpStatus.BAD_REQUEST);
      }
      const balanceAfter = this.add(this.num(locked.total_amount), amount);
      await qr.query(
        'UPDATE `family_fund` SET `total_amount` = ? WHERE `id` = ?',
        [balanceAfter, fund.id]
      );
      await this.upsertMemberBalance(qr, fund, familyId, userId, amount);
      const result = await qr.query(
        `INSERT INTO \`family_fund_transaction\`
         (\`fund_id\`, \`family_id\`, \`type\`, \`amount\`, \`direction\`, \`operator_user_id\`,
          \`payment_method\`, \`status\`, \`remark\`, \`balance_after\`)
         VALUES (?, ?, 'deposit', ?, 1, ?, ?, 1, ?, ?)`,
        [
          fund.id,
          familyId,
          amount,
          userId,
          (data?.paymentMethod || 'cash').trim(),
          (data?.remark || '存入基金').trim(),
          balanceAfter
        ]
      );
      await qr.commitTransaction();
      return { txId: Number(result.insertId), balanceAfter, myBalance: this.num(locked.total_amount) + amount };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /** 取出：需 withdraw 权限；超过审批阈值 → 待审批，否则直接扣减 */
  async withdraw(userId: string, familyId: number, data: FundOpData) {
    this.requireFamilyId(familyId);
    const fund = await this.requireFund(familyId, userId);
    await this.requirePerm(userId, fund, FUND_PERMS.withdraw);
    const amount = this.toMoney(data?.amount, '取出金额');
    await this.checkLimit(fund, userId, 'withdraw', amount);
    const member = await this.getFundMember(fund.id, userId);
    if (this.num(member?.balance || 0) < amount) {
      throw new HttpException(
        `个人可用余额不足（当前 ${this.fmt(member?.balance || 0)} 元）`,
        HttpStatus.BAD_REQUEST
      );
    }
    const needApprove = Number(fund.need_approval) === 1 && amount > this.num(fund.withdraw_approval_threshold);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [locked] = await qr.query(
        'SELECT * FROM `family_fund` WHERE `id` = ? FOR UPDATE',
        [fund.id]
      );
      if (Number(locked.status) !== 1) {
        throw new HttpException('基金已解散，无法操作', HttpStatus.BAD_REQUEST);
      }
      const success = !needApprove;
      const balanceAfter = success ? this.sub(this.num(locked.total_amount), amount) : this.num(locked.total_amount);
      if (success) {
        await qr.query(
          'UPDATE `family_fund` SET `total_amount` = ? WHERE `id` = ?',
          [balanceAfter, fund.id]
        );
        await this.upsertMemberBalance(qr, fund, familyId, userId, -amount);
      }
      const result = await qr.query(
        `INSERT INTO \`family_fund_transaction\`
         (\`fund_id\`, \`family_id\`, \`type\`, \`amount\`, \`direction\`, \`operator_user_id\`,
          \`payment_method\`, \`status\`, \`remark\`, \`balance_after\`)
         VALUES (?, ?, 'withdraw', ?, -1, ?, ?, ?, ?, ?)`,
        [
          fund.id,
          familyId,
          amount,
          userId,
          (data?.paymentMethod || 'cash').trim(),
          success ? TX_STATUS.SUCCESS : TX_STATUS.PENDING,
          (data?.remark || (needApprove ? '取出（待审批）' : '取出基金')).trim(),
          balanceAfter
        ]
      );
      await qr.commitTransaction();
      return {
        txId: Number(result.insertId),
        status: success ? TX_STATUS.SUCCESS : TX_STATUS.PENDING,
        balanceAfter
      };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /** 成员间转账：仅个人余额转移（A.balance- / B.balance+），公共池不变 */
  async transfer(userId: string, familyId: number, data: FundOpData) {
    this.requireFamilyId(familyId);
    const fund = await this.requireFund(familyId, userId);
    await this.requirePerm(userId, fund, FUND_PERMS.transfer);
    const amount = this.toMoney(data?.amount, '转账金额');
    const targetUserId = String(data?.targetUserId || '').trim();
    if (!targetUserId) {
      throw new HttpException('请选择转账接收人', HttpStatus.BAD_REQUEST);
    }
    if (String(targetUserId) === String(userId)) {
      throw new HttpException('不能给自己转账', HttpStatus.BAD_REQUEST);
    }
    await this.checkLimit(fund, userId, 'withdraw', amount);
    const target = await this.getFundMember(fund.id, targetUserId);
    if (!target || Number(target.status) !== 1) {
      throw new HttpException('接收人尚未加入基金，请先在成员管理中添加', HttpStatus.BAD_REQUEST);
    }
    const mine = await this.getFundMember(fund.id, userId);
    if (this.num(mine?.balance || 0) < amount) {
      throw new HttpException(
        `个人可用余额不足（当前 ${this.fmt(mine?.balance || 0)} 元）`,
        HttpStatus.BAD_REQUEST
      );
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [locked] = await qr.query(
        'SELECT * FROM `family_fund` WHERE `id` = ? FOR UPDATE',
        [fund.id]
      );
      if (Number(locked.status) !== 1) {
        throw new HttpException('基金已解散，无法操作', HttpStatus.BAD_REQUEST);
      }
      await qr.query(
        `UPDATE \`family_fund_member\` SET \`balance\` = \`balance\` - ?
         WHERE \`id\` = ? AND \`balance\` >= ?`,
        [amount, mine.id, amount]
      );
      await qr.query(
        'UPDATE `family_fund_member` SET `balance` = `balance` + ? WHERE `id` = ?',
        [amount, target.id]
      );
      const result = await qr.query(
        `INSERT INTO \`family_fund_transaction\`
         (\`fund_id\`, \`family_id\`, \`type\`, \`amount\`, \`direction\`, \`operator_user_id\`, \`target_user_id\`,
          \`payment_method\`, \`status\`, \`remark\`, \`balance_after\`)
         VALUES (?, ?, 'transfer', ?, -1, ?, ?, 'cash', 1, ?, ?)`,
        [
          fund.id,
          familyId,
          amount,
          userId,
          targetUserId,
          (data?.remark || '成员间转账').trim(),
          this.num(locked.total_amount)
        ]
      );
      await qr.commitTransaction();
      return { txId: Number(result.insertId), balanceAfter: this.num(locked.total_amount) };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /** 调账（族长）：直接增减公共池，不影响个人余额，不限额 */
  async adjust(userId: string, familyId: number, data: FundOpData) {
    this.requireFamilyId(familyId);
    const fund = await this.requireFund(familyId, userId);
    if (!(await this.isFundLeader(userId, fund))) {
      throw new HttpException('仅族长可调账', HttpStatus.FORBIDDEN);
    }
    const amount = this.toMoney(data?.amount, '调整金额');
    const direction = Number(data?.direction) === -1 ? -1 : 1;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [locked] = await qr.query(
        'SELECT * FROM `family_fund` WHERE `id` = ? FOR UPDATE',
        [fund.id]
      );
      if (Number(locked.status) !== 1) {
        throw new HttpException('基金已解散，无法操作', HttpStatus.BAD_REQUEST);
      }
      const balanceAfter =
        direction === 1
          ? this.add(this.num(locked.total_amount), amount)
          : this.sub(this.num(locked.total_amount), amount);
      await qr.query(
        'UPDATE `family_fund` SET `total_amount` = ? WHERE `id` = ?',
        [balanceAfter, fund.id]
      );
      const result = await qr.query(
        `INSERT INTO \`family_fund_transaction\`
         (\`fund_id\`, \`family_id\`, \`type\`, \`amount\`, \`direction\`, \`operator_user_id\`,
          \`payment_method\`, \`status\`, \`remark\`, \`balance_after\`)
         VALUES (?, ?, 'adjust', ?, ?, ?, 'cash', 1, ?, ?)`,
        [
          fund.id,
          familyId,
          amount,
          direction,
          userId,
          (data?.remark || '族长调账').trim(),
          balanceAfter
        ]
      );
      await qr.commitTransaction();
      return { txId: Number(result.insertId), balanceAfter };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /** 审批大额取出（approve 权限）：通过则扣减公共池与个人余额 */
  async approveTx(userId: string, familyId: number, txId: number, data: FundApproveData) {
    this.requireFamilyId(familyId);
    const fund = await this.requireFund(familyId, userId);
    await this.requirePerm(userId, fund, FUND_PERMS.approve);
    if (!txId || txId <= 0) {
      throw new HttpException('缺少交易ID', HttpStatus.BAD_REQUEST);
    }
    const [tx] = await this.dataSource.query<FundTxRow[]>(
      'SELECT * FROM `family_fund_transaction` WHERE `id` = ? AND `fund_id` = ? LIMIT 1',
      [txId, fund.id]
    );
    if (!tx) {
      throw new HttpException('交易不存在', HttpStatus.NOT_FOUND);
    }
    if (Number(tx.status) !== TX_STATUS.PENDING) {
      throw new HttpException('该交易不在待审批状态', HttpStatus.BAD_REQUEST);
    }
    const approved = data?.approved !== false;
    const remark = (data?.remark || '').trim();

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [locked] = await qr.query(
        'SELECT * FROM `family_fund` WHERE `id` = ? FOR UPDATE',
        [fund.id]
      );
      if (approved) {
        const amount = this.num(tx.amount);
        if (this.num(locked.total_amount) < amount) {
          throw new HttpException('基金公共池余额不足，无法通过', HttpStatus.BAD_REQUEST);
        }
        const operator = await qr.query(
          `SELECT * FROM \`family_fund_member\`
           WHERE \`fund_id\` = ? AND \`user_id\` = ? AND \`status\` = 1 LIMIT 1
           FOR UPDATE`,
          [fund.id, tx.operator_user_id]
        );
        if (operator.length === 0 || this.num(operator[0].balance) < amount) {
          throw new HttpException('申请人个人余额不足，无法通过', HttpStatus.BAD_REQUEST);
        }
        const balanceAfter = this.sub(this.num(locked.total_amount), amount);
        await qr.query(
          'UPDATE `family_fund` SET `total_amount` = ? WHERE `id` = ?',
          [balanceAfter, fund.id]
        );
        await qr.query(
          `UPDATE \`family_fund_member\` SET \`balance\` = \`balance\` - ?
           WHERE \`id\` = ? AND \`balance\` >= ?`,
          [amount, operator[0].id, amount]
        );
        await qr.query(
          `UPDATE \`family_fund_transaction\`
           SET \`status\` = 1, \`balance_after\` = ?, \`approve_user_id\` = ?, \`approve_time\` = NOW(), \`approve_remark\` = ?
           WHERE \`id\` = ?`,
          [balanceAfter, userId, remark, txId]
        );
        await qr.commitTransaction();
        return { status: TX_STATUS.SUCCESS, balanceAfter };
      }
      await qr.query(
        `UPDATE \`family_fund_transaction\`
         SET \`status\` = 3, \`approve_user_id\` = ?, \`approve_time\` = NOW(), \`approve_remark\` = ?
         WHERE \`id\` = ?`,
        [userId, remark || '审批未通过', txId]
      );
      await qr.commitTransaction();
      return { status: TX_STATUS.REJECTED };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ==================== 私有工具 ====================

  private requireFamilyId(familyId: number) {
    if (!familyId || familyId <= 0) {
      throw new HttpException('缺少家族ID', HttpStatus.BAD_REQUEST);
    }
  }

  /** 取基金（不校验成员） */
  private async getFund(familyId: number): Promise<FundRow | null> {
    const [fund] = await this.dataSource.query<FundRow[]>(
      'SELECT * FROM `family_fund` WHERE `family_id` = ? LIMIT 1',
      [familyId]
    );
    return fund || null;
  }

  /** 取基金并校验家族成员归属 */
  private async requireFund(familyId: number, userId: string): Promise<FundRow> {
    const fund = await this.getFund(familyId);
    if (!fund) {
      throw new HttpException('该家族尚未创建基金', HttpStatus.NOT_FOUND);
    }
    if (Number(fund.status) === 2) {
      throw new HttpException('基金已解散', HttpStatus.BAD_REQUEST);
    }
    if (!(await this.isFamilyMember(userId, familyId))) {
      throw new HttpException('您不属于该家族，无权操作', HttpStatus.FORBIDDEN);
    }
    return fund;
  }

  /** 校验指定权限，无则抛错 */
  private async requirePerm(userId: string, fund: FundRow, perm: FundPerm): Promise<void> {
    if (!(await this.hasPerm(userId, fund, perm))) {
      throw new HttpException('您没有该操作权限', HttpStatus.FORBIDDEN);
    }
  }

  /** 权限判定：族长 → 全部；成员 → 权限数组；未入名单 → 默认仅可存入 */
  private async hasPerm(userId: string, fund: FundRow, perm: FundPerm): Promise<boolean> {
    if (await this.isFundLeader(userId, fund)) return true;
    const member = await this.getFundMember(fund.id, userId);
    if (!member || Number(member.status) !== 1) {
      return DEFAULT_PERMS.member.includes(perm);
    }
    return this.parsePerms(member.permissions).includes(perm);
  }

  /** 族长判定：基金创建者 / 家族创建者 / 家族管理员 */
  private async isFundLeader(userId: string, fund: FundRow): Promise<boolean> {
    if (fund.creator_user_id === userId) return true;
    const familyId = Number(fund.family_id);
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
      'SELECT `id` FROM `family_permission` WHERE `family_id` = ? AND `user_id` = ? AND `status` = 1 LIMIT 1',
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

  /** 取基金成员记录 */
  private async getFundMember(fundId: number, userId: string): Promise<FundMemberRow | null> {
    const [member] = await this.dataSource.query<FundMemberRow[]>(
      'SELECT * FROM `family_fund_member` WHERE `fund_id` = ? AND `user_id` = ? AND `status` = 1 LIMIT 1',
      [fundId, userId]
    );
    return member || null;
  }

  /** 存入/取出后同步个人余额（无记录则自动建行，默认 member + 存入权限） */
  private async upsertMemberBalance(
    qr: { query: (sql: string, params?: unknown[]) => Promise<any> },
    fund: FundRow,
    familyId: number,
    userId: string,
    delta: number
  ) {
    const [member] = (await qr.query(
      'SELECT * FROM `family_fund_member` WHERE `fund_id` = ? AND `user_id` = ? AND `status` = 1 LIMIT 1 FOR UPDATE',
      [fund.id, userId]
    )) as FundMemberRow[];
    if (member) {
      if (delta < 0 && this.num(member.balance) < -delta) {
        throw new HttpException('个人可用余额不足', HttpStatus.BAD_REQUEST);
      }
      await qr.query(
        'UPDATE `family_fund_member` SET `balance` = `balance` + ? WHERE `id` = ?',
        [delta, member.id]
      );
      return;
    }
    if (delta < 0) {
      throw new HttpException('个人可用余额不足', HttpStatus.BAD_REQUEST);
    }
    await qr.query(
      `INSERT INTO \`family_fund_member\`
       (\`fund_id\`, \`family_id\`, \`user_id\`, \`name\`, \`role\`, \`permissions\`, \`balance\`)
       VALUES (?, ?, ?, ?, 'member', ?, ?)`,
      [fund.id, familyId, userId, '家族成员', JSON.stringify(DEFAULT_PERMS.member), delta]
    );
  }

  /** 限额校验：单次 / 当日累计 / 当月累计（取出口径含转账） */
  private async checkLimit(fund: FundRow, userId: string, kind: 'deposit' | 'withdraw', amount: number): Promise<void> {
    const single = this.num(kind === 'deposit' ? fund.single_deposit_limit : fund.single_withdraw_limit);
    const daily = this.num(kind === 'deposit' ? fund.daily_deposit_limit : fund.daily_withdraw_limit);
    const monthly = this.num(kind === 'deposit' ? fund.monthly_deposit_limit : fund.monthly_withdraw_limit);
    const label = kind === 'deposit' ? '存入' : '取出';
    if (amount > single) {
      throw new HttpException(`单次${label}不能超过 ${this.fmt(single)} 元`, HttpStatus.BAD_REQUEST);
    }
    const whereExpr =
      kind === 'deposit'
        ? `\`type\` = 'deposit' AND \`direction\` = 1 AND \`status\` = 1`
        : `(\`type\` = 'withdraw' AND \`direction\` = -1 OR \`type\` = 'transfer' AND \`direction\` = -1) AND \`status\` IN (1, 2)`;
    const base = `SELECT COALESCE(SUM(\`amount\`), 0) AS s FROM \`family_fund_transaction\`
      WHERE \`fund_id\` = ? AND \`operator_user_id\` = ? AND (${whereExpr}) AND`;
    const [dayRow] = await this.dataSource.query<{ s: string }[]>(
      `${base} DATE(\`create_time\`) = CURDATE()`,
      [fund.id, userId]
    );
    if (this.add(this.num(dayRow?.s || 0), amount) > daily) {
      throw new HttpException(
        `今日累计${label}已达上限（可再${label} ${this.fmt(this.sub(daily, this.num(dayRow?.s || 0)))} 元）`,
        HttpStatus.BAD_REQUEST
      );
    }
    const [monthRow] = await this.dataSource.query<{ s: string }[]>(
      `${base} DATE_FORMAT(\`create_time\`, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      [fund.id, userId]
    );
    if (this.add(this.num(monthRow?.s || 0), amount) > monthly) {
      throw new HttpException(
        `本月累计${label}已达上限（可再${label} ${this.fmt(this.sub(monthly, this.num(monthRow?.s || 0)))} 元）`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /** 限额数值归一化（仅取明确传入的合法正值） */
  private normalizeLimits(data: FundCreateData) {
    const n = (v: unknown): number | undefined => {
      const x = Number(v);
      if (!Number.isFinite(x) || x <= 0) return undefined;
      return Math.round(x * 100) / 100;
    };
    return {
      singleDepositLimit: n(data?.singleDepositLimit),
      singleWithdrawLimit: n(data?.singleWithdrawLimit),
      dailyDepositLimit: n(data?.dailyDepositLimit),
      dailyWithdrawLimit: n(data?.dailyWithdrawLimit),
      monthlyDepositLimit: n(data?.monthlyDepositLimit),
      monthlyWithdrawLimit: n(data?.monthlyWithdrawLimit),
      withdrawApprovalThreshold: n(data?.withdrawApprovalThreshold)
    };
  }

  /** 金额校验：正数、保留 2 位 */
  private toMoney(v: number | string | undefined, field: string): number {
    const n = Math.round(Number(v) * 100) / 100;
    if (!Number.isFinite(n) || n <= 0) {
      throw new HttpException(`${field}必须是大于 0 的金额`, HttpStatus.BAD_REQUEST);
    }
    return n;
  }

  /** 非负金额（创建初始资金允许 0） */
  private moneyOrZero(v: number | string | undefined): number {
    const n = Math.round(Number(v) * 100) / 100;
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }

  /** 权限码过滤为合法集合 */
  private validPerms(perms: string[]): FundPerm[] {
    const all = Object.values(FUND_PERMS);
    return perms.filter((p) => all.includes(p as FundPerm)) as FundPerm[];
  }

  /** 解析权限 JSON 字段 */
  private parsePerms(raw: string | string[] | null | undefined): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** 成员当前生效权限（leader 恒为全量） */
  private memberPerms(fund: FundRow, isLeader: boolean, member: FundMemberRow | null): string[] {
    if (isLeader) return [...DEFAULT_PERMS.leader];
    if (member && Number(member.status) === 1) return this.parsePerms(member.permissions);
    return [...DEFAULT_PERMS.member];
  }

  // ==================== 序列化 ====================

  private toFund(r: FundRow) {
    return {
      id: r.id,
      familyId: r.family_id,
      name: r.name,
      logoUrl: r.logo_url,
      description: r.description,
      totalAmount: this.num(r.total_amount),
      singleDepositLimit: this.num(r.single_deposit_limit),
      singleWithdrawLimit: this.num(r.single_withdraw_limit),
      dailyDepositLimit: this.num(r.daily_deposit_limit),
      dailyWithdrawLimit: this.num(r.daily_withdraw_limit),
      monthlyDepositLimit: this.num(r.monthly_deposit_limit),
      monthlyWithdrawLimit: this.num(r.monthly_withdraw_limit),
      withdrawApprovalThreshold: this.num(r.withdraw_approval_threshold),
      needApproval: Number(r.need_approval) === 1,
      status: Number(r.status),
      creatorUserId: r.creator_user_id,
      dissolvedAt: r.dissolved_at,
      dissolveReason: r.dissolve_reason,
      createTime: r.create_time
    };
  }

  private toMember(r: FundMemberRow & { nickname?: string; avatar_url?: string }) {
    return {
      userId: r.user_id,
      memberId: r.member_id,
      name: r.name || r.nickname || '',
      avatarUrl: r.avatar_url || '',
      role: r.role,
      roleLabel: ROLE_LABELS[r.role] || '成员',
      permissions: this.parsePerms(r.permissions),
      balance: this.num(r.balance),
      joinTime: r.create_time
    };
  }

  private toTx(r: FundTxRow & { operator_name?: string; target_name?: string }) {
    const pending = Number(r.status) === TX_STATUS.PENDING;
    return {
      id: r.id,
      type: r.type,
      typeLabel: TX_TYPE_LABELS[r.type] || r.type,
      amount: this.num(r.amount),
      direction: Number(r.direction),
      status: Number(r.status),
      statusLabel: pending ? '待审批' : Number(r.status) === TX_STATUS.SUCCESS ? '成功' : Number(r.status) === TX_STATUS.REJECTED ? '已驳回' : '失败',
      operatorUserId: r.operator_user_id,
      operatorName: r.operator_name || '',
      targetUserId: r.target_user_id,
      targetName: r.target_name || '',
      paymentMethod: r.payment_method,
      paymentLabel: PAYMENT_LABELS[r.payment_method] || '',
      remark: r.remark,
      balanceAfter: this.num(r.balance_after),
      approveUserId: r.approve_user_id,
      approveTime: r.approve_time,
      approveRemark: r.approve_remark,
      createTime: r.create_time
    };
  }

  private num(v: string | number | undefined | null): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private add(a: number, b: number): number {
    return Math.round((a + b) * 100) / 100;
  }

  private sub(a: number, b: number): number {
    return Math.round((a - b) * 100) / 100;
  }

  private fmt(v: string | number | undefined | null): string {
    return this.num(v).toFixed(2);
  }
}
