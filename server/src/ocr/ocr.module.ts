import { Module } from '@nestjs/common';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { LlmModule } from '../llm/llm.module';
import { MembershipModule } from '../membership/membership.module';

/** OCR 手写族谱录入模块（识典古籍对标 · 阶段 5） */
@Module({
  imports: [LlmModule, MembershipModule],
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService]
})
export class OcrModule {}
