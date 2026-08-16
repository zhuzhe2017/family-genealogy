import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../common/types/common';
import { EntitlementService } from '../membership.service';
import { ENTITLEMENT_KEY, type EntitlementMetadata } from '../decorators/entitlement.decorator';
import { EntitlementException, ENTITLEMENT_ERRORS } from '../membership.exception';

/**
 * 权益校验守卫（认证 → 授权 → 权益 三层中的第三层）：
 * 读取 @Entitlement(capability) 元数据，解析 familyId，调用 EntitlementService.assertCapability。
 * 仅拦截标注了能力点的接口；未标注的接口直接放行。
 */
@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementService: EntitlementService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<EntitlementMetadata>(ENTITLEMENT_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!meta) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const familyId = this.resolveFamilyId(request, meta.familyFrom);
    if (!familyId) {
      throw new EntitlementException(ENTITLEMENT_ERRORS.GENERIC, '无法确定所属家族，权益校验失败');
    }

    await this.entitlementService.assertCapability(familyId, meta.capability);
    return true;
  }

  /** 按 familyFrom 配置（param/query/body/header）解析家族 ID */
  private resolveFamilyId(request: AuthenticatedRequest, from: string): number | undefined {
    const [location, key] = from.split(':');
    const value =
      location === 'param'
        ? request.params?.[key]
        : location === 'query'
          ? request.query?.[key]
          : location === 'body'
            ? request.body?.[key]
            : location === 'header'
              ? request.headers?.[key]
              : undefined;

    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  }
}
