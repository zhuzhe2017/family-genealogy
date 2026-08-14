import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import {
  type RoleRow,
  type PermissionRow,
  type RoleCreateData,
  type RoleUpdateData,
  type PermissionCreateData,
  type PermissionUpdateData
} from './types/role.types';
import { type QueryValues, type DataRow } from '../common/types/common';

@Injectable()
export class RoleService {
  constructor(private readonly dataSource: DataSource) {}

  /** 获取角色列表（含权限ID列表） */
  async getRoles() {
    const roles = await this.dataSource.query<RoleRow[]>(
      'SELECT `id`, `name`, `code`, `status`, `create_time`, `update_time` FROM `sys_role` ORDER BY `id` ASC'
    );

    const roleIds = roles.map(r => r.id);
    if (roleIds.length === 0) {
      return roles;
    }

    const placeholders = roleIds.map(() => '?').join(', ');
    const permissions = await this.dataSource.query<PermissionRow[]>(
      `SELECT rp.\`role_id\`, p.\`id\`, p.\`name\`, p.\`code\`
       FROM \`sys_role_permission\` rp
       INNER JOIN \`sys_permission\` p ON p.\`id\` = rp.\`permission_id\`
       WHERE rp.\`role_id\` IN (${placeholders})`,
      roleIds
    );

    const permissionMap = new Map<number, PermissionRow[]>();
    for (const p of permissions) {
      const list = permissionMap.get(p.role_id) || [];
      list.push({ id: p.id, name: p.name, code: p.code, status: p.status, create_time: p.create_time, update_time: p.update_time });
      permissionMap.set(p.role_id, list);
    }

    for (const role of roles) {
      role.permissions = permissionMap.get(role.id) || [];
      role.permissionIds = role.permissions.map(p => p.id);
    }

    return roles;
  }

  /** 获取单个角色 */
  async getRoleById(id: number) {
    const [role] = await this.dataSource.query<RoleRow[]>(
      'SELECT `id`, `name`, `code`, `status`, `create_time`, `update_time` FROM `sys_role` WHERE `id` = ?',
      [id]
    );
    if (!role) {
      throw new HttpException('角色不存在', HttpStatus.NOT_FOUND);
    }

    const permissions = await this.dataSource.query<PermissionRow[]>(
      `SELECT p.\`id\`, p.\`name\`, p.\`code\`
       FROM \`sys_role_permission\` rp
       INNER JOIN \`sys_permission\` p ON p.\`id\` = rp.\`permission_id\`
       WHERE rp.\`role_id\` = ?`,
      [id]
    );

    role.permissions = permissions;
    role.permissionIds = permissions.map(p => p.id);
    return role;
  }

  /** 创建角色 */
  async createRole(data: RoleCreateData) {
    const [existing] = await this.dataSource.query<Pick<RoleRow, 'id'>[]>(
      'SELECT `id` FROM `sys_role` WHERE `code` = ?',
      [data.code]
    );
    if (existing) {
      throw new HttpException('角色编码已存在', HttpStatus.CONFLICT);
    }

    const result = await this.dataSource.query<InsertResult>(
      'INSERT INTO `sys_role` (`name`, `code`, `status`) VALUES (?, ?, ?)',
      [data.name, data.code, data.status ?? 1]
    );
    return { id: result.insertId };
  }

  /** 更新角色 */
  async updateRole(id: number, data: RoleUpdateData) {
    const [role] = await this.dataSource.query<Pick<RoleRow, 'id'>[]>('SELECT `id` FROM `sys_role` WHERE `id` = ?', [id]);
    if (!role) {
      throw new HttpException('角色不存在', HttpStatus.NOT_FOUND);
    }

    if (data.code) {
      const [existing] = await this.dataSource.query<Pick<RoleRow, 'id'>[]>(
        'SELECT `id` FROM `sys_role` WHERE `code` = ? AND `id` != ?',
        [data.code, id]
      );
      if (existing) {
        throw new HttpException('角色编码已存在', HttpStatus.CONFLICT);
      }
    }

    const fields: string[] = [];
    const values: QueryValues = [];
    if (data.name !== undefined) { fields.push('`name` = ?'); values.push(data.name); }
    if (data.code !== undefined) { fields.push('`code` = ?'); values.push(data.code); }
    if (data.status !== undefined) { fields.push('`status` = ?'); values.push(data.status); }

    if (fields.length === 0) {
      throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);
    }

