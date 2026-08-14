import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DataSource } from 'typeorm';
import { type UserRow } from './types/user.types';
import { type QueryValues } from '../common/types/common';

/**
 * 小程序用户 JWT 策略(策略名 'user-jwt')
 * 与管理员 'jwt' 策略共用同一个 JWT_SECRET,但通过 payload.type 区分:
 * - type='user':查 user 表
 * - 其他:拒绝
 */
@Injectable()
export class UserJwtStrategy extends PassportStrategy(Strategy, 'user-jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET')
    });
  }

  async validate(payload: { sub: string; type?: string }) {
    if (payload.type !== 'user') {
      throw new UnauthorizedException('非用户令牌');
    }
    const [user] = await this.dataSource.query<UserRow[]>(
      'SELECT `id`, `nickname`, `avatar_url`, `gender`, `status` FROM `user` WHERE `id` = ? AND `status` = 1',
      [payload.sub] as QueryValues
    );
    if (!user) {
      throw new UnauthorizedException('用户不存在或已禁用');
    }
    return { id: user.id, nickname: user.nickname, avatarUrl: user.avatar_url, gender: user.gender };
  }
}
