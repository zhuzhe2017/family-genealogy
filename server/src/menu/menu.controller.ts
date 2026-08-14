import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { MenuService } from './menu.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { type AuthenticatedRequest } from '../common/types/common';
import { type MenuCreateData, type MenuUpdateData } from './types/menu.types';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  /** 获取菜单树（全部层级） */
  @Permissions('system:menu:list')
  @Get('tree')
  async getTree() {
    return this.menuService.getTree();
  }

  /** 获取菜单列表（扁平分页） */
  @Permissions('system:menu:list')
  @Get('list')
  async getList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('type') type?: string
  ) {
    return this.menuService.getList({
      page: Number(page),
      pageSize: Number(pageSize),
      keyword,
      status: status !== undefined ? Number(status) : undefined,
      type
    });
  }

  /** 获取单条菜单 */
  @Permissions('system:menu:list')
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.menuService.getById(Number(id));
  }

  /** 创建菜单 */
  @Permissions('system:menu:create')
  @Post('create')
  async create(@Body() body: MenuCreateData, @Req() req: AuthenticatedRequest) {
    return this.menuService.create({
      parentId: body.parentId || 0,
      name: body.name,
      type: body.type || 'menu',
      path: body.path,
      component: body.component,
      routeName: body.routeName,
      icon: body.icon,
      permission: body.permission,
      sortOrder: body.sortOrder,
      visible: body.visible,
      keepAlive: body.keepAlive
    }, req.user?.username);
  }

  /** 更新菜单 */
  @Permissions('system:menu:update')
  @Put('update/:id')
  async update(@Param('id') id: string, @Body() body: MenuUpdateData, @Req() req: AuthenticatedRequest) {
    return this.menuService.update(Number(id), {
      parentId: body.parentId,
      name: body.name,
      type: body.type,
      path: body.path,
      component: body.component,
      routeName: body.routeName,
      icon: body.icon,
      permission: body.permission,
      sortOrder: body.sortOrder,
      status: body.status,
      visible: body.visible,
      keepAlive: body.keepAlive
    }, req.user?.username);
  }

  /** 删除菜单 */
  @Permissions('system:menu:delete')
  @Delete('delete/:id')
  async delete(@Param('id') id: string) {
    return this.menuService.delete(Number(id));
  }

  /** 批量更新排序 */
  @Permissions('system:menu:sort')
  @Post('update-sort')
  async updateSort(@Body() body: { list: { id: number; sortOrder: number }[] }) {
    return this.menuService.updateSort(body.list || []);
  }

  /** 切换状态 */
  @Permissions('system:menu:status')
  @Post('toggle-status/:id')
  async toggleStatus(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.menuService.toggleStatus(Number(id), req.user?.username);
  }
}
