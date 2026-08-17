import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { WorshipAdminService } from './worship-admin.service';

/**
 * 祭祀后台管理接口（祭祀记录 / 纪念对象）
 * 受 JwtAuthGuard + RolesGuard + PermissionsGuard 保护，权限码 system:worship:list / system:worship:delete
 */
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('worship')
export class WorshipAdminController {
  constructor(private readonly adminService: WorshipAdminService) {}

  /** 祭祀记录分页（familyId/type/keyword/page/pageSize） */
  @Permissions('system:worship:list')
  @Get('records/list')
  getRecordList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('familyId') familyId?: string,
    @Query('type') type?: string,
    @Query('keyword') keyword?: string
  ) {
    return this.adminService.getRecordList({
      page: Number(page),
      pageSize: Number(pageSize),
      familyId: familyId !== undefined && familyId !== '' ? Number(familyId) : undefined,
      type,
      keyword
    });
  }

  /** 删除祭祀记录 */
  @Permissions('system:worship:delete')
  @Delete('records/:id')
  deleteRecord(@Param('id') id: string) {
    return this.adminService.deleteRecord(Number(id));
  }

  /** 纪念对象分页（familyId/keyword/page/pageSize） */
  @Permissions('system:worship:list')
  @Get('memorials/list')
  getMemorialList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('familyId') familyId?: string,
    @Query('keyword') keyword?: string
  ) {
    return this.adminService.getMemorialList({
      page: Number(page),
      pageSize: Number(pageSize),
      familyId: familyId !== undefined && familyId !== '' ? Number(familyId) : undefined,
      keyword
    });
  }

  /** 删除纪念对象（软删除） */
  @Permissions('system:worship:delete')
  @Delete('memorials/:id')
  deleteMemorial(@Param('id') id: string) {
    return this.adminService.deleteMemorial(Number(id));
  }
}
