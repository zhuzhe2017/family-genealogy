import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { BannerAdminService } from './banner-admin.service';
import { type BannerUpsertData } from './types/banner.types';
import { type AuthenticatedRequest } from '../common/types/common';

/**
 * 广告轮播后台管理接口
 * 受 JwtAuthGuard + RolesGuard + PermissionsGuard 保护
 * 权限码：system:family-banner:list / create / update / delete
 */
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('banner')
export class BannerAdminController {
  constructor(private readonly adminService: BannerAdminService) {}

  /** 分页列表（familyId/keyword/status/page/pageSize） */
  @Permissions('system:family-banner:list')
  @Get('list')
  getList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('familyId') familyId?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string
  ) {
    return this.adminService.getList({
      page: Number(page),
      pageSize: Number(pageSize),
      familyId: familyId !== undefined && familyId !== '' ? Number(familyId) : undefined,
      keyword,
      status: status !== undefined && status !== '' ? Number(status) : undefined
    });
  }

  /** 新增 */
  @Permissions('system:family-banner:create')
  @Post()
  create(@Body() body: BannerUpsertData, @Req() req: AuthenticatedRequest) {
    return this.adminService.create(body || {}, String(req.user?.id || ''));
  }

  /** 编辑 */
  @Permissions('system:family-banner:update')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: BannerUpsertData, @Req() req: AuthenticatedRequest) {
    return this.adminService.update(Number(id), body || {}, String(req.user?.id || ''));
  }

  /** 删除 */
  @Permissions('system:family-banner:delete')
  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.adminService.delete(Number(id), String(req.user?.id || ''));
  }
}
