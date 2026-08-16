import { Module } from '@nestjs/common';
import { MembershipModule } from '../../membership/membership.module';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [MembershipModule],
  controllers: [UploadController],
  providers: [UploadService]
})
export class UploadModule {}
