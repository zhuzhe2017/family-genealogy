import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { PayConfigService } from './pay-config.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { type AuthenticatedRequest } from '../common/types/common';
import { SavePayConfigDto } from './dto/save-pay-config.dto';
import type { PayProvider } from './types/pay-config.types';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('pay-config')
export class PayConfigController {
  constructor(private readonly payConfigService: PayConfigService) {}

  /** 获取支付配置（敏感字段已脱敏） */
  @Permissions('system:settings:pay:list')
  @Get('')
  async getConfig() {
    return this.payConfigService.getConfig();
  }

  /** 保存支付配置 */
  @Permissions('system:settings:pay:update')
  @Post('save')
  async saveConfig(@Body() body: SavePayConfigDto, @Req() req: AuthenticatedRequest) {
    return this.payConfigService.saveConfig(body, req.user.username, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      adminId: req.user.id as number
    });
  }

  /** 测试支付连通性 */
  @Permissions('system:settings:pay:update')
  @Post('test')
  async testConnection(
    @Body() body: { provider: PayProvider },
    @Req() req: AuthenticatedRequest
  ) {
    return this.payConfigService.testConnection(body.provider, req.user.username, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      adminId: req.user.id as number
    });
  }
}