    values.push(id);
    await this.dataSource.query(`UPDATE \`sys_role\` SET ${fields.join(', ')} WHERE \`id\` = ?`, values);
    return { success: true };
  }

  /** 删除角色(事务:同时清理 4 张关联表,避免半删除状态) */
  async deleteRole(id: number) {
    const [role] = await this.dataSource.query<Pick<RoleRow, 'id'>[]>('SELECT `id` FROM `sys_role` WHERE `id` = ?', [id]);
    if (!role) {
      throw new HttpException('角色不存在', HttpStatus.NOT_FOUND);
    }

    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query('DELETE FROM `sys_role_permission` WHERE `role_id` = ?', [id]);
      await queryRunner.query('DELETE FROM `sys_admin_role` WHERE `role_id` = ?', [id]);
      await queryRunner.query('DELETE FROM `sys_role_menu` WHERE `role_id` = ?', [id]);
      await queryRunner.query('DELETE FROM `sys_role` WHERE `id` = ?', [id]);
      await queryRunner.commitTransaction();
      return { success: true };
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      throw new HttpException(errMsg(err), HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      await queryRunner.release();
    }
  }

  /** 为角色分配权限(事务:先删后插,失败回滚避免权限丢失) */
  async assignPermissions(roleId: number, permissionIds: number[]) {
    const [role] = await this.dataSource.query<Pick<RoleRow, 'id'>[]>('SELECT `id` FROM `sys_role` WHERE `id` = ?', [roleId]);
    if (!role) {
      throw new HttpException('角色不存在', HttpStatus.NOT_FOUND);
    }

    // 校验权限ID有效性(事务外先校验,避免占用连接)
    if (permissionIds.length > 0) {
      const placeholders = permissionIds.map(() => '?').join(', ');
      const validPermissions = await this.dataSource.query<Pick<PermissionRow, 'id'>[]>(
        `SELECT \`id\` FROM \`sys_permission\` WHERE \`id\` IN (${placeholders})`,
        permissionIds
      );
      const validIds = validPermissions.map(p => p.id);
      const invalidIds = permissionIds.filter(pid => !validIds.includes(pid));
      if (invalidIds.length > 0) {
        throw new HttpException(`权限不存在: ${invalidIds.join(', ')}`, HttpStatus.BAD_REQUEST);
      }
    }

    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query('DELETE FROM `sys_role_permission` WHERE `role_id` = ?', [roleId]);

      if (permissionIds.length > 0) {
        const placeholders = permissionIds.map(() => '(?, ?)').join(', ');
        const values: QueryValues = [];
        permissionIds.forEach(pid => { values.push(roleId, pid); });
        await queryRunner.query(
          `INSERT INTO \`sys_role_permission\` (\`role_id\`, \`permission_id\`) VALUES ${placeholders}`,
          values
        );
      }

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      throw new HttpException(errMsg(err), HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      await queryRunner.release();
    }
  }

  /** 获取权限列表 */
  async getPermissions() {
    return this.dataSource.query<PermissionRow[]>(
      'SELECT `id`, `name`, `code`, `status`, `create_time`, `update_time` FROM `sys_permission` ORDER BY `id` ASC'
    );
  }

  /** 创建权限 */
  async createPermission(data: PermissionCreateData) {
    const [existing] = await this.dataSource.query<Pick<PermissionRow, 'id'>[]>(
      'SELECT `id` FROM `sys_permission` WHERE `code` = ?',
      [data.code]
    );
    if (existing) {
      throw new HttpException('权限标识已存在', HttpStatus.CONFLICT);
    }

    const result = await this.dataSource.query<InsertResult>(
      'INSERT INTO `sys_permission` (`name`, `code`, `status`) VALUES (?, ?, ?)',
      [data.name, data.code, data.status ?? 1]
    );
    return { id: result.insertId };
  }

  /** 更新权限 */
  async updatePermission(id: number, data: PermissionUpdateData) {
    const [permission] = await this.dataSource.query<Pick<PermissionRow, 'id'>[]>('SELECT `id` FROM `sys_permission` WHERE `id` = ?', [id]);
    if (!permission) {
      throw new HttpException('权限不存在', HttpStatus.NOT_FOUND);
    }

    if (data.code) {
      const [existing] = await this.dataSource.query<Pick<PermissionRow, 'id'>[]>(
        'SELECT `id` FROM `sys_permission` WHERE `code` = ? AND `id` != ?',
        [data.code, id]
      );
      if (existing) {
        throw new HttpException('权限标识已存在', HttpStatus.CONFLICT);
      }
    }

    const fields: string[] = [];
    const values: QueryValues = [];
    if (data.name !== undefined) { fields.push('`name` = ?'); values.push(data.name); }
    if (data.code !== undefined) { fields.push('`code` = ?'); values.push(data.code); }
    if (data.status !== undefined) { fields.push('`status` = ?'); values.push(data.status); }

    if (fields.length === 0) {
      throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);
    }

    values.push(id);
    await this.dataSource.query(`UPDATE \`sys_permission\` SET ${fields.join(', ')} WHERE \`id\` = ?`, values);
    return { success: true };
  }

  /** 删除权限(事务:同时清理关联表) */
  async deletePermission(id: number) {
    const [permission] = await this.dataSource.query<Pick<PermissionRow, 'id'>[]>('SELECT `id` FROM `sys_permission` WHERE `id` = ?', [id]);
    if (!permission) {
      throw new HttpException('权限不存在', HttpStatus.NOT_FOUND);
    }

    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query('DELETE FROM `sys_role_permission` WHERE `permission_id` = ?', [id]);
      await queryRunner.query('DELETE FROM `sys_permission` WHERE `id` = ?', [id]);
      await queryRunner.commitTransaction();
      return { success: true };
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      throw new HttpException(errMsg(err), HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      await queryRunner.release();
    }
  }

  /** 获取角色已绑定的菜单ID列表 */
  async getRoleMenus(roleId: number) {
    const [role] = await this.dataSource.query<Pick<RoleRow, 'id'>[]>('SELECT `id` FROM `sys_role` WHERE `id` = ?', [roleId]);
    if (!role) {
      throw new HttpException('角色不存在', HttpStatus.NOT_FOUND);
    }

    const rows = await this.dataSource.query<{ menu_id: number }[]>(
      'SELECT `menu_id` FROM `sys_role_menu` WHERE `role_id` = ?',
      [roleId]
    );
    return rows.map(r => r.menu_id);
  }

  /** 为角色分配菜单(事务:先删后插,失败回滚避免菜单权限丢失) */
  async assignMenusToRole(roleId: number, menuIds: number[]) {
    const [role] = await this.dataSource.query<Pick<RoleRow, 'id'>[]>('SELECT `id` FROM `sys_role` WHERE `id` = ?', [roleId]);
    if (!role) {
      throw new HttpException('角色不存在', HttpStatus.NOT_FOUND);
    }

    // 校验菜单ID有效性
    if (menuIds.length > 0) {
      const placeholders = menuIds.map(() => '?').join(', ');
      const validMenus = await this.dataSource.query<Pick<PermissionRow, 'id'>[]>(
        `SELECT \`id\` FROM \`sys_menu\` WHERE \`id\` IN (${placeholders})`,
        menuIds
      );
      const validIds = validMenus.map(m => m.id);
      const invalidIds = menuIds.filter(mid => !validIds.includes(mid));
      if (invalidIds.length > 0) {
        throw new HttpException(`菜单不存在: ${invalidIds.join(', ')}`, HttpStatus.BAD_REQUEST);
      }
    }

    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query('DELETE FROM `sys_role_menu` WHERE `role_id` = ?', [roleId]);

      if (menuIds.length > 0) {
        const placeholders = menuIds.map(() => '(?, ?)').join(', ');
        const values: QueryValues = [];
        menuIds.forEach(mid => { values.push(roleId, mid); });
        await queryRunner.query(
          `INSERT INTO \`sys_role_menu\` (\`role_id\`, \`menu_id\`) VALUES ${placeholders}`,
          values
        );
      }

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      throw new HttpException(errMsg(err), HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      await queryRunner.release();
    }
  }

  /** 获取管理员绑定的角色 */
  async getAdminRoles(adminId: number) {
    const roles = await this.dataSource.query<RoleRow[]>(
      `SELECT r.\`id\`, r.\`name\`, r.\`code\`, r.\`status\`
       FROM \`sys_role\` r
       INNER JOIN \`sys_admin_role\` ar ON ar.\`role_id\` = r.\`id\`
       WHERE ar.\`admin_id\` = ?`,
      [adminId]
    );
    return roles;
  }

  /** 为管理员分配角色(事务:先删后插,失败回滚避免角色丢失) */
  async assignRolesToAdmin(adminId: number, roleIds: number[]) {
    const [admin] = await this.dataSource.query<Pick<AdminRow, 'id'>[]>('SELECT `id` FROM `sys_admin` WHERE `id` = ?', [adminId]);
    if (!admin) {
      throw new HttpException('管理员不存在', HttpStatus.NOT_FOUND);
    }

    if (roleIds.length > 0) {
      const placeholders = roleIds.map(() => '?').join(', ');
      const validRoles = await this.dataSource.query<Pick<RoleRow, 'id'>[]>(
        `SELECT \`id\` FROM \`sys_role\` WHERE \`id\` IN (${placeholders})`,
        roleIds
      );
      const validIds = validRoles.map(r => r.id);
      const invalidIds = roleIds.filter(rid => !validIds.includes(rid));
      if (invalidIds.length > 0) {
        throw new HttpException(`角色不存在: ${invalidIds.join(', ')}`, HttpStatus.BAD_REQUEST);
      }
    }

    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query('DELETE FROM `sys_admin_role` WHERE `admin_id` = ?', [adminId]);

      if (roleIds.length > 0) {
        const placeholders = roleIds.map(() => '(?, ?)').join(', ');
        const values: QueryValues = [];
        roleIds.forEach(rid => { values.push(adminId, rid); });
        await queryRunner.query(
          `INSERT INTO \`sys_admin_role\` (\`admin_id\`, \`role_id\`) VALUES ${placeholders}`,
          values
        );
      }

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      throw new HttpException(errMsg(err), HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      await queryRunner.release();
    }
  }
}

function errMsg(err: unknown): string {
  if (err instanceof HttpException) {
    return err.message;
  }
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return '操作失败';
}

interface InsertResult extends DataRow {
  insertId: number;
}

interface AdminRow extends DataRow {
  id: number;
}
