import { Module } from '@nestjs/common';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { TenantJwtAuthGuard, TenantAuthGuard } from './guards/tenant-auth.guard';
import { FamilyModule } from '../family/family.module';
import { FamilyMemberModule } from '../family-member/family-member.module';
import { ContentModule } from '../content/content.module';

@Module({
  imports: [FamilyModule, FamilyMemberModule, ContentModule],
  controllers: [TenantController],
  providers: [TenantService, TenantJwtAuthGuard, TenantAuthGuard],
  exports: [TenantService, TenantAuthGuard]
})
export class TenantModule {}
