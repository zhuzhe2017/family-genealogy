import { SetMetadata } from '@nestjs/common';
import { Capability } from '../types/membership.types';

export const ENTITLEMENT_KEY = 'entitlement';
export const ENTITLEMENT_WRITABLE_KEY = 'entitlementWritable';

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

export interface WritableMetadata {
  familyFrom: string;
}

/**
 * 订阅可写校验装饰器：仅校验订阅状态（active/grace 可写，expired/frozen 到期只读），
 * 不检查具体能力点。用于不绑定单一能力点的基础写操作（成员/内容管理、设置修改等）。
 * 用法：@Writable()（familyId 默认取 param:familyId）
 */
export const Writable = (options?: EntitlementOptions) =>
  SetMetadata(ENTITLEMENT_WRITABLE_KEY, {
    familyFrom: options?.familyFrom ?? 'param:familyId'
  } satisfies WritableMetadata);
