import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DataSource } from 'typeorm';
import { type AuthenticatedRequest, type QueryValues } from '../../common/types/common';

/**
 * 租户后台 JWT 认证守卫
 * 继承 user-jwt 策略，复用 C 端用户登录态
 */
@Injectable()
export class TenantJwtAuthGuard extends AuthGuard('user-jwt') {}

/**
 * 租户后台权限守卫
 * 校验当前用户是否对指定家族拥有管理员/创建者权限
 */
@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = req.user?.id;

    if (!userId) {
      throw new ForbiddenException('未登录');
    }

    const familyId = this.extractFamilyId(req);
    if (!familyId) {
      throw new ForbiddenException('缺少家族ID');
    }

    const [permission] = await this.dataSource.query<FamilyPermissionRow[]>(
      'SELECT `family_id`, `user_id`, `role`, `status` FROM `family_permission` WHERE `family_id` = ? AND `user_id` = ?',
      [familyId, userId] as QueryValues
    );

    if (!permission || permission.status !== 1) {
      throw new ForbiddenException('您不是该家族成员');
    }

    if (!['admin', 'creator'].includes(permission.role)) {
      throw new ForbiddenException('需要家族管理员权限');
    }

    // 将租户上下文注入请求，供后续 service 使用
    (req as TenantAuthenticatedRequest).familyId = familyId;
    (req as TenantAuthenticatedRequest).familyRole = permission.role;

    return true;
  }

  private extractFamilyId(req: AuthenticatedRequest): number | undefined {
    const source =
      req.params?.familyId ?? req.body?.familyId ?? req.query?.familyId ?? req.headers['x-family-id'];

    if (!source) return undefined;
    const value = Number(source);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
}

/** 租户认证请求：在 AuthenticatedRequest 基础上扩展家族上下文 */
export interface TenantAuthenticatedRequest extends AuthenticatedRequest {
  familyId: number;
  familyRole: string;
}

interface FamilyPermissionRow {
  family_id: number;
  user_id: string;
  role: string;
  status: number;
}
