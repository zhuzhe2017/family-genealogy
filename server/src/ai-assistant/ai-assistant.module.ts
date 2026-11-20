import { Module } from '@nestjs/common';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { LlmModule } from '../llm/llm.module';
import { MembershipModule } from '../membership/membership.module';

/** AI 助手模块（识典古籍对标 · 阶段 2） */
@Module({
  imports: [LlmModule, MembershipModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService],
  exports: [AiAssistantService]
})
export class AiAssistantModule {}
