import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SystemLogController } from './system-log.controller';
import { SystemLogService } from './system-log.service';
import { LogInterceptor } from './log.interceptor';

@Global()
@Module({
  controllers: [SystemLogController],
  providers: [
    SystemLogService,
    // 全局访问/操作日志拦截器
    {
      provide: APP_INTERCEPTOR,
      useClass: LogInterceptor
    }
  ],
  exports: [SystemLogService]
})
export class SystemLogModule {}
