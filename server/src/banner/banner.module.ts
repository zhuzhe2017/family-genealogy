import { Module } from '@nestjs/common';
import { BannerAdminController } from './banner-admin.controller';
import { BannerAdminService } from './banner-admin.service';
import { BannerController, BannerPublicController } from './banner.controller';
import { BannerService } from './banner.service';

@Module({
  controllers: [BannerController, BannerAdminController, BannerPublicController],
  providers: [BannerService, BannerAdminService]
})
export class BannerModule {}
