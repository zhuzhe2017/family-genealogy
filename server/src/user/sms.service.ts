import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'crypto';
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
  async send(phone: string, code: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[SMS-MOCK] 向 ${phone} 发送验证码: ${code}`);
  }
}

/** 未接入真实短信服务商时的占位提供方 */
class NotConfiguredSmsProvider implements SmsProvider {
  async send(): Promise<void> {
    throw new HttpException('短信服务未配置（SMS_PROVIDER=aliyun/tencent 且需填写密钥）', HttpStatus.SERVICE_UNAVAILABLE);
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
    this.provider = this.isMock ? new MockSmsProvider() : new NotConfiguredSmsProvider();
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
