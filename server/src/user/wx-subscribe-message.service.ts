import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { type QueryValues } from '../common/types/common';

/** 将 unknown 值安全转换为字符串（null/undefined → ''，字符串原样返回，其余 JSON 序列化） */
function toStr(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return JSON.stringify(value) ?? '';
}

/** 订阅消息场景（与数据库 scene 字段对应） */
export type SubscribeScene = 'renewal_reminder';

/** 订阅消息授权记录 */
interface SubscribeAuthRow {
  id: number;
  user_id: string;
  openid: string;
  tmpl_id: string;
  scene: string;
  status: number;
  expire_at: Date | null;
}

/**
 * 微信订阅消息服务
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/mp-message-management/subscribe-message/sendMessage.html
 *
 * 使用流程：
 * 1. 小程序端调用 wx.requestSubscribeMessage 请求用户授权（ tmplIds ）
 * 2. 授权成功后调用 POST /user/subscribe-message/record 记录授权
 * 3. 后端在业务场景（如续费提醒）中调用 send() 发送订阅消息
 * 4. 每次发送消耗一条授权记录（status=0），微信规则：用户每授权一次可接收一条
 *
 * 环境变量：
 * - WX_APPID / WX_SECRET：小程序凭证（与登录共用）
 * - WX_SUBSCRIBE_TMPL_RENEWAL：续费提醒模板ID（需在微信公众平台申请）
 */
@Injectable()
export class WxSubscribeMessageService {
  private readonly logger = new Logger(WxSubscribeMessageService.name);
  private readonly tmplRenewal: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource
  ) {
    this.tmplRenewal = this.configService.get<string>('WX_SUBSCRIBE_TMPL_RENEWAL') || '';
  }

  /** 是否已配置订阅消息模板 */
  isConfigured(): boolean {
    return Boolean(this.tmplRenewal);
  }

  /** 获取指定场景的可用授权数量 */
  async getAvailableCount(userId: string, scene: SubscribeScene): Promise<number> {
    const [row] = await this.dataSource.query<{ cnt: number }[]>(
      'SELECT COUNT(*) AS cnt FROM `user_subscribe_message` WHERE `user_id` = ? AND `scene` = ? AND `status` = 1 AND (`expire_at` IS NULL OR `expire_at` > NOW())',
      [userId, scene] as QueryValues
    );
    return row?.cnt ?? 0;
  }

  /**
   * 记录小程序端授权（幂等：同用户同模板已存在可用记录时跳过）
   * 由小程序端在 wx.requestSubscribeMessage 成功后调用
   */
  async recordAuth(userId: string, openid: string, tmplId: string, scene: SubscribeScene): Promise<void> {
    if (!tmplId) {
      throw new HttpException('模板ID不能为空', HttpStatus.BAD_REQUEST);
    }
    // 微信授权有效期最长 7 天
    const expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.dataSource.query(
      'INSERT INTO `user_subscribe_message` (`user_id`, `openid`, `tmpl_id`, `scene`, `expire_at`) VALUES (?, ?, ?, ?, ?)',
      [userId, openid || '', tmplId, scene, expireAt] as QueryValues
    );
    this.logger.log(`用户 ${userId} 授权订阅消息：scene=${scene} tmpl=${tmplId}`);
  }

  /**
   * 发送订阅消息（消耗一条授权记录）
   * @returns 是否发送成功
   */
  async send(userId: string, scene: SubscribeScene, data: Record<string, unknown>): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.warn('微信订阅消息模板未配置（WX_SUBSCRIBE_TMPL_RENEWAL），跳过发送');
      return false;
    }

    // 取一条可用授权
    const [auth] = await this.dataSource.query<SubscribeAuthRow[]>(
      'SELECT * FROM `user_subscribe_message` WHERE `user_id` = ? AND `scene` = ? AND `status` = 1 AND (`expire_at` IS NULL OR `expire_at` > NOW()) ORDER BY `id` LIMIT 1',
      [userId, scene] as QueryValues
    );
    if (!auth) {
      this.logger.warn(`用户 ${userId} 无可用订阅消息授权（scene=${scene}）`);
      return false;
    }

    const openid = auth.openid || await this.getOpenid(userId);
    if (!openid) {
      this.logger.warn(`用户 ${userId} 无 openid，无法发送订阅消息`);
      return false;
    }

    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      this.logger.error('获取微信 access_token 失败，无法发送订阅消息');
      return false;
    }

    try {
      const resp = await fetch(
        `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            touser: openid,
            template_id: auth.tmpl_id,
            data: this.buildTemplateData(data)
          })
        }
      );
      const result = await resp.json() as { errcode?: number; errmsg?: string };
      if (result.errcode !== 0) {
        this.logger.error(`订阅消息发送失败: ${result.errcode} - ${result.errmsg}`);
        // 43101 = 用户未授权，标记该条授权已用完
        if (result.errcode === 43101) {
          await this.consumeAuth(auth.id);
        }
        return false;
      }
      await this.consumeAuth(auth.id);
      this.logger.log(`用户 ${userId} 订阅消息发送成功（scene=${scene}）`);
      return true;
    } catch (err) {
      this.logger.error(`订阅消息发送异常: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** 标记授权已使用（用完即失效） */
  private async consumeAuth(authId: number): Promise<void> {
    await this.dataSource.query(
      'UPDATE `user_subscribe_message` SET `status` = 0, `used_at` = NOW() WHERE `id` = ?',
      [authId] as QueryValues
    );
  }

  /** 获取用户 openid（从 user 表） */
  private async getOpenid(userId: string): Promise<string> {
    const [row] = await this.dataSource.query<{ openid: string }[]>(
      'SELECT `openid` FROM `user` WHERE `id` = ?',
      [userId] as QueryValues
    );
    return row?.openid || '';
  }

  /** 获取微信 access_token（带内存缓存，有效期 7200s） */
  private accessTokenCache: { token: string; expireAt: number } | null = null;

  private async getAccessToken(): Promise<string | null> {
    if (this.accessTokenCache && this.accessTokenCache.expireAt > Date.now()) {
      return this.accessTokenCache.token;
    }
    const appid = this.configService.get<string>('WX_APPID');
    const secret = this.configService.get<string>('WX_SECRET');
    if (!appid || !secret) {
      return null;
    }
    const resp = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`
    );
    const data = await resp.json() as { access_token?: string; expires_in?: number; errcode?: number };
    if (!data.access_token) {
      this.logger.error(`获取 access_token 失败: ${data.errcode}`);
      return null;
    }
    // 提前 5 分钟过期，避免边界问题
    const expireIn = (data.expires_in || 7200) - 300;
    this.accessTokenCache = { token: data.access_token, expireAt: Date.now() + expireIn * 1000 };
    return data.access_token;
  }

  /** 将业务数据转换为微信模板数据格式（所有值转为 string） */
  private buildTemplateData(data: Record<string, unknown>): Record<string, { value: string }> {
    const result: Record<string, { value: string }> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = { value: toStr(value) };
    }
    return result;
  }

  /** 获取续费提醒模板ID（供外部使用） */
  getRenewalTmplId(): string {
    return this.tmplRenewal;
  }
}
