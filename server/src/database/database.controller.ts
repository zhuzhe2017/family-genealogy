import { Controller, Get, HttpException, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * 数据库诊断接口:暴露连接池状态与连通性,
 * 仅超级管理员可访问,避免未授权探测。
 */
@Roles('super')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('database')
export class DatabaseController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('status')
  async getStatus() {
    // ...
    const isInitialized = this.dataSource.isInitialized;
    let isConnected = false;
    let poolInfo: PoolInfo | null = null;
    let error: string | null = null;

    if (isInitialized) {
      try {
        const runner = this.dataSource.createQueryRunner();
        await runner.connect();
        const result = (await runner.query('SELECT 1 AS ok')) as { ok: number }[];
        isConnected = result?.[0]?.ok === 1;
        await runner.release();

        const pool = (this.dataSource.driver as MysqlDriverLike).pool;
        if (pool) {
          poolInfo = {
            totalConnections: pool._allConnections?.length ?? null,
            freeConnections: pool._freeConnections?.length ?? null,
            acquiringConnections: pool._acquiringConnections?.length ?? null,
            waitingClients: pool._connectionQueue?.length ?? null
          };
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        isConnected = false;
      }
    }

    return {
      initialized: isInitialized,
      connected: isConnected,
      timestamp: new Date().toISOString(),
      poolInfo,
      error
    };
  }

  @Post('test')
  async testConnection() {
    try {
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize();
      }

      const runner = this.dataSource.createQueryRunner();
      await runner.connect();
      const result = (await runner.query('SELECT 1 AS ok')) as { ok: number }[];
      await runner.release();

      if (result?.[0]?.ok !== 1) {
        throw new HttpException('数据库连接测试失败', HttpStatus.SERVICE_UNAVAILABLE);
      }

      return {
        success: true,
        message: '数据库连接成功',
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : '数据库连接失败';
      throw new HttpException(
        {
          success: false,
          message,
          timestamp: new Date().toISOString()
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }
}

/** 数据库连接池状态信息 */
interface PoolInfo {
  totalConnections: number | null;
  freeConnections: number | null;
  acquiringConnections: number | null;
  waitingClients: number | null;
}

/** mysql2 连接池的最小结构（仅用于诊断接口读取池状态） */
interface MysqlDriverLike {
  pool?: {
    _allConnections?: unknown[];
    _freeConnections?: unknown[];
    _acquiringConnections?: unknown[];
    _connectionQueue?: unknown[];
  };
}
