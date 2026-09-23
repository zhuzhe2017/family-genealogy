import { Controller, Get, Post, Body, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { SystemSecurityService } from './system-security.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { type AuthenticatedRequest } from '../common/types/common';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('system-security')
export class SystemSecurityController {
  constructor(private readonly securityService: SystemSecurityService) {}

  /** 获取当前生效的密码策略（安全设置页展示） */
  @Permissions('system:settings:security:list')
  @Get('password-policy')
  async getPasswordPolicy() {
    return this.securityService.getPasswordPolicy();
  }

  /** 敏感操作二次验证配置 */
  @Permissions('system:settings:security:list')
  @Get('sensitive-config')
  async getSensitiveConfig() {
    return this.securityService.getSensitiveOpVerifyConfig();
  }

  /** 敏感操作二次验证：校验当前管理员登录密码 */
  @Permissions('system:settings:verify')
  @Post('verify-password')
  async verifyPassword(@Req() req: AuthenticatedRequest, @Body() body: { password?: string }) {
    const { enabled, timeout } = await this.securityService.getSensitiveOpVerifyConfig();
    if (!enabled) {
      throw new HttpException('敏感操作二次验证未启用', HttpStatus.BAD_REQUEST);
    }
    const ok = await this.securityService.verifyPassword(req.user.id as number, body?.password || '');
    if (!ok) {
      throw new HttpException('密码验证失败', HttpStatus.UNAUTHORIZED);
    }
    return { verified: true, expiresIn: timeout };
  }

  /** 获取登录页公开配置（登录页判断是否显示验证码） */
  @Public()
  @Get('login-config')
  async getLoginConfig() {
    const captchaEnabled = (await this.securityService.getConfig('login_captcha_enabled', 'false')) === 'true';
    return { captchaEnabled };
  }

  /** 获取图形验证码（登录页使用，公开接口） */
  @Public()
  @Get('captcha')
  getCaptcha() {
    return this.securityService.generateCaptcha();
  }
}
