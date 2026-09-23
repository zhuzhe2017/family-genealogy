import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit() {
    this.healthCheckTimer = setInterval(() => {
      void this.checkConnection();
    }, 30000);
  }

  onModuleDestroy() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private async checkConnection() {
    let runner: QueryRunner | null = null;
    try {
      if (this.dataSource.isInitialized) {
        runner = this.dataSource.createQueryRunner();
        await runner.connect();
        await runner.query('SELECT 1');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知连接错误';
      this.logger.warn(`数据库连接探测失败: ${message}`);
    } finally {
      if (runner) {
        await runner.release();
      }
    }
  }
}
