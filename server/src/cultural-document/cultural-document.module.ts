import { Module } from '@nestjs/common';
import { CulturalDocumentService } from './cultural-document.service';
import {
  CulturalDocumentPublicController,
  CulturalDocumentFamilyController,
  CulturalDocumentPublicAdminController
} from './cultural-document.controller';

/**
 * 文化文档模块（识典古籍对标 · Task 1.1）
 * 覆盖：公共古籍 / 家族族谱 / 手写稿 —— 三类统一容器
 * 依赖：DataSource（TypeORM 全局）/ JwtAuthGuard + PermissionsGuard（全局）
 */
@Module({
  controllers: [
    CulturalDocumentPublicController,
    CulturalDocumentFamilyController,
    CulturalDocumentPublicAdminController
  ],
  providers: [CulturalDocumentService],
  exports: [CulturalDocumentService]
})
export class CulturalDocumentModule {}
