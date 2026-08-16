import { Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [MembershipModule],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService]
})
export class ContentModule {}
