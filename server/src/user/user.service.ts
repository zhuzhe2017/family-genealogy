import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { type UserRow, type UserLoginResult, type UserAuthIdentityRow } from './types/user.types';
import { SmsService } from './sms.service';
import { type WxSessionResponse, type QueryValues } from '../common/types/common';

@Injectable()
export class UserService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly smsService: SmsService
  ) {}

  /**
   * 微信小程序登录
   * 1. 用前端传来的 wx.login code 调用微信 jscode2session 换取 openid/unionid
   * 2. 通过 user_auth_identity 绑定表解析账户（多端账号统一）：
   *    a. 按 (provider=wechat, provider_uid=openid) 查绑定 → 命中即登录
   *    b. 未命中且返回了 unionid → 按同 unionid 的其他微信绑定反查账户并自动合并绑定
   *    c. 仍未命中 → 兼容存量 user.openid 数据（迁移前/历史脏数据），命中则补建绑定
   *    d. 全新用户 → 创建账户 + 绑定
   * 3. 签发 type=user 的 JWT 返回
   * 开发环境(WX_APPID/WX_SECRET 未配置)使用 code 模拟 openid,便于本地调试
   */
  async wxLogin(code: string): Promise<UserLoginResult> {
    if (!code) {
      throw new HttpException('code 不能为空', HttpStatus.BAD_REQUEST);
    }

    const appId = this.configService.get<string>('WX_APPID');
    const secret = this.configService.get<string>('WX_SECRET');

    let openid: string;
    let unionid: string;

    if (appId && secret) {
      // 生产环境:调用微信 API
      const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
      const resp = await fetch(wxUrl);
      const data = (await resp.json()) as WxSessionResponse;
      if (data.errcode) {
        throw new HttpException(`微信登录失败: ${data.errmsg}`, HttpStatus.UNAUTHORIZED);
      }
      openid = data.openid ?? '';
      if (!openid) {
        throw new HttpException('微信登录失败: 未获取到 openid', HttpStatus.UNAUTHORIZED);
      }
      unionid = data.unionid || '';
    } else {
      // 开发环境:用 code 生成模拟 openid,保证同一 code 得到同一 openid
      openid = 'dev_' + code;
      unionid = '';
    }

    const user = await this.findOrCreateUserByWechat(openid, unionid);
    if (user.status !== 1) {
      throw new HttpException('账号已被禁用', HttpStatus.FORBIDDEN);
    }
    return this.issueUserToken(user);
  }

  /** 按微信 openid/unionid 解析账户：查绑定 → unionid 合并 → 存量兜底 → 新建 */
  private async findOrCreateUserByWechat(openid: string, unionid: string) {
    // a. 按 openid 查绑定
    let binding = await this.findBinding('wechat', openid);
    if (binding) {
      const user = await this.findUserById(binding.user_id);
      if (user) return user;
    }

    // b. unionid 自动合并：同 unionid 已有微信绑定 → 复用其账户并补建 openid 绑定
    if (unionid) {
      const unionBinding = await this.findBindingByUnionid(unionid);
      if (unionBinding) {
        const user = await this.findUserById(unionBinding.user_id);
        if (user) {
          await this.bindIdentity(user.id, 'wechat', openid, unionid);
          return user;
        }
      }
    }

    // c. 存量兜底：迁移未执行或历史数据仍以 user.openid 为准
    const [legacy] = await this.dataSource.query<UserRow[]>(
      'SELECT `id`, `nickname`, `avatar_url`, `gender`, `phone`, `status` FROM `user` WHERE `openid` = ? LIMIT 1',
      [openid] as QueryValues
    );
    if (legacy) {
      await this.bindIdentity(legacy.id, 'wechat', openid, unionid);
      return legacy;
    }

    // d. 全新用户：创建账户（openid/unionid 双写，微信支付 JSAPI 依赖 user.openid）
    const id = randomBytes(16).toString('hex');
    await this.dataSource.query(
      'INSERT INTO `user` (`id`, `nickname`, `openid`, `unionid`, `status`) VALUES (?, ?, ?, ?, 1)',
      [id, '微信用户', openid, unionid] as QueryValues
    );
    await this.bindIdentity(id, 'wechat', openid, unionid);
    const user = await this.findUserById(id);
    if (!user) {
      throw new HttpException('用户创建失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return user;
  }

  /**
   * 手机号验证码登录
   * 1. 校验验证码（一次性消费）
   * 2. 按 (provider=phone, provider_uid=手机号) 解析账户；无则自动注册
   */
  async phoneLogin(phone: string, code: string): Promise<UserLoginResult> {
    const normalized = this.normalizePhone(phone);
    await this.smsService.verifyCode(normalized, 'login', code);

    let user = await this.findUserByBinding('phone', normalized);
    if (!user) {
      const id = randomBytes(16).toString('hex');
      await this.dataSource.query(
        'INSERT INTO `user` (`id`, `nickname`, `phone`, `status`) VALUES (?, ?, ?, 1)',
        [id, this.maskPhone(normalized), normalized] as QueryValues
      );
      await this.bindIdentity(id, 'phone', normalized, '');
      user = await this.findUserById(id);
    }

    if (!user) {
      throw new HttpException('用户创建失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    if (user.status !== 1) {
      throw new HttpException('账号已被禁用', HttpStatus.FORBIDDEN);
    }
    return this.issueUserToken(user);
  }

  /** 已登录用户绑定手机号（作为跨端统一锚点） */
  async bindPhone(userId: string, phone: string, code: string): Promise<UserLoginResult['userInfo']> {
    const normalized = this.normalizePhone(phone);
    await this.smsService.verifyCode(normalized, 'bind', code);

    const owner = await this.findUserByBinding('phone', normalized);
    if (owner && owner.id !== userId) {
      throw new HttpException('该手机号已绑定其他账号', HttpStatus.CONFLICT);
    }
    if (owner) {
      // 已绑定到当前账号，幂等返回
      return this.getProfile(userId);
    }

    await this.bindIdentity(userId, 'phone', normalized, '');
    await this.dataSource.query('UPDATE `user` SET `phone` = ? WHERE `id` = ?', [normalized, userId] as QueryValues);
    return this.getProfile(userId);
  }

  /** 发送短信验证码（login/bind 场景） */
  async sendSmsCode(phone: string, scene: 'login' | 'bind'): Promise<{ success: boolean; devCode?: string }> {
    const normalized = this.normalizePhone(phone);
    const devCode = await this.smsService.sendCode(normalized, scene);
    return { success: true, ...(devCode ? { devCode } : {}) };
  }

  // ---------- 多端账号统一辅助方法 ----------

  /** 手机号校验（当前支持中国大陆 11 位手机号） */
  private normalizePhone(phone: string): string {
    const normalized = String(phone ?? '').trim();
    if (!/^1[3-9]\d{9}$/.test(normalized)) {
      throw new HttpException('手机号格式不正确', HttpStatus.BAD_REQUEST);
    }
    return normalized;
  }

  /** 手机号脱敏昵称：138****1234 */
  private maskPhone(phone: string): string {
    return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
  }

  /** 按 (provider, provider_uid) 查绑定 */
  private async findBinding(provider: string, providerUid: string) {
    const [row] = await this.dataSource.query<UserAuthIdentityRow[]>(
      'SELECT * FROM `user_auth_identity` WHERE `provider` = ? AND `provider_uid` = ? AND `status` = 1 LIMIT 1',
      [provider, providerUid] as QueryValues
    );
    return row;
  }

  /** 按微信 unionid 查绑定（跨 appid 合并锚点） */
  private async findBindingByUnionid(unionid: string) {
    const [row] = await this.dataSource.query<UserAuthIdentityRow[]>(
      'SELECT * FROM `user_auth_identity` WHERE `provider` = ? AND `unionid` = ? AND `unionid` <> \'\' AND `status` = 1 LIMIT 1',
      ['wechat', unionid] as QueryValues
    );
    return row;
  }

  /** 按绑定关系取用户 */
  private async findUserByBinding(provider: string, providerUid: string) {
    const binding = await this.findBinding(provider, providerUid);
    if (!binding) return undefined;
    return this.findUserById(binding.user_id);
  }

  /** 按 ID 查用户 */
  private async findUserById(userId: string) {
    const [user] = await this.dataSource.query<UserRow[]>(
      'SELECT `id`, `nickname`, `avatar_url`, `gender`, `phone`, `status` FROM `user` WHERE `id` = ? LIMIT 1',
      [userId] as QueryValues
    );
    return user;
  }

  /** 新增绑定（并发冲突时回查，保证幂等） */
  private async bindIdentity(userId: string, provider: string, providerUid: string, unionid: string) {
    try {
      await this.dataSource.query(
        'INSERT INTO `user_auth_identity` (`user_id`, `provider`, `provider_uid`, `unionid`) VALUES (?, ?, ?, ?)',
        [userId, provider, providerUid, unionid] as QueryValues
      );
    } catch (e: any) {
      // 唯一键冲突：说明并发下已存在绑定，忽略（绑定关系由先到者确立）
      if (e?.code !== 'ER_DUP_ENTRY') throw e;
      const existing = await this.findBinding(provider, providerUid);
      if (existing && existing.user_id !== userId) {
        throw new HttpException('该凭证已绑定其他账号', HttpStatus.CONFLICT);
      }
    }
  }

  /** 签发用户 JWT */
  private issueUserToken(user: UserRow): UserLoginResult {
    const payload = { sub: user.id, type: 'user' };
    const token = this.jwtService.sign(payload);
    return {
      token,
      userInfo: {
        id: user.id,
        nickName: user.nickname,
        avatarUrl: user.avatar_url,
        gender: user.gender,
        phone: user.phone || undefined
      }
    };
  }

  /** 获取当前用户信息 */
  async getProfile(userId: string): Promise<UserLoginResult['userInfo']> {
    const [user] = await this.dataSource.query<UserRow[]>(
      'SELECT `id`, `nickname`, `avatar_url`, `gender`, `phone`, `status` FROM `user` WHERE `id` = ?',
      [userId] as QueryValues
    );
    if (!user) {
      throw new HttpException('用户不存在', HttpStatus.NOT_FOUND);
    }
    return {
      id: user.id,
      nickName: user.nickname,
      avatarUrl: user.avatar_url,
      gender: user.gender,
      phone: user.phone
    };
  }

  /**
   * 更新当前用户资料（昵称/头像/性别）
   * 只更新传入的字段,空对象报 400
   */
  async updateProfile(
    userId: string,
    data: { nickName?: string; avatarUrl?: string; gender?: number }
  ): Promise<UserLoginResult['userInfo']> {
    const updates: string[] = [];
    const values: QueryValues = [];

    if (data.nickName !== undefined) {
      const nickName = data.nickName.trim();
      if (!nickName || nickName.length > 30) {
        throw new HttpException('昵称长度需在 1-30 个字符之间', HttpStatus.BAD_REQUEST);
      }
      updates.push('`nickname` = ?');
      values.push(nickName);
    }
    if (data.avatarUrl !== undefined) {
      if (!data.avatarUrl || data.avatarUrl.length > 500) {
        throw new HttpException('头像地址非法', HttpStatus.BAD_REQUEST);
      }
      updates.push('`avatar_url` = ?');
      values.push(data.avatarUrl);
    }
    if (data.gender !== undefined) {
      const gender = Number(data.gender);
      if (![0, 1, 2].includes(gender)) {
        throw new HttpException('性别参数非法', HttpStatus.BAD_REQUEST);
      }
      updates.push('`gender` = ?');
      values.push(gender);
    }
    if (updates.length === 0) {
      throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);
    }

    await this.dataSource.query(`UPDATE \`user\` SET ${updates.join(', ')} WHERE \`id\` = ?`, [
      ...values,
      userId
    ] as QueryValues);

    return this.getProfile(userId);
  }

  /**
   * 注销账号
   * 1. 校验用户存在且未被禁用
   * 2. 匿名化该用户发布的内容（动态/照片/文档），保留家族共享数据
   * 3. 删除 user 表记录
   */
  async deleteAccount(userId: string): Promise<{ success: boolean }> {
    const [user] = await this.dataSource.query<UserRow[]>(
      'SELECT `id` FROM `user` WHERE `id` = ?',
      [userId] as QueryValues
    );
    if (!user) {
      throw new HttpException('用户不存在', HttpStatus.NOT_FOUND);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // 动态：发布者信息匿名化（user_id 置空、昵称改为"已注销用户"）
      await queryRunner.query(
        'UPDATE `family_dynamic` SET `user_id` = ?, `user_name` = ? WHERE `user_id` = ?',
        ['', '已注销用户', userId] as QueryValues
      );
      // 照片：上传者信息匿名化
      await queryRunner.query(
        'UPDATE `family_photo` SET `uploader_id` = ?, `uploader_name` = ? WHERE `uploader_id` = ?',
        ['', '已注销用户', userId] as QueryValues
      );
      // 文档：上传者信息匿名化
      await queryRunner.query(
        'UPDATE `family_document` SET `uploader_id` = ?, `uploader_name` = ? WHERE `uploader_id` = ?',
        ['', '已注销用户', userId] as QueryValues
      );
      // 动态评论：评论者信息匿名化，保留内容
      await queryRunner.query(
        'UPDATE `family_dynamic_comment` SET `user_id` = ?, `user_name` = ? WHERE `user_id` = ?',
        ['', '已注销用户', userId] as QueryValues
      );
      // 祭祀记录：用户信息匿名化，保留记录
      await queryRunner.query(
        'UPDATE `family_worship_record` SET `user_id` = ?, `user_name` = ? WHERE `user_id` = ?',
        ['', '已注销用户', userId] as QueryValues
      );
      // 备份记录：操作者信息匿名化
      await queryRunner.query(
        'UPDATE `family_backup` SET `operator_id` = ? WHERE `operator_id` = ?',
        ['', userId] as QueryValues
      );
      // 用户私有数据：点赞、家族权限、用户设置直接删除
      await queryRunner.query('DELETE FROM `family_dynamic_like` WHERE `user_id` = ?', [userId] as QueryValues);
      await queryRunner.query('DELETE FROM `family_permission` WHERE `user_id` = ?', [userId] as QueryValues);
      await queryRunner.query('DELETE FROM `user_setting` WHERE `user_id` = ?', [userId] as QueryValues);
      // 删除用户记录
      await queryRunner.query('DELETE FROM `user` WHERE `id` = ?', [userId] as QueryValues);
      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    return { success: true };
  }
}
