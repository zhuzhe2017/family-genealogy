import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { SystemConfigService } from './system-config.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { type AuthenticatedRequest } from '../common/types/common';
import { SysConfigUpdateDto, SysConfigSaveBatchDto } from './dto/system-config.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('system-config')
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  /** 分页列表 */
  @Permissions('system:settings:list')
  @Get('list')
  async getList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('keyword') keyword?: string,
    @Query('group') group?: string,
    @Query('status') status?: string
  ) {
    return this.systemConfigService.getList({
      page: Number(page),
      pageSize: Number(pageSize),
      keyword,
      group,
      status: status !== undefined ? Number(status) : undefined
    });
  }

  /** 按分组获取全部配置（基础配置/安全设置/日志配置） */
  @Permissions('system:settings:list', 'system:settings:security:list')
  @Get('groups')
  async getGroups() {
    return this.systemConfigService.getGroups();
  }

  /** 站点基础配置（公开接口：登录页/后台左上角与页脚展示系统名称、LOGO、版权） */
  @Public()
  @Get('site')
  async getSiteConfig() {
    return this.systemConfigService.getSiteConfig();
  }

  /** 获取单条配置 */
  @Permissions('system:settings:list')
  @Get(':key')
  async getByKey(@Param('key') key: string) {
    return this.systemConfigService.getByKey(key);
  }

  /** 更新配置 */
  @Permissions('system:settings:update')
  @Put('update/:id')
  async update(
    @Param('id') id: string,
    @Body() body: SysConfigUpdateDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.systemConfigService.update(Number(id), body, req.user.username);
  }

  /** 批量保存 */
  @Permissions('system:settings:update')
  @Post('save-batch')
  async saveBatch(@Body() body: SysConfigSaveBatchDto, @Req() req: AuthenticatedRequest) {
    return this.systemConfigService.saveBatch(body?.items || [], req.user.username);
  }

  /** 恢复默认值 */
  @Permissions('system:settings:update')
  @Post('reset/:id')
  async reset(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.systemConfigService.reset(Number(id), req.user.username);
  }
}
