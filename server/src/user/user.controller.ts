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
   * 获取我的家族关联信息（登录后自动检测并进入已关联家族支系）
   * 返回：familyId / family / memberId / member / shareCode
   */
  @Public()
  @UseGuards(UserJwtAuthGuard)
  @Get('me/family')
  async getMyFamily(@Req() req: AuthenticatedRequest) {
    return this.userService.getMyFamily(String(req.user.id));
  }

  /**
   * 加入家族支系（合法途径进入指定家族）
   * body: { shareCode?: string, familyId?: number, memberId?: string }
   * - 分享码与家族ID二选一
   * - memberId 可选，加入时同步绑定指定家族成员
   */
  @Public()
  @UseGuards(UserJwtAuthGuard)
  @Post('family/join')
  async joinFamily(
    @Req() req: AuthenticatedRequest,
    @Body() body: { shareCode?: string; familyId?: number; memberId?: string }
  ) {
    return this.userService.joinFamily(String(req.user.id), {
      shareCode: body.shareCode,
      familyId: body.familyId !== undefined ? Number(body.familyId) : undefined,
      memberId: body.memberId
    });
  }

  /**
   * 绑定家族成员（绑定后获得编辑该成员信息的权限，不受 VIP 状态限制）
   * body: { memberId: string }
   */
  @Public()
  @UseGuards(UserJwtAuthGuard)
  @Put('family/bind-member')
  async bindMember(
    @Req() req: AuthenticatedRequest,
    @Body() body: { memberId?: string }
  ) {
    return this.userService.bindMember(String(req.user.id), body.memberId || '');
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
