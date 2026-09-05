import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserService } from './user.service';
import { UserJwtAuthGuard } from './user.guard';
import { Public } from '../common/decorators/public.decorator';
import { type AuthenticatedRequest } from '../common/types/common';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * 用户手机号密码登录(公开接口)
   * 前期用于租户后台/PC 端快速验证流程逻辑
   * 限流 20 次/分钟/IP
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('pwd-login')
  async pwdLogin(@Body() body: { phone: string; password: string }) {
    return this.userService.pwdLogin(body.phone, body.password);
  }

  /**
   * 刷新用户 token
   */
  @Public()
  @Post('refreshToken')
  async refreshToken(@Body() body: { refreshToken: string }) {
    return this.userService.refreshToken(body.refreshToken);
  }

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
   * 发送手机号短信验证码(公开接口)
   * 场景: login-登录 / bind-绑定手机号
   * 限流 10 次/分钟/IP;服务端另有 60s 重发间隔与单号每日上限
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('sms/send')
  async sendSmsCode(@Body() body: { phone: string; scene?: 'login' | 'bind' }) {
    return this.userService.sendSmsCode(body.phone, body.scene || 'login');
  }

  /**
   * 手机号验证码登录(公开接口)
   * 验证码一次性消费;未注册手机号自动注册
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('phone-login')
  async phoneLogin(@Body() body: { phone: string; code: string }) {
    return this.userService.phoneLogin(body.phone, body.code);
  }

  /**
   * 设置/修改登录密码(需 user-jwt)
   * 适用于手机号验证码登录后首次设密或修改密码
   */
  @Public()
  @UseGuards(UserJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('set-password')
  async setPassword(
    @Req() req: AuthenticatedRequest,
    @Body() body: { password: string }
  ) {
    return this.userService.setPassword(String(req.user.id), body.password);
  }

  /**
   * 绑定手机号(需登录,作为跨端统一锚点)
   * 已绑定其他账号的手机号返回 409
   */
  @Public()
  @UseGuards(UserJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('bind-phone')
  async bindPhone(
    @Req() req: AuthenticatedRequest,
    @Body() body: { phone: string; code: string }
  ) {
    return this.userService.bindPhone(String(req.user.id), body.phone, body.code);
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
   * 加入家族支系（需 user-jwt，仅支持分享码）
   * shareCode: 家族种子分享码 或 会员分享码
   * memberId: 可选，加入时同步绑定指定家族成员
   */
  @Public()
  @UseGuards(UserJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('family/join')
  async joinFamily(
    @Req() req: AuthenticatedRequest,
    @Body() body: { shareCode: string; memberId?: string }
  ) {
    return this.userService.joinFamily(String(req.user.id), body);
  }

  /**
   * 获取当前家族成员角色列表（小程序端权限管理）
   */
  @Public()
  @UseGuards(UserJwtAuthGuard)
  @Get('family/roles')
  async getFamilyRoles(@Req() req: AuthenticatedRequest) {
    return this.userService.getFamilyRoles(String(req.user.id));
  }

  /**
   * 设置家族成员角色（小程序端权限管理，仅族长）
   * role: 'admin' | 'member'
   */
  @Public()
  @UseGuards(UserJwtAuthGuard)
  @Put('family/roles/:targetUserId')
  async setFamilyRole(
    @Req() req: AuthenticatedRequest,
    @Param('targetUserId') targetUserId: string,
    @Body() body: { role: string }
  ) {
    return this.userService.setFamilyRole(String(req.user.id), targetUserId, body.role);
  }
}
