import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomInt } from 'crypto';
import { DataSource } from 'typeorm';
import { type QueryValues } from '../common/types/common';

/** 短信验证码场景 */
export type SmsScene = 'login' | 'bind';

/** 短信验证码记录 */
export interface SmsCodeRow {
  id: number;
  phone: string;
  scene: SmsScene;
  code_hash: string;
  expires_at: Date;
  attempts: number;
  used: number;
  create_time: Date;
}

/** 短信发送提供方接口：接入阿里云/腾讯云等只需实现此接口 */
export interface SmsProvider {
  /** 发送验证码短信 */
  send(phone: string, code: string): Promise<void>;
}

/**
 * 开发模式提供方：不真实发送，仅控制台打印；
 * 由接口层将验证码原样返回（devCode）便于本地联调
 */
class MockSmsProvider implements SmsProvider {
  send(phone: string, code: string): Promise<void> {
    console.log(`[SMS-MOCK] 向 ${phone} 发送验证码: ${code}`);
    return Promise.resolve();
  }
}

/** 未接入真实短信服务商时的占位提供方 */
class NotConfiguredSmsProvider implements SmsProvider {
  send(): Promise<void> {
    return Promise.reject(new HttpException('短信服务未配置（SMS_PROVIDER=aliyun/tencent 且需填写密钥）', HttpStatus.SERVICE_UNAVAILABLE));
  }
}

/**
 * 阿里云短信提供方（SendSms API）
 * 文档：https://help.aliyun.com/document_detail/101414.html
 * 需要配置：SMS_ALIYUN_ACCESS_KEY_ID / SMS_ALIYUN_ACCESS_KEY_SECRET / SMS_ALIYUN_SIGN_NAME / SMS_ALIYUN_TEMPLATE_CODE
 */
class AliyunSmsProvider implements SmsProvider {
  private readonly logger = new Logger(AliyunSmsProvider.name);
  private readonly accessKeyId: string;
  private readonly accessKeySecret: string;
  private readonly signName: string;
  private readonly templateCode: string;
  private readonly endpoint = 'https://dysmsapi.aliyuncs.com';

  constructor(configService: ConfigService) {
    this.accessKeyId = configService.get<string>('SMS_ALIYUN_ACCESS_KEY_ID') || '';
    this.accessKeySecret = configService.get<string>('SMS_ALIYUN_ACCESS_KEY_SECRET') || '';
    this.signName = configService.get<string>('SMS_ALIYUN_SIGN_NAME') || '';
    this.templateCode = configService.get<string>('SMS_ALIYUN_TEMPLATE_CODE') || '';
  }

  /** 配置是否齐全 */
  isConfigured(): boolean {
    return Boolean(this.accessKeyId && this.accessKeySecret && this.signName && this.templateCode);
  }

