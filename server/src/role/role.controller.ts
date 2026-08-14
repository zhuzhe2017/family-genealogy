import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { RoleService } from './role.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';

@Roles('super')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  /** 角色列表 */
  @Permissions('system:role:list')
  @Get('list')
  async list() {
    return this.roleService.getRoles();
  }

  /** 获取角色已绑定菜单 */
  @Permissions('system:role:list')
  @Get(':id/menus')
  async getRoleMenus(@Param('id') id: string) {
    return this.roleService.getRoleMenus(Number(id));
  }

  /** 角色详情 */
  @Permissions('system:role:list')
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.roleService.getRoleById(Number(id));
  }

  /** 创建角色 */
  @Permissions('system:role:create')
  @Post('create')
  async create(@Body() body: { name: string; code: string; status?: number }) {
    return this.roleService.createRole(body);
  }

  /** 更新角色 */
  @Permissions('system:role:update')
  @Put('update/:id')
  async update(@Param('id') id: string, @Body() body: { name?: string; code?: string; status?: number }) {
    return this.roleService.updateRole(Number(id), body);
  }

  /** 删除角色 */
  @Permissions('system:role:delete')
  @Delete('delete/:id')
  async delete(@Param('id') id: string) {
    return this.roleService.deleteRole(Number(id));
  }

  /** 为角色分配权限 */
  @Permissions('system:role:update')
  @Post('assign-permissions/:id')
  async assignPermissions(
    @Param('id') id: string,
    @Body() body: { permissionIds: number[] }
  ) {
    return this.roleService.assignPermissions(Number(id), body.permissionIds || []);
  }

  /** 为角色分配菜单 */
  @Permissions('system:role:update')
  @Post('assign-menus/:id')
  async assignMenus(
    @Param('id') id: string,
    @Body() body: { menuIds: number[] }
  ) {
    return this.roleService.assignMenusToRole(Number(id), body.menuIds || []);
  }
}

@Roles('super')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('permission')
export class PermissionController {
  constructor(private readonly roleService: RoleService) {}

  /** 权限列表 */
  @Permissions('system:permission:list')
  @Get('list')
  async list() {
    return this.roleService.getPermissions();
  }

  /** 创建权限 */
  @Permissions('system:permission:create')
  @Post('create')
  async create(@Body() body: { name: string; code: string; status?: number }) {
    return this.roleService.createPermission(body);
  }

  /** 更新权限 */
  @Permissions('system:permission:update')
  @Put('update/:id')
  async update(@Param('id') id: string, @Body() body: { name?: string; code?: string; status?: number }) {
    return this.roleService.updatePermission(Number(id), body);
  }

  /** 删除权限 */
  @Permissions('system:permission:delete')
  @Delete('delete/:id')
  async delete(@Param('id') id: string) {
    return this.roleService.deletePermission(Number(id));
  }
}

@Roles('super')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('admin-role')
export class AdminRoleController {
  constructor(private readonly roleService: RoleService) {}

  /** 获取管理员角色 */
  @Permissions('system:admin:role')
  @Get(':adminId')
  async getAdminRoles(@Param('adminId') adminId: string) {
    return this.roleService.getAdminRoles(Number(adminId));
  }

  /** 为管理员分配角色 */
  @Permissions('system:admin:role')
  @Post('assign/:adminId')
  async assignRoles(
    @Param('adminId') adminId: string,
    @Body() body: { roleIds: number[] }
  ) {
    return this.roleService.assignRolesToAdmin(Number(adminId), body.roleIds || []);
  }
}
