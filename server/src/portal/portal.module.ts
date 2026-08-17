import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { FamilyModule } from '../family/family.module';
import { FamilyMemberModule } from '../family-member/family-member.module';
import { ContentModule } from '../content/content.module';
import { MembershipModule } from '../membership/membership.module';
import { UserModule } from '../user/user.module';
import { UserJwtAuthGuard } from '../user/user.guard';

@Module({
  imports: [FamilyModule, FamilyMemberModule, ContentModule, MembershipModule, UserModule],
  controllers: [PortalController],
  providers: [PortalService, UserJwtAuthGuard]
})
export class PortalModule {}
