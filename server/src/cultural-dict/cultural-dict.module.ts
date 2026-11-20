import { Module } from '@nestjs/common';
import { CulturalDictService } from './cultural-dict.service';
import { CulturalDictController } from './cultural-dict.controller';

/** 文化字典模块（识典古籍对标 · 阶段 1 补充） */
@Module({
  controllers: [CulturalDictController],
  providers: [CulturalDictService],
  exports: [CulturalDictService]
})
export class CulturalDictModule {}
