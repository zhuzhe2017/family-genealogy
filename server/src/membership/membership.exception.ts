/**
 * 权益校验业务异常（M1）
 * 与系统通用错误区分：HTTP 200 + 业务码 4xxx，前端据此统一拦截跳转会员中心。
 * AllExceptionsFilter 特判本类型输出 code，见 common/filters/all-exceptions.filter.ts
 */

/** 权益类错误码（与 docs/membership-tech-design.md §10 一致） */
export const ENTITLEMENT_ERRORS = {
  /** 权益校验失败（通用） */
  GENERIC: '4000',
  /** 能力点未解锁，需升级套餐 */
  CAPABILITY_LOCKED: '4001',
  /** 存储空间不足 */
  STORAGE_LIMIT: '4002',
  /** 按次额度已用尽 */
  QUOTA_EXHAUSTED: '4003',
  /** 订阅已过期/冻结，数据只读 */
  SUBSCRIPTION_EXPIRED: '4004',
  /** 支付订单异常 */
  ORDER_INVALID: '4005'
} as const;

export type EntitlementErrorCode = (typeof ENTITLEMENT_ERRORS)[keyof typeof ENTITLEMENT_ERRORS];

export class EntitlementException extends Error {
  constructor(
    public readonly code: EntitlementErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'EntitlementException';
  }
}
