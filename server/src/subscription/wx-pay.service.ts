import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign, createDecipheriv, randomBytes, randomInt } from 'crypto';
import { type WechatNotifyBody, type WechatNotifyResource, type WxPayParams } from './types/subscription.types';

/** 微信支付 API v3 基础地址 */
const WXPAY_BASE = 'https://api.mch.weixin.qq.com';

/** 回调通知 AAD 标识（与微信约定一致） */
const NOTIFY_ASSOCIATED_DATA = 'transaction';

export interface JsapiPrepayInput {
  outTradeNo: string;
  description: string;
  /** 金额（分） */
  amountFen: number;
  openid: string;
}

export interface RefundInput {
  outTradeNo: string;
  refundNo: string;
  reason: string;
  /** 退款金额（分） */
  refundFen: number;
  /** 订单原金额（分） */
  totalFen: number;
}

/**
 * 微信支付 API v3 封装（手写签名，无第三方 SDK）：
 * - JSAPI 下单 + 小程序二次签名（wx.requestPayment 参数）
 * - 退款
 * - 回调通知解密（AEAD_AES_256_GCM）
 * 商户配置缺失时 isConfigured() 返回 false，由业务层进入开发模拟模式。
 */
@Injectable()
export class WxPayService {
  private readonly logger = new Logger(WxPayService.name);

  private readonly appId: string;
  private readonly mchId: string;
  private readonly serialNo: string;
  private readonly privateKey: string;
  private readonly apiV3Key: string;
  private readonly notifyUrl: string;

  constructor(configService: ConfigService) {
    this.appId = configService.get<string>('WX_APPID') || '';
    this.mchId = configService.get<string>('WX_MCH_ID') || '';
    this.serialNo = configService.get<string>('WX_MCH_SERIAL_NO') || '';
    this.privateKey = configService.get<string>('WX_MCH_PRIVATE_KEY') || '';
    this.apiV3Key = configService.get<string>('WX_PAY_API_V3_KEY') || '';
    this.notifyUrl = configService.get<string>('WX_PAY_NOTIFY_URL') || '';
  }

  /** 商户配置是否齐全（不齐全时业务层走开发模拟支付） */
  isConfigured(): boolean {
    return Boolean(
      this.appId && this.mchId && this.serialNo && this.privateKey && this.apiV3Key && this.notifyUrl
    );
  }

  /** JSAPI 下单，返回 prepay_id 与小程序支付参数 */
  async jsapiPrepay(input: JsapiPrepayInput): Promise<{ prepayId: string; payParams: WxPayParams }> {
    const path = '/v3/pay/transactions/jsapi';
    const body = JSON.stringify({
      appid: this.appId,
      mchid: this.mchId,
      description: input.description,
      out_trade_no: input.outTradeNo,
      notify_url: this.notifyUrl,
      amount: { total: input.amountFen, currency: 'CNY' },
      payer: { openid: input.openid }
    });

    const resp = await this.request('POST', path, body);
    if (!resp.ok) {
      const text = await resp.text();
      this.logger.error(`微信下单失败 ${resp.status}: ${text}`);
      throw new Error(`微信下单失败（${resp.status}）`);
    }
    const data = (await resp.json()) as { prepay_id: string };
    return { prepayId: data.prepay_id, payParams: this.buildPayParams(data.prepay_id) };
  }

  /** 退款（成功表示微信已受理） */
  async refund(input: RefundInput): Promise<void> {
    const path = '/v3/refund/domestic/refunds';
    const body = JSON.stringify({
      out_trade_no: input.outTradeNo,
      out_refund_no: input.refundNo,
      reason: input.reason || '用户申请退款',
      amount: { refund: input.refundFen, total: input.totalFen, currency: 'CNY' }
    });

    const resp = await this.request('POST', path, body);
    if (!resp.ok) {
      const text = await resp.text();
      this.logger.error(`微信退款失败 ${resp.status}: ${text}`);
      throw new Error(`微信退款失败（${resp.status}）`);
    }
  }

  /** 解密回调通知资源（AEAD_AES_256_GCM），解密失败抛错 */
  decryptNotify(body: WechatNotifyBody): WechatNotifyResource {
    const { ciphertext, nonce, associated_data } = body.resource;
    const key = Buffer.from(this.apiV3Key, 'utf8');
    const buf = Buffer.from(ciphertext, 'base64');

    // 微信约定：密文尾部 16 字节为 GCM 认证标签
    const authTag = buf.subarray(buf.length - 16);
    const data = buf.subarray(0, buf.length - 16);

    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'));
    decipher.setAuthTag(authTag);
    if (associated_data) {
      decipher.setAAD(Buffer.from(associated_data, 'utf8'));
    }

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return JSON.parse(decrypted) as WechatNotifyResource;
  }

  /** 构造小程序 wx.requestPayment 二次签名参数 */
  private buildPayParams(prepayId: string): WxPayParams {
    const timeStamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = randomBytes(16).toString('hex');
    const pkg = `prepay_id=${prepayId}`;
    const message = `${this.appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;
    return { timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign: this.sign(message) };
  }

  /** 发起带商户签名的 API v3 请求 */
  private async request(method: string, urlPath: string, body: string): Promise<Response> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(16).toString('hex');
    const signature = this.sign(`${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`);
    const authorization =
      `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",` +
      `nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${this.serialNo}"`;

    return fetch(`${WXPAY_BASE}${urlPath}`, {
      method,
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body
    });
  }

  /** 商户私钥 RSA-SHA256 签名 */
  private sign(message: string): string {
    const signer = createSign('RSA-SHA256');
    signer.update(message);
    signer.end();
    return signer.sign(this.privateKey, 'base64');
  }

  /** 生成商户订单号/退款单号（时间戳+随机数，唯一） */
  generateNo(prefix = ''): string {
    return `${prefix}${Date.now()}${randomInt(100000, 999999)}`;
  }
}

export { NOTIFY_ASSOCIATED_DATA };
