import { Module } from '@nestjs/common';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { LlmModule } from '../llm/llm.module';
import { MembershipModule } from '../membership/membership.module';
import { UserModule } from '../user/user.module';

/**
 * AI 助手模块（识典古籍对标 · 阶段 2）
 * UserModule import 为 AuthGuard(['jwt','user-jwt']) 提供 user-jwt 策略
 * （UserJwtStrategy 是 UserModule 的 provider，非 Global，必须显式 import）
 */
@Module({
  imports: [LlmModule, MembershipModule, UserModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService],
  exports: [AiAssistantService]
})
export class AiAssistantModule {}
