import { request } from '../request';

/** 支付服务商 */
export type PayProvider = 'wxpay' | 'alipay';

/** 微信支付配置 */
export interface WxPayConfig {
  enabled: boolean;
  appId: string;
  mchId: string;
  mchSerialNo: string;
  privateKey: string;
  apiV3Key: string;
  notifyUrl: string;
  platformPublicKey: string;
  statusNotifyUrl?: string;
}

/** 支付宝配置 */
export interface AlipayConfig {
  enabled: boolean;
  appId: string;
  privateKey: string;
  alipayPublicKey: string;
  notifyUrl: string;
  statusNotifyUrl?: string;
}

/** 完整支付配置 */
export interface PayFullConfig {
  provider: PayProvider;
  wxpay: WxPayConfig;
  alipay: AlipayConfig;
}

/** 支付连通性测试结果 */
export interface PayTestResult {
  success: boolean;
  message: string;
  checkedAt: string;
}

/** 获取支付配置 */
export function fetchPayConfig() {
  return request<PayFullConfig>({ url: '/pay-config' });
}

/** 保存支付配置 */
export function fetchSavePayConfig(data: PayFullConfig) {
  return request<{ success: boolean }>({ url: '/pay-config/save', method: 'post', data });
}

/** 测试支付连通性 */
export function fetchTestPayConnection(provider: PayProvider) {
  return request<PayTestResult>({ url: '/pay-config/test', method: 'post', data: { provider } });
}
