import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 全局 JWT 守卫：同时支持后台 admin 令牌(type='admin')和小程序 user 令牌(type='user')。
 * 两个 Strategy 的 validate 已做类型隔离：不匹配返回 null 让下一个策略尝试，
 * handleRequest 拿到有效 user 就放行，无需区分来源。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard(['jwt', 'user-jwt']) {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser | null | undefined): TUser {
    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException('登录已过期，请重新登录');
    }
    return user;
  }
}
