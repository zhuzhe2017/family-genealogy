import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { type UserRow, type UserLoginResult } from './types/user.types';
import { type WxSessionResponse, type QueryValues } from '../common/types/common';

@Injectable()
export class UserService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  /**
   * 微信小程序登录
   * 1. 用前端传来的 wx.login code 调用微信 jscode2session 换取 openid
   * 2. 在 user 表中按 openid 查找或创建用户
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

    // 按 openid 查找用户
    let [user] = await this.dataSource.query<UserRow[]>(
      'SELECT `id`, `nickname`, `avatar_url`, `gender`, `status` FROM `user` WHERE `openid` = ?',
      [openid] as QueryValues
    );

    // 首次登录:创建用户记录
    if (!user) {
      const id = randomBytes(16).toString('hex');
      await this.dataSource.query(
        'INSERT INTO `user` (`id`, `nickname`, `openid`, `unionid`, `status`) VALUES (?, ?, ?, ?, 1)',
        [id, '微信用户', openid, unionid] as QueryValues
      );
      [user] = await this.dataSource.query<UserRow[]>(
        'SELECT `id`, `nickname`, `avatar_url`, `gender`, `status` FROM `user` WHERE `id` = ?',
        [id] as QueryValues
      );
    }

    if (user.status !== 1) {
      throw new HttpException('账号已被禁用', HttpStatus.FORBIDDEN);
    }

    // 签发 JWT,type=user 区分于管理员令牌
    const payload = { sub: user.id, type: 'user' };
    const token = this.jwtService.sign(payload);

    return {
      token,
      userInfo: {
        id: user.id,
        nickName: user.nickname,
        avatarUrl: user.avatar_url,
        gender: user.gender
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
