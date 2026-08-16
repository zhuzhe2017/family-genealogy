import { SetMetadata } from '@nestjs/common';
import { Capability } from '../types/membership.types';

export const ENTITLEMENT_KEY = 'entitlement';

export interface EntitlementOptions {
  /**
   * familyId 取值位置，格式 `<location>:<key>`，默认 `param:familyId`
   * 支持：param / query / body / header
   */
  familyFrom?: string;
}

export interface EntitlementMetadata {
  capability: Capability;
  familyFrom: string;
}

/**
 * 声明式权益校验装饰器：标注接口所需能力点，由 EntitlementGuard 执行校验。
 * 用法：
 *   @Entitlement(Capability.Backup)
 *   @Entitlement(Capability.AiRestore, { familyFrom: 'body:familyId' })
 */
export const Entitlement = (capability: Capability, options?: EntitlementOptions) =>
  SetMetadata(ENTITLEMENT_KEY, {
    capability,
    familyFrom: options?.familyFrom ?? 'param:familyId'
  } satisfies EntitlementMetadata);