  async send(phone: string, code: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new HttpException('阿里云短信配置不完整（需 SMS_ALIYUN_ACCESS_KEY_ID/SECRET/SIGN_NAME/TEMPLATE_CODE）', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const params: Record<string, string> = {
      AccessKeyId: this.accessKeyId,
      Action: 'SendSms',
      Format: 'JSON',
      PhoneNumbers: phone,
      RegionId: 'cn-hangzhou',
      SignName: this.signName,
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: `${Date.now()}${randomInt(100000, 999999)}`,
      SignatureVersion: '1.0',
      TemplateCode: this.templateCode,
      TemplateParam: JSON.stringify({ code }),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      Version: '2017-05-25'
    };

    // 按参数名排序并构造待签字符串
    const sortedKeys = Object.keys(params).sort();
    const canonicalized = sortedKeys.map(k => `${this.percentEncode(k)}=${this.percentEncode(params[k])}`).join('&');
    const stringToSign = `GET&%2F&${this.percentEncode(canonicalized)}`;
    const signature = createHmac('sha1', `${this.accessKeySecret}&`).update(stringToSign).digest('base64');
    const url = `${this.endpoint}/?Signature=${this.percentEncode(signature)}&${canonicalized}`;

    const resp = await fetch(url, { method: 'GET' });
    const data = await resp.json() as { Code?: string; Message?: string };
    if (data.Code !== 'OK') {
      this.logger.error(`阿里云短信发送失败: ${data.Code} - ${data.Message}`);
      throw new HttpException(`短信发送失败: ${data.Message || data.Code}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** RFC3986 URL 编码（阿里云要求特殊字符也编码） */
  private percentEncode(str: string): string {
    return encodeURIComponent(str)
      .replace(/\+/g, '%20')
      .replace(/\*/g, '%2A')
      .replace(/%7E/g, '~');
  }
}

/**
 * 腾讯云短信提供方（SendSms API）
 * 文档：https://cloud.tencent.com/document/product/382/55981
 * 需要配置：SMS_TENCENT_SECRET_ID / SMS_TENCENT_SECRET_KEY / SMS_TENCENT_SDK_APP_ID / SMS_TENCENT_SIGN_NAME / SMS_TENCENT_TEMPLATE_ID
 */
class TencentSmsProvider implements SmsProvider {
  private readonly logger = new Logger(TencentSmsProvider.name);
  private readonly secretId: string;
  private readonly secretKey: string;
  private readonly sdkAppId: string;
  private readonly signName: string;
  private readonly templateId: string;
  private readonly endpoint = 'sms.tencentcloudapi.com';
  private readonly service = 'sms';
  private readonly version = '2021-01-11';
  private readonly region = 'ap-guangzhou';

  constructor(configService: ConfigService) {
    this.secretId = configService.get<string>('SMS_TENCENT_SECRET_ID') || '';
    this.secretKey = configService.get<string>('SMS_TENCENT_SECRET_KEY') || '';
    this.sdkAppId = configService.get<string>('SMS_TENCENT_SDK_APP_ID') || '';
    this.signName = configService.get<string>('SMS_TENCENT_SIGN_NAME') || '';
    this.templateId = configService.get<string>('SMS_TENCENT_TEMPLATE_ID') || '';
  }

  /** 配置是否齐全 */
  isConfigured(): boolean {
    return Boolean(this.secretId && this.secretKey && this.sdkAppId && this.signName && this.templateId);
  }

  async send(phone: string, code: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new HttpException('腾讯云短信配置不完整（需 SMS_TENCENT_SECRET_ID/KEY/SDK_APP_ID/SIGN_NAME/TEMPLATE_ID）', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const payload = {
      PhoneNumberSet: [phone],
      SmsSdkAppId: this.sdkAppId,
      SignName: this.signName,
      TemplateId: this.templateId,
      TemplateParamSet: [code]
    };
    const body = JSON.stringify(payload);
    const hashedPayload = createHash('sha256').update(body).digest('hex');

    // TC3-HMAC-SHA256 签名
    const signedHeaders = 'content-type;host';
    const canonicalRequest = [
      'POST',
      '/',
      '',
      `content-type:application/json; charset=utf-8\nhost:${this.endpoint}\n`,
      signedHeaders,
      hashedPayload
    ].join('\n');
    const hashedCanonicalRequest = createHash('sha256').update(canonicalRequest).digest('hex');
    const date = new Date().toISOString().slice(0, 10);
    const credentialScope = `${date}/${this.service}/tc3_request`;
    const stringToSign = [
      'TC3-HMAC-SHA256',
      timestamp,
      credentialScope,
      hashedCanonicalRequest
    ].join('\n');

    const secretDate = createHmac('sha256', `TC3${this.secretKey}`).update(date).digest();
    const secretService = createHmac('sha256', secretDate).update(this.service).digest();
    const secretSigning = createHmac('sha256', secretService).update('tc3_request').digest();
    const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

    const authorization = `TC3-HMAC-SHA256 Credential=${this.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const resp = await fetch(`https://${this.endpoint}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Host: this.endpoint,
        'X-TC-Action': 'SendSms',
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Version': this.version,
        'X-TC-Region': this.region,
        Authorization: authorization
      },
      body
    });

    const data = await resp.json() as { Response?: { Error?: { Code?: string; Message?: string }; SendStatusSet?: Array<{ Code?: string; Message?: string }> } };
    const err = data.Response?.Error;
    if (err) {
      this.logger.error(`腾讯云短信发送失败: ${err.Code} - ${err.Message}`);
      throw new HttpException(`短信发送失败: ${err.Message || err.Code}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    const sendStatus = data.Response?.SendStatusSet?.[0];
    if (sendStatus?.Code !== 'Ok') {
      this.logger.error(`腾讯云短信发送状态异常: ${sendStatus?.Code} - ${sendStatus?.Message}`);
      throw new HttpException(`短信发送失败: ${sendStatus?.Message || sendStatus?.Code}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

@Injectable()
export class SmsService {
  /** 验证码有效期(毫秒) */
  static readonly CODE_TTL_MS = 5 * 60 * 1000;
  /** 同一手机号重发间隔(毫秒) */
  static readonly RESEND_INTERVAL_MS = 60 * 1000;
  /** 同一手机号每日发送上限 */
  static readonly DAILY_LIMIT = 10;
  /** 单条验证码最大尝试次数 */
  static readonly MAX_ATTEMPTS = 5;

  private readonly provider: SmsProvider;
  /** 是否开发模式（真实发送未启用），接口层据此返回 devCode */
  readonly isMock: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource
  ) {
    const providerName = this.configService.get<string>('SMS_PROVIDER', 'mock').toLowerCase();
    this.isMock = providerName === 'mock' || providerName === '';

    if (this.isMock) {
      this.provider = new MockSmsProvider();
    } else if (providerName === 'aliyun') {
      this.provider = new AliyunSmsProvider(configService);
    } else if (providerName === 'tencent') {
      this.provider = new TencentSmsProvider(configService);
    } else {
      this.provider = new NotConfiguredSmsProvider();
    }
  }

  /** 生成 6 位数字验证码 */
  private genCode(): string {
    return String(randomInt(100000, 1000000));
  }

  /** 验证码哈希（存库用 SHA-256） */
  private hashCode(phone: string, code: string): string {
    return createHash('sha256').update(`${phone}:${code}`).digest('hex');
  }

  /**
   * 发送验证码
   * - 手机号格式校验由调用方完成
   * - 频控：60s 重发间隔 + 单号每日上限
   * 返回验证码本身（仅开发模式真实返回，生产返回空串）
   */
  async sendCode(phone: string, scene: SmsScene): Promise<string> {
    const now = new Date();
    // 重发间隔：查该手机号该场景最近一条
    const [recent] = await this.dataSource.query<SmsCodeRow[]>(
      'SELECT `create_time` FROM `user_sms_code` WHERE `phone` = ? AND `scene` = ? ORDER BY `id` DESC LIMIT 1',
      [phone, scene] as QueryValues
    );
    if (recent && now.getTime() - new Date(recent.create_time).getTime() < SmsService.RESEND_INTERVAL_MS) {
      throw new HttpException('发送过于频繁，请 60 秒后再试', HttpStatus.TOO_MANY_REQUESTS);
    }

    // 每日上限：统计当天发送条数
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const [countRow] = await this.dataSource.query<{ cnt: number }[]>(
      'SELECT COUNT(*) AS cnt FROM `user_sms_code` WHERE `phone` = ? AND `scene` = ? AND `create_time` >= ?',
      [phone, scene, dayStart] as QueryValues
    );
    if ((countRow?.cnt ?? 0) >= SmsService.DAILY_LIMIT) {
      throw new HttpException('今日验证码发送次数已达上限', HttpStatus.TOO_MANY_REQUESTS);
    }

    // 作废旧码（防堆积），生成新码
    await this.dataSource.query(
      'UPDATE `user_sms_code` SET `used` = 1 WHERE `phone` = ? AND `scene` = ? AND `used` = 0',
      [phone, scene] as QueryValues
    );
    const code = this.genCode();
    const expiresAt = new Date(now.getTime() + SmsService.CODE_TTL_MS);
    await this.dataSource.query(
      'INSERT INTO `user_sms_code` (`phone`, `scene`, `code_hash`, `expires_at`) VALUES (?, ?, ?, ?)',
      [phone, scene, this.hashCode(phone, code), expiresAt] as QueryValues
    );

    await this.provider.send(phone, code);
    // 开发模式把码返回给调用方，便于本地联调
    return this.isMock ? code : '';
  }

  /**
   * 校验验证码（一次性消费）
   * - 取该手机号该场景最新一条未使用记录
   * - 校验过期、尝试次数、哈希一致
   */
  async verifyCode(phone: string, scene: SmsScene, code: string): Promise<boolean> {
    const [record] = await this.dataSource.query<SmsCodeRow[]>(
      'SELECT * FROM `user_sms_code` WHERE `phone` = ? AND `scene` = ? AND `used` = 0 ORDER BY `id` DESC LIMIT 1',
      [phone, scene] as QueryValues
    );
    if (!record) {
      throw new HttpException('验证码不存在，请重新获取', HttpStatus.BAD_REQUEST);
    }
    if (new Date(record.expires_at).getTime() < Date.now()) {
      throw new HttpException('验证码已过期，请重新获取', HttpStatus.BAD_REQUEST);
    }
    if (record.attempts >= SmsService.MAX_ATTEMPTS) {
      throw new HttpException('尝试次数过多，验证码已失效，请重新获取', HttpStatus.BAD_REQUEST);
    }
    if (record.code_hash !== this.hashCode(phone, code)) {
      const attempts = record.attempts + 1;
      await this.dataSource.query(
        'UPDATE `user_sms_code` SET `attempts` = ? WHERE `id` = ?',
        [attempts, record.id] as QueryValues
      );
      if (attempts >= SmsService.MAX_ATTEMPTS) {
        await this.dataSource.query('UPDATE `user_sms_code` SET `used` = 1 WHERE `id` = ?', [record.id] as QueryValues);
      }
      throw new HttpException('验证码错误', HttpStatus.BAD_REQUEST);
    }

    await this.dataSource.query('UPDATE `user_sms_code` SET `used` = 1 WHERE `id` = ?', [record.id] as QueryValues);
    return true;
  }
}
