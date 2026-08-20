import { Module } from '@nestjs/common';
import { GatheringAdminController } from './gathering-admin.controller';
import { GatheringAdminService } from './gathering-admin.service';
import { GatheringController } from './gathering.controller';
import { GatheringService } from './gathering.service';

@Module({
  controllers: [GatheringController, GatheringAdminController],
  providers: [GatheringService, GatheringAdminService]
})
export class GatheringModule {}
