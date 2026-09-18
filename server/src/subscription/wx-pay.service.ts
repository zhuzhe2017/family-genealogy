import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign, createVerify, createDecipheriv, randomBytes, randomInt } from 'crypto';
import { type WechatNotifyBody, type WechatNotifyResource, type WxPayParams } from './types/subscription.types';
import { PayConfigService } from '../pay-config/pay-config.service';

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

  private appId: string;
  private mchId: string;
  private serialNo: string;
  private privateKey: string;
  private apiV3Key: string;
  private notifyUrl: string;
  /** 微信平台公钥（用于回调验签，可选；未配置时退化为仅解密校验） */
  private platformPublicKey: string;

  /** 惰性加载标记：首次使用前从数据库拉取支付配置（DB 优先，env 回退） */
  private configLoaded = false;
  private configLoadPromise: Promise<void> | null = null;

  constructor(
    configService: ConfigService,
    private readonly payConfigService: PayConfigService
  ) {
    // 环境变量作为回退兜底
    this.appId = configService.get<string>('WX_APPID') || '';
    this.mchId = configService.get<string>('WX_MCH_ID') || '';
    this.serialNo = configService.get<string>('WX_MCH_SERIAL_NO') || '';
    this.privateKey = configService.get<string>('WX_MCH_PRIVATE_KEY') || '';
    this.apiV3Key = configService.get<string>('WX_PAY_API_V3_KEY') || '';
    this.notifyUrl = configService.get<string>('WX_PAY_NOTIFY_URL') || '';
    this.platformPublicKey = configService.get<string>('WX_PAY_PLATFORM_PUBLIC_KEY') || '';
  }

  /** 从数据库加载支付配置（覆盖环境变量），仅首次调用时执行 */
  private async ensureConfigLoaded(): Promise<void> {
    if (this.configLoaded) return;
    if (!this.configLoadPromise) {
      this.configLoadPromise = (async () => {
        try {
          const dbConfig = await this.payConfigService.getActiveWxPayConfig();
          if (dbConfig) {
            this.appId = dbConfig.appId || this.appId;
            this.mchId = dbConfig.mchId || this.mchId;
            this.serialNo = dbConfig.mchSerialNo || this.serialNo;
            this.privateKey = dbConfig.privateKey || this.privateKey;
            this.apiV3Key = dbConfig.apiV3Key || this.apiV3Key;
            this.notifyUrl = dbConfig.notifyUrl || this.notifyUrl;
            this.platformPublicKey = dbConfig.platformPublicKey || this.platformPublicKey;
          }
        } catch (err) {
          this.logger.warn(`从数据库加载微信支付配置失败，回退环境变量: ${err instanceof Error ? err.message : err}`);
        } finally {
          this.configLoaded = true;
        }
      })();
    }
    await this.configLoadPromise;
  }

  /** 商户配置是否齐全（不齐全时业务层走开发模拟支付） */
  async isConfigured(): Promise<boolean> {
    await this.ensureConfigLoaded();
    return Boolean(
      this.appId && this.mchId && this.serialNo && this.privateKey && this.apiV3Key && this.notifyUrl
    );
  }

  /** 是否已配置微信平台公钥（用于回调验签） */
  async hasPlatformPublicKey(): Promise<boolean> {
    await this.ensureConfigLoaded();
    return Boolean(this.platformPublicKey);
  }

  /**
   * 校验微信支付回调通知签名（Wechatpay-Signature）。
   * 待验签串 = timestamp\nnonce\nbody\n，用微信平台公钥验 RSA-SHA256 签名。
   * 未配置平台公钥时跳过验签（仅依赖解密 GCM 认证），并输出告警日志。
   */
  async verifyNotifySignature(headers: Record<string, string | string[] | undefined>, rawBody: string): Promise<boolean> {
    await this.ensureConfigLoaded();
    if (!this.platformPublicKey) {
      this.logger.warn('未配置 WX_PAY_PLATFORM_PUBLIC_KEY，回调验签已跳过（仅解密校验）。生产环境建议配置以提升安全性');
      return true;
    }
    const pick = (v: string | string[] | undefined): string =>
      Array.isArray(v) ? (v[0] || '') : (v || '');
    const timestamp = pick(headers['wechatpay-timestamp']);
    const nonce = pick(headers['wechatpay-nonce']);
    const signature = pick(headers['wechatpay-signature']);
    if (!timestamp || !nonce || !signature) {
      this.logger.warn('回调缺少 wechatpay-timestamp/nonce/signature 头，验签失败');
      return false;
    }
    // 防重放：时间戳与当前时间偏差超过 5 分钟拒绝
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      this.logger.warn(`回调时间戳偏差过大（ts=${timestamp}），验签失败`);
      return false;
    }
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
    const verifier = createVerify('RSA-SHA256');
    verifier.update(message);
    verifier.end();
    const ok = verifier.verify(this.platformPublicKey, signature, 'base64');
    if (!ok) {
      this.logger.warn('回调 Wechatpay-Signature 验签失败');
    }
    return ok;
  }

  /** JSAPI 下单，返回 prepay_id 与小程序支付参数 */
  async jsapiPrepay(input: JsapiPrepayInput): Promise<{ prepayId: string; payParams: WxPayParams }> {
    await this.ensureConfigLoaded();
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
    await this.ensureConfigLoaded();
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
    // apiV3Key 由环境变量兜底，ensureConfigLoaded 在 isConfigured 前已调用
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
