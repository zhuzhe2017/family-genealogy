import { Module } from '@nestjs/common';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { CloudStorageConfigModule } from '../cloud-storage-config/cloud-storage-config.module';
import { MembershipModule } from '../membership/membership.module';
import { UserModule } from '../user/user.module';

/**
 * TTS 模块（识典古籍对标 · 阶段 4）
 * UserModule import 确保 UserJwtStrategy 被实例化注册，
 * 使 JwtAuthGuard 双策略（jwt + user-jwt）能正确识别小程序用户令牌。
 */
@Module({
  imports: [CloudStorageConfigModule, MembershipModule, UserModule],
  controllers: [TtsController],
  providers: [TtsService],
  exports: [TtsService]
})
export class TtsModule {}
