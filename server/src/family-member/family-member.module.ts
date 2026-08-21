import { Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module';
import { FamilyMemberController } from './family-member.controller';
import { FamilyMemberService } from './family-member.service';
import { MemberImportService } from './member-import.service';

@Module({
  imports: [MembershipModule],
  controllers: [FamilyMemberController],
  providers: [FamilyMemberService, MemberImportService],
  exports: [FamilyMemberService]
})
export class FamilyMemberModule {}
