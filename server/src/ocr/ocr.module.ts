import { Module } from '@nestjs/common';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { LlmModule } from '../llm/llm.module';
import { MembershipModule } from '../membership/membership.module';
import { UserModule } from '../user/user.module';

/**
 * OCR 手写族谱录入模块（识典古籍对标 · 阶段 5）
 * UserModule import 确保 UserJwtStrategy 被实例化注册，
 * 使 JwtAuthGuard 双策略（jwt + user-jwt）能正确识别小程序用户令牌。
 */
@Module({
  imports: [LlmModule, MembershipModule, UserModule],
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService]
})
export class OcrModule {}
