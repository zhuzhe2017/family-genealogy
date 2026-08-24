import { Module } from '@nestjs/common';
import { MemberAdminController } from './member-admin.controller';
import { MemberAdminService } from './member-admin.service';
import { MemberController } from './member.controller';
import { MemberService } from './member.service';

@Module({
  controllers: [MemberAdminController, MemberController],
  providers: [MemberAdminService, MemberService],
  exports: [MemberService, MemberAdminService]
})
export class MemberModule {}
