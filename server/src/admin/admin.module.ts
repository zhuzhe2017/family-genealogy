import { Module } from '@nestjs/common';
import { AdminController, AdminManageController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController, AdminManageController],
  providers: [AdminService]
})
export class AdminModule {}
