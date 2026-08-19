import { Module } from '@nestjs/common';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { InvitationAdminController } from './invitation-admin.controller';
import { InvitationAdminService } from './invitation-admin.service';

@Module({
  controllers: [InvitationController, InvitationAdminController],
  providers: [InvitationService, InvitationAdminService],
  exports: [InvitationService]
})
export class InvitationModule {}
