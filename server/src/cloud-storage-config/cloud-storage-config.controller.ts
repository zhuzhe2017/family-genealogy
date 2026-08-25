import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { CloudStorageConfigService } from './cloud-storage-config.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { type AuthenticatedRequest } from '../common/types/common';
import { SaveCloudStorageConfigDto } from './dto/save-cloud-storage-config.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('cloud-storage-config')
export class CloudStorageConfigController {
  constructor(private readonly cloudStorageConfigService: CloudStorageConfigService) {}

  /** 获取云存储配置（敏感字段已脱敏） */
  @Permissions('system:settings:list', 'system:settings:cloud:list')
  @Get('')
  async getConfig() {
    return this.cloudStorageConfigService.getConfig();
  }

  /** 保存云存储配置 */
  @Permissions('system:settings:update', 'system:settings:cloud:update')
  @Post('save')
  async saveConfig(
    @Body() body: SaveCloudStorageConfigDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.cloudStorageConfigService.saveConfig(body, req.user.username, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      adminId: req.user.id as number
    });
  }
}
