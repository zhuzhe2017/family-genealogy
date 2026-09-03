import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource, type QueryRunner } from 'typeorm';
import type { StringValue } from 'ms';
import * as bcrypt from 'bcrypt';
import {
  type AdminRow,
  type AdminFamilyRow,
  type AdminCreateData,
  type AdminUpdateData,
  type AdminProfileUpdateData
} from './types/admin.types';
import { type QueryValues, type DataRow } from '../common/types/common';
import { getSafeMemberTableName } from '../common/utils/family-member-table';
import { SystemSecurityService } from '../system-security/system-security.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly securityService: SystemSecurityService
  ) {}

  /** 管理员登录 */
  async login(username: string, password: string, ip?: string, captcha?: { token?: string; code?: string }) {
    // 安全前置校验：IP 限制 + 失败锁定 + 验证码（未开启时跳过）
    await this.securityService.checkLoginAllowed(username, ip || '', captcha);

    const [admin] = await this.dataSource.query<AdminRow[]>(
      'SELECT `id`, `username`, `password`, `nickname`, `role`, `status` FROM `sys_admin` WHERE `username` = ?',
      [username]
    );

    if (!admin) {
      throw new HttpException('账号或密码错误', HttpStatus.UNAUTHORIZED);
    }

    if (admin.status !== 1) {
      throw new HttpException('账号已被禁用', HttpStatus.FORBIDDEN);
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      throw new HttpException('账号或密码错误', HttpStatus.UNAUTHORIZED);
    }

    // type 字段用于与 C 端用户令牌(type='user')严格区分,防止跨体系令牌混淆
    const payload = { sub: admin.id, username: admin.username, role: admin.role, type: 'admin' };
    const token = this.jwtService.sign(payload, { expiresIn: await this.getAccessTokenExpiresIn() });

    // 更新最后登录时间和IP
    await this.dataSource.query(
      'UPDATE `sys_admin` SET `last_login_time` = NOW(), `last_login_ip` = ? WHERE `id` = ?',
      [ip || '', admin.id]
    );

    return {
      token,
      refreshToken: this.jwtService.sign(payload, { expiresIn: '30d' })
    };
  }

  /**
   * 校验 refreshToken 并签发新的 access token + refreshToken
   */
  async refreshToken(refreshToken: string) {
    let payload: { sub: number; username: string; role: string; type?: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken);
    } catch {
      throw new HttpException('refreshToken 无效或已过期', HttpStatus.UNAUTHORIZED);
    }

    // 拒绝非管理员令牌(如小程序用户令牌 type='user')冒用刷新
    if (payload.type !== 'admin') {
      throw new HttpException('非管理员令牌', HttpStatus.UNAUTHORIZED);
    }

    const [admin] = await this.dataSource.query<AdminRow[]>(
      'SELECT `id`, `username`, `role`, `status` FROM `sys_admin` WHERE `id` = ?',
      [payload.sub]
    );

    if (!admin || admin.status !== 1) {
      throw new HttpException('管理员不存在或已禁用', HttpStatus.UNAUTHORIZED);
    }

    const newPayload = { sub: admin.id, username: admin.username, role: admin.role, type: 'admin' as const };
    return {
      token: this.jwtService.sign(newPayload, { expiresIn: await this.getAccessTokenExpiresIn() }),
      refreshToken: this.jwtService.sign(newPayload, { expiresIn: '30d' })
    };
  }

  /**
   * 读取 access token 有效期配置（天），由 sys_config.login_token_expire_days 驱动
   *
   * 未配置或非法值时回退到 JwtModule 默认值（JWT_EXPIRES_IN，默认 7d）
   */
  private async getAccessTokenExpiresIn(): Promise<StringValue> {
    const days = Math.floor(Number(await this.securityService.getConfig('login_token_expire_days', '7')));
    const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 7;
    return `${safeDays}d` as StringValue;
  }

  /** 获取管理员信息（含可管理的家族ID列表） */
  async getProfile(adminId: number) {
    const [admin] = await this.dataSource.query<AdminRow[]>(
      'SELECT `id`, `username`, `nickname`, `avatar_url`, `phone`, `email`, `role`, `status`, `last_login_time` FROM `sys_admin` WHERE `id` = ?',
      [adminId]
    );

    if (!admin) {
      throw new HttpException('管理员不存在', HttpStatus.NOT_FOUND);
    }

    const families = await this.dataSource.query<AdminFamilyRow[]>(
      'SELECT `family_id` FROM `sys_admin_family` WHERE `admin_id` = ?',
      [adminId]
    );

    const roles = await this.getAdminRoles(adminId, admin.role);
    const buttons = await this.getAdminPermissions(adminId, admin.role);

    return {
      userId: String(admin.id),
      userName: admin.username,
      nickname: admin.nickname,
      avatarUrl: admin.avatar_url,
      phone: admin.phone,
      email: admin.email,
      roles,
      buttons,
      familyIds: families.map(f => f.family_id)
    };
  }

  /** 获取管理员角色编码列表（兼容 sys_admin.role 字段） */
  private async getAdminRoles(adminId: number, defaultRole: string) {
    const rows = await this.dataSource.query<{ code: string }[]>(
      `SELECT r.\`code\` FROM \`sys_role\` r
       INNER JOIN \`sys_admin_role\` ar ON ar.\`role_id\` = r.\`id\`
       WHERE ar.\`admin_id\` = ? AND r.\`status\` = 1`,
      [adminId]
    );

    const codes = rows.map(row => row.code);
    if (defaultRole && !codes.includes(defaultRole)) {
      codes.unshift(defaultRole);
    }

    return codes;
  }

  /** 获取管理员权限标识列表（super 角色默认拥有全部权限） */
  private async getAdminPermissions(adminId: number, defaultRole: string) {
    if (defaultRole === 'super') {
      const rows = await this.dataSource.query<{ code: string }[]>(
        'SELECT `code` FROM `sys_permission` WHERE `status` = 1'
      );
      return rows.map(row => row.code);
    }

    const rows = await this.dataSource.query<{ code: string }[]>(
      `SELECT p.\`code\` FROM \`sys_permission\` p
       INNER JOIN \`sys_role_permission\` rp ON rp.\`permission_id\` = p.\`id\`
       INNER JOIN \`sys_admin_role\` ar ON ar.\`role_id\` = rp.\`role_id\`
       WHERE ar.\`admin_id\` = ? AND p.\`status\` = 1`,
      [adminId]
    );

    return [...new Set(rows.map(row => row.code))];
  }

  /** 获取管理员列表 */
  async getList(page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;

    const [totalResult] = await this.dataSource.query<{ total: number }[]>(
      'SELECT COUNT(*) AS total FROM `sys_admin`'
    );
    const total = totalResult?.total ?? 0;

    const list = await this.dataSource.query<AdminRow[]>(
      'SELECT `id`, `username`, `nickname`, `avatar_url`, `phone`, `email`, `role`, `status`, `last_login_time`, `create_time` FROM `sys_admin` ORDER BY `id` ASC LIMIT ? OFFSET ?',
      [pageSize, offset]
    );

    return { list, total, page, pageSize };
  }

  /** 创建管理员 */
  async create(data: AdminCreateData) {
    const [existing] = await this.dataSource.query<Pick<AdminRow, 'id'>[]>(
      'SELECT `id` FROM `sys_admin` WHERE `username` = ?',
      [data.username]
    );

    if (existing) {
      throw new HttpException('账号已存在', HttpStatus.CONFLICT);
    }

    // 密码策略校验
    const policyError = await this.securityService.validatePassword(data.password);
    if (policyError) {
      throw new HttpException(policyError, HttpStatus.BAD_REQUEST);
    }

    const hash = await bcrypt.hash(data.password, 10);
    const result = await this.dataSource.query<InsertResult>(
      'INSERT INTO `sys_admin` (`username`, `password`, `nickname`, `phone`, `email`, `role`) VALUES (?, ?, ?, ?, ?, ?)',
      [data.username, hash, data.nickname || '', data.phone || '', data.email || '', data.role || 'admin']
    );

    return { id: result.insertId };
  }

  /** 更新管理员 */
  async update(id: number, data: AdminUpdateData) {
    const fields: string[] = [];
    const values: QueryValues = [];

    if (data.nickname !== undefined) { fields.push('`nickname` = ?'); values.push(data.nickname); }
    if (data.phone !== undefined) { fields.push('`phone` = ?'); values.push(data.phone); }
    if (data.email !== undefined) { fields.push('`email` = ?'); values.push(data.email); }
    if (data.role !== undefined) { fields.push('`role` = ?'); values.push(data.role); }
    if (data.status !== undefined) { fields.push('`status` = ?'); values.push(data.status); }

    if (fields.length === 0) {
      throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);
    }

    values.push(id);
    await this.dataSource.query(
      `UPDATE \`sys_admin\` SET ${fields.join(', ')} WHERE \`id\` = ?`,
      values
    );

    return { success: true };
  }

  /** 更新当前管理员个人资料（昵称/手机号/邮箱/头像） */
  async updateProfile(adminId: number, data: AdminProfileUpdateData) {
    const fields: string[] = [];
    const values: QueryValues = [];

    if (data.nickname !== undefined) {
      const nickname = String(data.nickname || '').trim();
      if (nickname.length > 50) {
        throw new HttpException('昵称长度不能超过 50 个字符', HttpStatus.BAD_REQUEST);
      }
      fields.push('`nickname` = ?');
      values.push(nickname);
    }
    if (data.phone !== undefined) {
      const phone = String(data.phone || '').trim();
      if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
        throw new HttpException('手机号格式不正确', HttpStatus.BAD_REQUEST);
      }
      fields.push('`phone` = ?');
      values.push(phone);
    }
    if (data.email !== undefined) {
      const email = String(data.email || '').trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpException('邮箱格式不正确', HttpStatus.BAD_REQUEST);
      }
      fields.push('`email` = ?');
      values.push(email);
    }
    if (data.avatarUrl !== undefined) {
      fields.push('`avatar_url` = ?');
      values.push(String(data.avatarUrl || ''));
    }

    if (fields.length === 0) {
      throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);
    }

    values.push(adminId);
    await this.dataSource.query(
      `UPDATE \`sys_admin\` SET ${fields.join(', ')} WHERE \`id\` = ?`,
      values
    );

    return { success: true };
  }

  /** 修改密码 */
  async updatePassword(id: number, oldPassword: string, newPassword: string) {
    const [admin] = await this.dataSource.query<Pick<AdminRow, 'password'>[]>(
      'SELECT `password` FROM `sys_admin` WHERE `id` = ?',
      [id]
    );

    if (!admin) {
      throw new HttpException('管理员不存在', HttpStatus.NOT_FOUND);
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, admin.password);
    if (!isPasswordValid) {
      throw new HttpException('原密码错误', HttpStatus.UNAUTHORIZED);
    }

    // 新密码需满足当前密码策略
    const policyError = await this.securityService.validatePassword(newPassword);
    if (policyError) {
      throw new HttpException(policyError, HttpStatus.BAD_REQUEST);
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await this.dataSource.query('UPDATE `sys_admin` SET `password` = ? WHERE `id` = ?', [hash, id]);

    return { success: true };
  }

  /** 获取管理员绑定的家族列表（代数实时统计覆盖静态 gen_count） */
  async getFamilies(adminId: number) {
    const rows = await this.dataSource.query<
      { id: number; name: string; surname_id: number; member_count: number; gen_count: number }[]
    >(
      'SELECT f.`id`, f.`name`, f.`surname_id`, f.`member_count`, f.`gen_count` FROM `sys_admin_family` saf INNER JOIN `family` f ON f.`id` = saf.`family_id` WHERE saf.`admin_id` = ?',
      [adminId]
    );
    // 代数：基于家族成员分表实时统计 MAX(generation)，分表缺失时回退静态字段
    const genRows = await Promise.all(
      rows.map(async row => {
        const tableName = getSafeMemberTableName(row.id);
        try {
          const [r] = await this.dataSource.query<{ max_gen: number | string | null }[]>(
            `SELECT MAX(\`generation\`) AS max_gen FROM \`${tableName}\` WHERE \`status\` = 1`
          );
          return { id: row.id, maxGen: r && r.max_gen != null ? Number(r.max_gen) : null };
        } catch {
          return { id: row.id, maxGen: null };
        }
      })
    );
    const genMap = new Map(genRows.map(g => [g.id, g.maxGen]));
    return rows.map(row => ({
      ...row,
      gen_count: genMap.get(row.id) ?? row.gen_count ?? 0
    }));
  }

  /** 绑定管理员到家族(事务:先删后插,失败回滚避免家族绑定丢失) */
  async bindFamily(adminId: number, familyIds: string[]) {
    // super 管理员不需要限制
    const [admin] = await this.dataSource.query<Pick<AdminRow, 'role'>[]>(
      'SELECT `role` FROM `sys_admin` WHERE `id` = ?',
      [adminId]
    );

    if (!admin) {
      throw new HttpException('管理员不存在', HttpStatus.NOT_FOUND);
    }

    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // 先删除原有绑定
      await queryRunner.query('DELETE FROM `sys_admin_family` WHERE `admin_id` = ?', [adminId]);

      // 插入新绑定
      if (familyIds.length > 0) {
        const placeholders = familyIds.map(() => '(?, ?)').join(', ');
        const values: QueryValues = [];
        familyIds.forEach(fid => { values.push(adminId, fid); });
        await queryRunner.query(
          `INSERT INTO \`sys_admin_family\` (\`admin_id\`, \`family_id\`) VALUES ${placeholders}`,
          values
        );
      }

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      throw new HttpException(errMsg(err), HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      await queryRunner.release();
    }
  }
}

function errMsg(err: unknown): string {
  if (err instanceof HttpException) {
    return err.message;
  }
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return '家族绑定失败';
}

interface InsertResult extends DataRow {
  insertId: number;
}
