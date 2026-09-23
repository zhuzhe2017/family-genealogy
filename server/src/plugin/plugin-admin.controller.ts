import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PluginAdminService } from './plugin-admin.service';
import { PluginUpsertDto } from './dto/plugin.dto';
import { type AuthenticatedRequest } from '../common/types/common';

/**
 * 应用插件后台管理接口
 * 受 JwtAuthGuard + RolesGuard + PermissionsGuard 保护
 * 权限码：system:app-plugin:list / create / update / delete
 */
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('plugin')
export class PluginAdminController {
  constructor(private readonly adminService: PluginAdminService) {}

  /** 分页列表（keyword/status/page/pageSize） */
  @Permissions('system:app-plugin:list')
  @Get('list')
  getList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string
  ) {
    return this.adminService.getList({
      page: Number(page),
      pageSize: Number(pageSize),
      keyword,
      status: status !== undefined && status !== '' ? Number(status) : undefined
    });
  }

  /** 新增 */
  @Permissions('system:app-plugin:create')
  @Post()
  create(@Body() body: PluginUpsertDto, @Req() req: AuthenticatedRequest) {
    return this.adminService.create(body || {}, String(req.user?.id || ''));
  }

  /** 编辑 */
  @Permissions('system:app-plugin:update')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: PluginUpsertDto) {
    return this.adminService.update(Number(id), body || {});
  }

  /** 删除 */
  @Permissions('system:app-plugin:delete')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.adminService.delete(Number(id));
  }
}
