import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** 指定允许访问的角色编码列表 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
