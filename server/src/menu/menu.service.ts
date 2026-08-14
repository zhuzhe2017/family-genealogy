import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type MenuRow,
  type MenuCreateData,
  type MenuUpdateData,
  type ElegantRoute,
  type MenuSortItem
} from './types/menu.types';
import { type QueryValues, type DataRow } from '../common/types/common';

@Injectable()
export class MenuService {
  constructor(private readonly dataSource: DataSource) {}

  /** 获取菜单树（全部） */
  async getTree() {
    const rows = await this.dataSource.query<MenuRow[]>(
      'SELECT `id`, `parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `status`, `visible`, `keep_alive`, `operator`, `create_time`, `update_time` FROM `sys_menu` ORDER BY `sort_order` ASC, `id` ASC'
    );
    return this.buildTree(rows, 0);
  }

  /** 获取菜单列表（扁平，支持分页 + 搜索 + 筛选） */
  async getList(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    status?: number;
    type?: string;
  }) {
    const { page, pageSize, keyword, status, type } = params;
    const offset = (page - 1) * pageSize;
    const where: string[] = [];
    const values: QueryValues = [];

    if (keyword) {
      where.push('`name` LIKE ?');
      values.push(`%${keyword}%`);
    }
    if (status !== undefined && status !== null) {
      where.push('`status` = ?');
      values.push(status);
    }
    if (type) {
      where.push('`type` = ?');
      values.push(type);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`sys_menu\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<MenuRow[]>(
      `SELECT \`id\`, \`parent_id\`, \`name\`, \`type\`, \`path\`, \`component\`, \`route_name\`, \`icon\`, \`permission\`, \`sort_order\`, \`status\`, \`visible\`, \`keep_alive\`, \`operator\`, \`create_time\`, \`update_time\` FROM \`sys_menu\` ${whereClause} ORDER BY \`sort_order\` ASC, \`id\` ASC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    // 给每行补充 parentName
    const parentIds = [...new Set(list.map(r => r.parent_id).filter(id => id > 0))];
    if (parentIds.length > 0) {
      const placeholders = parentIds.map(() => '?').join(', ');
      const parents = await this.dataSource.query<MenuRow[]>(
        `SELECT \`id\`, \`name\` FROM \`sys_menu\` WHERE \`id\` IN (${placeholders})`,
        parentIds
      );
      const parentMap = new Map(parents.map(p => [p.id, p.name]));
      for (const row of list) {
        row.parentName = parentMap.get(row.parent_id) || '';
      }
    } else {
      for (const row of list) {
        row.parentName = '';
      }
    }

    return { list, total, page, pageSize };
  }

  /** 获取单条菜单 */
  async getById(id: number) {
    const [row] = await this.dataSource.query<MenuRow[]>('SELECT * FROM `sys_menu` WHERE `id` = ?', [id]);
    if (!row) {
      throw new HttpException('菜单不存在', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  /** 创建菜单 */
  async create(data: MenuCreateData, operator?: string) {
    if (data.parentId > 0) {
      const [parent] = await this.dataSource.query<Pick<MenuRow, 'id'>[]>('SELECT `id` FROM `sys_menu` WHERE `id` = ?', [data.parentId]);
      if (!parent) {
        throw new HttpException('父菜单不存在', HttpStatus.BAD_REQUEST);
      }
    }

    // routeName 唯一性校验（非 button 类型才需要）
    if (data.type !== 'button' && data.routeName) {
      const [exists] = await this.dataSource.query<Pick<MenuRow, 'id'>[]>(
        'SELECT `id` FROM `sys_menu` WHERE `route_name` = ? AND `route_name` != ? LIMIT 1',
        [data.routeName, '']
      );
      if (exists) {
        throw new HttpException('路由名称已存在，请更换', HttpStatus.BAD_REQUEST);
      }
    }

    const result = await this.dataSource.query<InsertResult>(
      'INSERT INTO `sys_menu` (`parent_id`, `name`, `type`, `path`, `component`, `route_name`, `icon`, `permission`, `sort_order`, `visible`, `keep_alive`, `operator`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        data.parentId || 0,
        data.name,
        data.type || 'menu',
        data.path || '',
        data.component || '',
        data.routeName || '',
        data.icon || '',
        data.permission || '',
        data.sortOrder ?? 0,
        data.visible ?? 1,
        data.keepAlive ?? 1,
        operator || ''
      ]
    );

    return { id: result.insertId };
  }

  /** 更新菜单 */
  async update(id: number, data: MenuUpdateData, operator?: string) {
    const [menu] = await this.dataSource.query<Pick<MenuRow, 'id'>[]>('SELECT `id` FROM `sys_menu` WHERE `id` = ?', [id]);
    if (!menu) {
      throw new HttpException('菜单不存在', HttpStatus.NOT_FOUND);
    }

    // 不能将父菜单设置为自己或自己的子级
    if (data.parentId && data.parentId === id) {
      throw new HttpException('父菜单不能是自己', HttpStatus.BAD_REQUEST);
    }
    if (data.parentId) {
      const descendants = await this.getDescendantIds(id);
      if (descendants.includes(data.parentId)) {
        throw new HttpException('父菜单不能是自己的子菜单', HttpStatus.BAD_REQUEST);
      }
    }

    // routeName 唯一性校验（非 button 类型才需要）
    if (data.type !== undefined && data.type !== 'button' && data.routeName) {
      const [exists] = await this.dataSource.query<Pick<MenuRow, 'id'>[]>(
        'SELECT `id` FROM `sys_menu` WHERE `route_name` = ? AND `id` != ? AND `route_name` != ? LIMIT 1',
        [data.routeName, id, '']
      );
      if (exists) {
        throw new HttpException('路由名称已存在，请更换', HttpStatus.BAD_REQUEST);
      }
    }

    const fields: string[] = [];
    const values: QueryValues = [];

    if (data.parentId !== undefined) { fields.push('`parent_id` = ?'); values.push(data.parentId); }
    if (data.name !== undefined) { fields.push('`name` = ?'); values.push(data.name); }
    if (data.type !== undefined) { fields.push('`type` = ?'); values.push(data.type); }
    if (data.path !== undefined) { fields.push('`path` = ?'); values.push(data.path); }
    if (data.component !== undefined) { fields.push('`component` = ?'); values.push(data.component); }
    if (data.routeName !== undefined) { fields.push('`route_name` = ?'); values.push(data.routeName); }
    if (data.icon !== undefined) { fields.push('`icon` = ?'); values.push(data.icon); }
    if (data.permission !== undefined) { fields.push('`permission` = ?'); values.push(data.permission); }
    if (data.sortOrder !== undefined) { fields.push('`sort_order` = ?'); values.push(data.sortOrder); }
    if (data.status !== undefined) { fields.push('`status` = ?'); values.push(data.status); }
    if (data.visible !== undefined) { fields.push('`visible` = ?'); values.push(data.visible); }
    if (data.keepAlive !== undefined) { fields.push('`keep_alive` = ?'); values.push(data.keepAlive); }
    // 始终记录操作人
    fields.push('`operator` = ?'); values.push(operator || '');

    if (fields.length === 0) {
      throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);
    }

    values.push(id);
    await this.dataSource.query(
      `UPDATE \`sys_menu\` SET ${fields.join(', ')} WHERE \`id\` = ?`,
      values
    );
    return { success: true };
  }

  /** 删除菜单 */
  async delete(id: number) {
    const [menu] = await this.dataSource.query<Pick<MenuRow, 'id'>[]>('SELECT `id` FROM `sys_menu` WHERE `id` = ?', [id]);
    if (!menu) {
      throw new HttpException('菜单不存在', HttpStatus.NOT_FOUND);
    }

    // 检查是否有子菜单
    const [child] = await this.dataSource.query<Pick<MenuRow, 'id'>[]>(
      'SELECT `id` FROM `sys_menu` WHERE `parent_id` = ? LIMIT 1',
      [id]
    );
    if (child) {
      throw new HttpException('存在子菜单，请先删除子菜单', HttpStatus.BAD_REQUEST);
    }

    await this.dataSource.query('DELETE FROM `sys_menu` WHERE `id` = ?', [id]);
    return { success: true };
  }

  /** 批量更新排序（事务，保证原子性） */
  async updateSort(data: MenuSortItem[]) {
    if (!data || data.length === 0) {
      return { success: true };
    }
    await this.dataSource.transaction(async manager => {
      for (const item of data) {
        await manager.query(
          'UPDATE `sys_menu` SET `sort_order` = ? WHERE `id` = ?',
          [item.sortOrder, item.id]
        );
      }
    });
    return { success: true };
  }

  /** 切换状态 */
  async toggleStatus(id: number, operator?: string) {
    const [menu] = await this.dataSource.query<Pick<MenuRow, 'id' | 'status'>[]>('SELECT `id`, `status` FROM `sys_menu` WHERE `id` = ?', [id]);
    if (!menu) {
      throw new HttpException('菜单不存在', HttpStatus.NOT_FOUND);
    }
    const newStatus = menu.status === 1 ? 0 : 1;
    await this.dataSource.query(
      'UPDATE `sys_menu` SET `status` = ?, `operator` = ? WHERE `id` = ?',
      [newStatus, operator || '', id]
    );
    return { id, status: newStatus };
  }

  // ==================== 动态路由方法 ====================

  /** 获取常量路由（动态模式下常量路由由前端内置处理，这里返回空数组） */
  getConstantRoutes(): ElegantRoute[] {
    return [];
  }

  /** 根据管理员ID获取其有权限访问的路由 */
  async getUserRoutes(adminId: number, defaultRole: string) {
    let menuRows: MenuRow[];

    if (defaultRole === 'super') {
      // 超级管理员返回所有启用菜单
      menuRows = await this.dataSource.query<MenuRow[]>(
        `SELECT \`id\`, \`parent_id\`, \`name\`, \`type\`, \`path\`, \`component\`, \`route_name\`, \`icon\`, \`permission\`, \`sort_order\`, \`visible\`, \`keep_alive\`
         FROM \`sys_menu\`
         WHERE \`status\` = 1 AND \`type\` != 'button'
         ORDER BY \`sort_order\` ASC, \`id\` ASC`
      );
    } else {
      // 非超级管理员：通过 sys_role_menu 过滤
      menuRows = await this.dataSource.query<MenuRow[]>(
        `SELECT DISTINCT m.\`id\`, m.\`parent_id\`, m.\`name\`, m.\`type\`, m.\`path\`, m.\`component\`, m.\`route_name\`, m.\`icon\`, m.\`permission\`, m.\`sort_order\`, m.\`visible\`, m.\`keep_alive\`
         FROM \`sys_menu\` m
         INNER JOIN \`sys_role_menu\` rm ON rm.\`menu_id\` = m.\`id\`
         INNER JOIN \`sys_admin_role\` ar ON ar.\`role_id\` = rm.\`role_id\`
         WHERE m.\`status\` = 1 AND m.\`type\` != 'button' AND ar.\`admin_id\` = ?
         ORDER BY m.\`sort_order\` ASC, m.\`id\` ASC`,
        [adminId]
      );
    }

    const routes = this.buildElegantRoutes(menuRows, 0);

    // 默认首页为 home，如未配置则取第一个叶子路由
    let home = 'home';
    if (!routes.some(r => r.name === 'home')) {
      const firstLeaf = this.findFirstLeafRoute(routes);
      home = firstLeaf?.name || 'home';
    }

    return { routes, home };
  }

  /** 判断指定路由对当前用户是否可见 */
  async isRouteExist(routeName: string, adminId: number, defaultRole: string) {
    const { routes } = await this.getUserRoutes(adminId, defaultRole);
    return this.findRouteByName(routes, routeName) !== null;
  }

  // ==================== 私有方法 ====================

  private buildTree(rows: MenuRow[], parentId: number): MenuRow[] {
    const children = rows
      .filter(r => r.parent_id === parentId)
      .map(r => ({
        ...r,
        children: this.buildTree(rows, r.id)
      }));
    // 只返回有孩子的节点或非目录
    return children;
  }

  /** 将菜单行转换为 elegant-router 路由树 */
  private buildElegantRoutes(rows: MenuRow[], parentId: number): ElegantRoute[] {
    const children = rows
      .filter(r => r.parent_id === parentId)
      .map(r => {
        const routeName = r.route_name || String(r.id);
        const route: ElegantRoute = {
          id: String(r.id),
          name: routeName,
          path: r.path || '',
          meta: {
            title: r.name,
            order: Number(r.sort_order) || 0,
            hideInMenu: r.visible === 0,
            keepAlive: r.keep_alive === 1
          }
        };

        // 目录默认使用 base 布局，叶子菜单默认使用 view.{routeName} 组件
        if (r.type === 'directory') {
          route.component = r.component || 'layout.base';
        } else if (r.type === 'menu') {
          route.component = r.component || `view.${routeName}`;
        }

        if (r.icon) {
          route.meta.icon = r.icon;
        }

        if (r.permission) {
          route.meta.permissions = [r.permission];
        }

        const childRoutes = this.buildElegantRoutes(rows, r.id);
        if (childRoutes.length > 0) {
          route.children = childRoutes;
        }

        return route;
      });

    return children;
  }

  private findFirstLeafRoute(routes: ElegantRoute[]): ElegantRoute | null {
    for (const route of routes) {
      if (!route.children?.length) {
        return route;
      }
      const leaf = this.findFirstLeafRoute(route.children);
      if (leaf) {
        return leaf;
      }
    }
    return null;
  }

  private findRouteByName(routes: ElegantRoute[], name: string): ElegantRoute | null {
    for (const route of routes) {
      if (route.name === name) {
        return route;
      }
      if (route.children?.length) {
        const found = this.findRouteByName(route.children, name);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  private async getDescendantIds(id: number): Promise<number[]> {
    const rows = await this.dataSource.query<Pick<MenuRow, 'id'>[]>(
      'SELECT `id` FROM `sys_menu` WHERE `parent_id` = ?',
      [id]
    );
    const ids: number[] = [];
    for (const row of rows) {
      ids.push(row.id);
      const childIds = await this.getDescendantIds(row.id);
      ids.push(...childIds);
    }
    return ids;
  }
}

interface InsertResult extends DataRow {
  insertId: number;
}
