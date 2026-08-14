import { Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DatabaseController } from './database.controller';
import { DatabaseService } from './database.service';

@Module({
  controllers: [DatabaseController],
  providers: [DatabaseService]
})
export class DatabaseModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    // 初始化失败时直接抛出异常,让应用在启动阶段失败,避免带病的连接继续提供服务
    if (!this.dataSource.isInitialized) {
      await this.dataSource.initialize();
    }
    this.logger.log('数据库连接已初始化');
  }

  async onModuleDestroy() {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
      this.logger.log('数据库连接已关闭');
    }
  }
}
