import { Module } from '@nestjs/common';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { CloudStorageConfigModule } from '../cloud-storage-config/cloud-storage-config.module';
import { MembershipModule } from '../membership/membership.module';

/** TTS 模块（识典古籍对标 · 阶段 4） */
@Module({
  imports: [CloudStorageConfigModule, MembershipModule],
  controllers: [TtsController],
  providers: [TtsService],
  exports: [TtsService]
})
export class TtsModule {}
