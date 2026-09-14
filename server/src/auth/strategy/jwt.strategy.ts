import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { type AdminRow } from '../../admin/types/admin.types';
import { type QueryValues } from '../../common/types/common';

interface JwtPayload {
  sub: number;
  username: string;
  role: string;
  /** 令牌类型:admin-后台管理员。签发端已写入,用于与 C 端用户令牌(type='user')严格区分 */
  type?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // 必须显式配置 JWT_SECRET,缺失即启动失败,避免静默使用弱密钥
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET')
    });
  }

  async validate(payload: JwtPayload) {
    // 严格校验令牌类型:user 令牌的 sub 是 user 表(VARCHAR)主键,
    // 若不拦截,MySQL 隐式类型转换可能使数字开头的 user.id 撞上同号 sys_admin,造成越权
    // 返回 null 而非抛异常:让 AuthGuard(['jwt','user-jwt']) 多策略数组能尝试完 jwt 后退避到 user-jwt,
    // 否则 passport 把抛异常视为 error,立即终止整个多策略链,用户令牌会被误判为 401 拒绝。
    if (payload.type !== 'admin') {
      return null;
    }

    const [admin] = await this.dataSource.query<AdminRow[]>(
      'SELECT `id`, `username`, `nickname`, `role`, `status` FROM `sys_admin` WHERE `id` = ? AND `status` = 1',
      [payload.sub] as QueryValues
    );

    if (!admin) {
      throw new UnauthorizedException('管理员不存在或已禁用');
    }

    const roles = await this.getAdminRoles(admin.id, admin.role);
    const permissions = await this.getAdminPermissions(admin.id, admin.role);

    return {
      id: admin.id,
      username: admin.username,
      nickname: admin.nickname,
      role: admin.role,
      roles,
      permissions
    };
  }

  /** 获取管理员角色编码列表（兼容 sys_admin.role 字段） */
  private async getAdminRoles(adminId: number, defaultRole: string) {
    const rows: { code: string }[] = await this.dataSource.query(
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
      const rows: { code: string }[] = await this.dataSource.query(
        'SELECT `code` FROM `sys_permission` WHERE `status` = 1'
      );
      return rows.map(row => row.code);
    }

    const rows: { code: string }[] = await this.dataSource.query(
      `SELECT p.\`code\` FROM \`sys_permission\` p
       INNER JOIN \`sys_role_permission\` rp ON rp.\`permission_id\` = p.\`id\`
       INNER JOIN \`sys_admin_role\` ar ON ar.\`role_id\` = rp.\`role_id\`
       WHERE ar.\`admin_id\` = ? AND p.\`status\` = 1`,
      [adminId]
    );

    return [...new Set(rows.map(row => row.code))];
  }
}
