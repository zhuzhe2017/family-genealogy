/**
 * 订阅/支付模块类型定义
 * 涉及微信支付 API v3：JSAPI 下单、退款、回调通知解密。
 */

/** subscription_order 行（snake_case） */
export interface SubscriptionOrderRow {
  id: number;
  order_no: string;
  out_trade_no: string;
  family_id: number;
  user_id: string;
  plan_code: string;
  amount: string | number;
  period_months: number;
  status: string;
  transaction_id: string;
  pay_time: Date | string | null;
  refund_time: Date | string | null;
  create_time: Date | string;
}

/** 小程序 wx.requestPayment 参数 */
export interface WxPayParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA';
  paySign: string;
}

/** prepay 结果：mock 模式与真实模式统一结构 */
export interface PrepayResult {
  /** true 表示开发模拟支付（未配置商户号），前端直接提示支付成功 */
  mock: boolean;
  orderNo: string;
  payParams?: WxPayParams;
}

/** 微信支付回调通知 body */
export interface WechatNotifyBody {
  id: string;
  event_type: string;
  resource_type: string;
  resource: {
    algorithm: string;
    ciphertext: string;
    nonce: string;
    associated_data?: string;
  };
}

/** 解密后的通知资源 */
export interface WechatNotifyResource {
  out_trade_no: string;
  transaction_id: string;
  trade_type: string;
  trade_state: string;
  amount?: { total: number; payer_total: number; currency: string };
  success_time?: string;
}

/** 通知处理响应（微信要求格式） */
export interface NotifyResponse {
  code: 'SUCCESS' | 'FAIL';
  message?: string;
}
