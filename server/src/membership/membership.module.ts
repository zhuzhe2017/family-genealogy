import { Module } from '@nestjs/common';
import { EntitlementService } from './membership.service';
import { EntitlementGuard } from './guards/entitlement.guard';

@Module({
  providers: [EntitlementService, EntitlementGuard],
  exports: [EntitlementService, EntitlementGuard]
})
export class MembershipModule {}
