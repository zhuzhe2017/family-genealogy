import { Module } from '@nestjs/common';
import { MemberAdminController } from './member-admin.controller';
import { MemberAdminService } from './member-admin.service';

@Module({
  controllers: [MemberAdminController],
  providers: [MemberAdminService]
})
export class MemberModule {}
