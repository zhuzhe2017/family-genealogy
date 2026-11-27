import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { HistoryEventsAdminService } from './history-events-admin.service';

/**
 * 同期历史事件后台管理接口
 * 用途：管理 history_events 表（时空地图模块的数据库版历史事件数据源）
 *
 * 权限码：system:history-events:list / create / update / delete / toggle
 * 路由前缀：history-events-admin
 *   GET    /list                     分页列表
 *   GET    /:id                      详情
 *   POST   /                          新增
 *   PUT    /:id                      编辑
 *   DELETE /:id                      软删除（status=0）
 *   POST   /:id/toggle               切换启用/禁用状态
 */
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('history-events-admin')
export class HistoryEventsAdminController {
  constructor(private readonly adminService: HistoryEventsAdminService) {}

  /** 分页列表 */
  @Permissions('system:history-events:list')
  @Get('list')
  getList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('yearFrom') yearFrom?: string,
    @Query('yearTo') yearTo?: string,
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string
  ) {
    return this.adminService.getList({
      page: Number(page),
      pageSize: Number(pageSize),
      yearFrom: yearFrom !== undefined && yearFrom !== '' ? Number(yearFrom) : undefined,
      yearTo: yearTo !== undefined && yearTo !== '' ? Number(yearTo) : undefined,
      category: category !== undefined && category !== '' ? category : undefined,
      keyword: keyword !== undefined && keyword !== '' ? keyword : undefined,
      status: status !== undefined && status !== '' ? Number(status) : undefined
    });
  }

  /** 详情 */
  @Permissions('system:history-events:list')
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.adminService.getById(Number(id));
  }

  /** 新增 */
  @Permissions('system:history-events:create')
  @Post()
  create(@Body() body: any) {
    return this.adminService.create(body || {});
  }

  /** 编辑 */
  @Permissions('system:history-events:update')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.adminService.update(Number(id), body || {});
  }

  /** 删除（软删除 status=0） */
  @Permissions('system:history-events:delete')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.adminService.delete(Number(id));
  }

  /** 切换启用/禁用 */
  @Permissions('system:history-events:update')
  @Post(':id/toggle')
  toggleStatus(@Param('id') id: string, @Body() body: { status?: number }) {
    return this.adminService.toggleStatus(Number(id), Number(body?.status ?? 0));
  }
}
