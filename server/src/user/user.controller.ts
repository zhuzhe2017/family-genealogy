import { Controller, Post, Get, Put, Delete, Body, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserService } from './user.service';
import { UserJwtAuthGuard } from './user.guard';
import { Public } from '../common/decorators/public.decorator';
import { type AuthenticatedRequest } from '../common/types/common';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * 微信小程序登录(公开接口)
   * 限流 30 次/分钟/IP,防止 code 暴力枚举
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('wx-login')
  async wxLogin(@Body() body: { code: string }) {
    return this.userService.wxLogin(body.code);
  }

  /**
   * 获取当前用户信息
   * @Public 跳过全局管理员 JwtAuthGuard,改用 UserJwtAuthGuard 校验用户令牌
   */
  @Public()
  @UseGuards(UserJwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.userService.getProfile(String(req.user.id));
  }

  /**
   * 更新当前用户资料(昵称/头像/性别)
   * @Public 跳过全局管理员 JwtAuthGuard,改用 UserJwtAuthGuard 校验用户令牌
   */
  @Public()
  @UseGuards(UserJwtAuthGuard)
  @Put('profile')
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() body: { nickName?: string; avatarUrl?: string; gender?: number }
  ) {
    return this.userService.updateProfile(String(req.user.id), body);
  }

  /**
   * 注销账号(删除用户记录,其发布内容匿名化保留)
   * @Public 跳过全局管理员 JwtAuthGuard,改用 UserJwtAuthGuard 校验用户令牌
   */
  @Public()
  @UseGuards(UserJwtAuthGuard)
  @Delete('account')
  async deleteAccount(@Req() req: AuthenticatedRequest) {
    return this.userService.deleteAccount(String(req.user.id));
  }
}
