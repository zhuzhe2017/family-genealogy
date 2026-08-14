import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** 小程序用户 JWT 守卫,使用 'user-jwt' 策略 */
@Injectable()
export class UserJwtAuthGuard extends AuthGuard('user-jwt') {}
