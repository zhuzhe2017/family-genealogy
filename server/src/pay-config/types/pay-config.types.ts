/** 支付服务商 */
export type PayProvider = 'wxpay' | 'alipay';

/** 微信支付配置 */
export interface WxPayConfig {
  enabled: boolean;
  /** 公众号/小程序 AppId */
  appId: string;
  /** 微信支付商户号 */
  mchId: string;
  /** 商户证书序列号 */
  mchSerialNo: string;
  /** 商户 API 私钥（PEM） */
  privateKey: string;
  /** API v3 密钥 */
  apiV3Key: string;
  /** 支付回调通知 URL */
  notifyUrl: string;
  /** 微信平台公钥（回调验签用，可选） */
  platformPublicKey: string;
  /** 支付状态通知 URL（可选，业务侧状态同步） */
  statusNotifyUrl?: string;
}

/** 支付宝配置 */
export interface AlipayConfig {
  enabled: boolean;
  appId: string;
  /** 应用私钥（PEM 或 PKCS 格式） */
  privateKey: string;
  /** 支付宝公钥 */
  alipayPublicKey: string;
  /** 支付回调通知 URL */
  notifyUrl: string;
  /** 支付状态通知 URL（可选） */
  statusNotifyUrl?: string;
}

/** 完整支付配置 */
export interface PayFullConfig {
  provider: PayProvider;
  wxpay: WxPayConfig;
  alipay: AlipayConfig;
}

/** 配置变更项（用于 diff 日志） */
export interface PayConfigChange {
  provider: PayProvider;
  field: string;
  oldValue: string;
  newValue: string;
}

/** 支付连通性测试结果 */
export interface PayTestResult {
  success: boolean;
  message: string;
  checkedAt: string;
}
