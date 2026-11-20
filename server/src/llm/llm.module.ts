import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service';

/**
 * LLM 统一模块（识典古籍对标基础设施）
 * - @Global() 全局可用，任何模块注入 LlmService 即可调用
 * - 依赖 ConfigCryptoModule（已 @Global()）解密 API Key
 * - 依赖 TypeORM DataSource（已在 AppModule 全局引入）读取 sys_config
 */
@Global()
@Module({
  providers: [LlmService],
  exports: [LlmService]
})
export class LlmModule {}
