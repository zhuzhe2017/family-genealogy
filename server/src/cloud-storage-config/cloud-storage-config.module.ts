import { Module } from '@nestjs/common';
import { CloudStorageConfigController } from './cloud-storage-config.controller';
import { CloudStorageConfigService } from './cloud-storage-config.service';

@Module({
  controllers: [CloudStorageConfigController],
  providers: [CloudStorageConfigService],
  exports: [CloudStorageConfigService]
})
export class CloudStorageConfigModule {}
