import { Controller, Get, Delete, Param, Query, Res, UseGuards } from '@nestjs/common';
import { type Response } from 'express';
import { SystemLogService } from './system-log.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { SystemLogQueryParams, SystemLogCleanParams } from './types/system-log.types';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('system-log')
export class SystemLogController {
  constructor(private readonly systemLogService: SystemLogService) {}

  /** 分页查询 */
  @Permissions('system:settings:log:list')
  @Get('list')
  async getList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('logType') logType?: string,
    @Query('module') module?: string,
    @Query('keyword') keyword?: string,
    @Query('operator') operator?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string
  ) {
    const params: SystemLogQueryParams = {
      page: Number(page),
      pageSize: Math.min(Number(pageSize) || 10, 100),
      logType,
      module,
      keyword,
      operator,
      startTime,
      endTime
    };
    return this.systemLogService.getList(params);
  }

  /** 各类型日志统计 */
  @Permissions('system:settings:log:list')
  @Get('stats')
  async getStats() {
    return this.systemLogService.getStats();
  }

  /** 导出 CSV（需在 :id 路由之前声明；流式写入，避免大日志量整体加载内存） */
  @Permissions('system:settings:log:export')
  @Get('export')
  async export(
    @Res() res: Response,
    @Query('logType') logType?: string,
    @Query('module') module?: string,
    @Query('keyword') keyword?: string,
    @Query('operator') operator?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string
  ) {
    const filename = `system-log-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    try {
      await this.systemLogService.exportToCsv(res, {
        page: 1,
        pageSize: 10_000,
        logType,
        module,
        keyword,
        operator,
        startTime,
        endTime
      });
    } catch (err: unknown) {
      // 导出中途失败时尽量终结响应，避免客户端一直等待
      if (!res.headersSent) {
        res.status(500).json({ code: '500', data: null, msg: '日志导出失败' });
        return;
      }
      res.end();
       
      console.error('[system-log] 导出失败:', err instanceof Error ? err.message : err);
    }
  }

  /** 单条日志详情 */
  @Permissions('system:settings:log:list')
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.systemLogService.getById(Number(id));
  }

  /** 清理日志 */
  @Permissions('system:settings:log:delete')
  @Delete('clean')
  async clean(
    @Query('logType') logType?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string
  ) {
    const params: SystemLogCleanParams = { logType, startTime, endTime };
    return this.systemLogService.clean(params);
  }

  /** 删除单条日志 */
  @Permissions('system:settings:log:delete')
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.systemLogService.delete(Number(id));
  }
}
