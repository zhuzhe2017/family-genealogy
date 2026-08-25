import { Module } from '@nestjs/common';
import { CloudStorageConfigController } from './cloud-storage-config.controller';
import { CloudStorageConfigService } from './cloud-storage-config.service';
import { CloudStorageUploadService } from './cloud-storage-upload.service';

@Module({
  controllers: [CloudStorageConfigController],
  providers: [CloudStorageConfigService, CloudStorageUploadService],
  exports: [CloudStorageConfigService, CloudStorageUploadService]
})
export class CloudStorageConfigModule {}
