import { Module } from '@nestjs/common';
import { PayConfigController } from './pay-config.controller';
import { PayConfigService } from './pay-config.service';

@Module({
  controllers: [PayConfigController],
  providers: [PayConfigService],
  exports: [PayConfigService]
})
export class PayConfigModule {}
