import { Module } from '@nestjs/common';
import { RoleController, PermissionController, AdminRoleController } from './role.controller';
import { RoleService } from './role.service';

@Module({
  controllers: [RoleController, PermissionController, AdminRoleController],
  providers: [RoleService],
  exports: [RoleService]
})
export class RoleModule {}
