import { Module } from '@nestjs/common';
import { MembershipModule } from '../../membership/membership.module';
import { CloudStorageConfigModule } from '../../cloud-storage-config/cloud-storage-config.module';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [MembershipModule, CloudStorageConfigModule],
  controllers: [UploadController],
  providers: [UploadService]
})
export class UploadModule {}
