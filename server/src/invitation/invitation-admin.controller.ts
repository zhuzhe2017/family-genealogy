import { Controller, Delete, Get, Param, Query, UseGuards, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { InvitationAdminService } from './invitation-admin.service';

/**
 * 家族邀请后台管理接口
 * 受 JwtAuthGuard + RolesGuard + PermissionsGuard 保护
 * 权限码：system:family-invitation:list / delete
 */
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('invitation')
export class InvitationAdminController {
  constructor(private readonly adminService: InvitationAdminService) {}

  /** 分页列表（keyword/status/familyId） */
  @Permissions('system:family-invitation:list')
  @Get('list')
  getList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('familyId') familyId?: string
  ) {
    return this.adminService.getList({
      page: Number(page),
      pageSize: Number(pageSize),
      keyword,
      status: status !== undefined && status !== '' ? Number(status) : undefined,
      familyId: familyId !== undefined && familyId !== '' ? Number(familyId) : undefined
    });
  }

  /** 批量删除（物理删除），需放在 :id 路由之前声明，避免 batch 被参数路由吞掉 */
  @Permissions('system:family-invitation:delete')
  @Delete('batch')
  batchDelete(@Body() body: { ids: number[] }) {
    return this.adminService.batchDelete(Array.isArray(body?.ids) ? body.ids : []);
  }

  /** 删除（物理删除） */
  @Permissions('system:family-invitation:delete')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.adminService.delete(Number(id));
  }
}
