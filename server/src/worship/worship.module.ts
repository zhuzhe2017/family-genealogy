import { Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module';
import { WorshipAdminController } from './worship-admin.controller';
import { WorshipAdminService } from './worship-admin.service';
import { WorshipController } from './worship.controller';
import { WorshipService } from './worship.service';

@Module({
  imports: [MembershipModule],
  controllers: [WorshipController, WorshipAdminController],
  providers: [WorshipService, WorshipAdminService]
})
export class WorshipModule {}
