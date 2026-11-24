import { Module } from '@nestjs/common';
import { CulturalDocumentService } from './cultural-document.service';
import {
  CulturalDocumentPublicController,
  CulturalDocumentFamilyController,
  CulturalDocumentPublicAdminController
} from './cultural-document.controller';
import { UserModule } from '../user/user.module';

/**
 * 文化文档模块（识典古籍对标 · Task 1.1）
 * 覆盖：公共古籍 / 家族族谱 / 手写稿 —— 三类统一容器
 * 依赖：DataSource（TypeORM 全局）/ JwtAuthGuard + PermissionsGuard（全局）
 *       UserModule import 为 CulturalDocumentFamilyController 的 AuthGuard(['jwt','user-jwt'])
 *       提供 user-jwt 策略（UserJwtStrategy 是 UserModule provider，非 Global）
 */
@Module({
  imports: [UserModule],
  controllers: [
    CulturalDocumentPublicController,
    CulturalDocumentFamilyController,
    CulturalDocumentPublicAdminController
  ],
  providers: [CulturalDocumentService],
  exports: [CulturalDocumentService]
})
export class CulturalDocumentModule {}
