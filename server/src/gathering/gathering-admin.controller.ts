import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { GatheringAdminService } from './gathering-admin.service';
import { type GatheringUpsertData } from './types/gathering.types';
import { type AuthenticatedRequest } from '../common/types/common';

/**
 * 宗亲聚会后台管理接口
 * 受 JwtAuthGuard + RolesGuard + PermissionsGuard 保护
 * 权限码：system:gathering:list / create / update / delete
 */
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('gathering')
export class GatheringAdminController {
  constructor(private readonly adminService: GatheringAdminService) {}

  /** 分页列表（keyword/familyId/status/page/pageSize） */
  @Permissions('system:gathering:list')
  @Get('list')
  getList(@Query() query: Record<string, string>) {
    return this.adminService.getList({
      page: Number(query.page) || 1,
      pageSize: Number(query.pageSize) || 10,
      keyword: query.keyword || undefined,
      familyId: query.familyId ? Number(query.familyId) : undefined,
      status: query.status !== undefined && query.status !== '' ? Number(query.status) : undefined
    });
  }

  /** 详情 */
  @Permissions('system:gathering:list')
  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.adminService.getDetail(Number(id));
  }

  /** 新增 */
  @Permissions('system:gathering:create')
  @Post()
  create(@Body() body: GatheringUpsertData, @Req() req: AuthenticatedRequest) {
    return this.adminService.create(body || {}, String(req.user?.id || ''));
  }

  /** 编辑 */
  @Permissions('system:gathering:update')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: GatheringUpsertData) {
    return this.adminService.update(Number(id), body || {});
  }

  /** 状态流转 */
  @Permissions('system:gathering:update')
  @Put(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status: number }) {
    return this.adminService.updateStatus(Number(id), Number(body?.status));
  }

  /** 删除 */
  @Permissions('system:gathering:delete')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.adminService.delete(Number(id));
  }

  /** 报名名单 */
  @Permissions('system:gathering:list')
  @Get(':id/registrations')
  getRegistrations(@Param('id') id: string, @Query() query: Record<string, string>) {
    return this.adminService.getRegistrations(Number(id), {
      page: Number(query.page) || 1,
      pageSize: Number(query.pageSize) || 10,
      status: query.status !== undefined && query.status !== '' ? Number(query.status) : undefined,
      keyword: query.keyword || undefined
    });
  }

  /** 参会统计分析 */
  @Permissions('system:gathering:list')
  @Get(':id/stats')
  getStats(@Param('id') id: string) {
    return this.adminService.getStats(Number(id));
  }

  /** 归档资料列表 */
  @Permissions('system:gathering:list')
  @Get(':id/archives')
  getArchives(@Param('id') id: string) {
    return this.adminService.getArchives(Number(id));
  }

  /** 新增归档资料 */
  @Permissions('system:gathering:update')
  @Post(':id/archives')
  createArchive(
    @Param('id') id: string,
    @Body() body: { title?: string; fileUrl?: string; fileType?: string; description?: string },
    @Req() req: AuthenticatedRequest
  ) {
    return this.adminService.createArchive(Number(id), body || {}, String(req.user?.id || ''));
  }

  /** 删除归档资料 */
  @Permissions('system:gathering:update')
  @Delete(':id/archives/:archiveId')
  deleteArchive(@Param('id') id: string, @Param('archiveId') archiveId: string) {
    return this.adminService.deleteArchive(Number(id), Number(archiveId));
  }
}
