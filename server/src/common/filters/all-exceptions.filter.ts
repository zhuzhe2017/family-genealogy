import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger, PayloadTooLargeException } from '@nestjs/common';
import { Response } from 'express';
import { SystemLogService } from '../../system-log/system-log.service';
import { EntitlementException } from '../../membership/membership.exception';
import { MAX_FILE_SIZE } from '../upload/upload.service';
import type { AuthenticatedRequest } from '../types/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly systemLogService: SystemLogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<AuthenticatedRequest>();

    let status: number;
    let message: string;

    // 权益校验异常：HTTP 200 + 业务码 4xxx，前端据此统一拦截跳转会员中心
    if (exception instanceof EntitlementException) {
      response.status(HttpStatus.OK).json({
        code: exception.code,
        data: null,
        msg: exception.message
      });
      return;
    }

    if (exception instanceof PayloadTooLargeException) {
      // 请求体过大：文件上传场景(multer 将 LIMIT_FILE_SIZE 转为 PayloadTooLargeException)给出友好提示;
      // 其他场景(如 JSON body 过大)保留原始错误信息
      status = exception.getStatus();
      const isUpload = (request.headers['content-type'] || '').toLowerCase().includes('multipart/form-data');
      message = isUpload
        ? `文件大小不能超过 ${MAX_FILE_SIZE / (1024 * 1024)}MB`
        : exception.message;
    } else {
      status = exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
      message = exception instanceof Error ? exception.message : '服务器内部错误';
    }

    this.logger.error(
      `${request.method} ${request.url} ${status} - ${message}`,
      exception instanceof Error ? exception.stack : undefined
    );

    // 5xx 错误记录错误日志（4xx 业务错误由访问日志记录 success=0）
    if (status >= 500) {
      this.systemLogService.writeAsync({
        logType: 'error',
        module: this.inferModule(request.path || request.url || ''),
        action: '请求异常',
        method: request.method,
        path: request.path || request.url,
        operator: request.user?.username || 'anonymous',
        operatorId: this.normalizeOperatorId(request.user?.id),
        ip: request.ip || '',
        userAgent: request.headers['user-agent'] as string,
        status,
        success: false,
        detail: exception instanceof Error ? `${exception.message}\n${exception.stack || ''}` : String(message),
        costTime: 0
      });
    }

    response.status(status).json({
      code: Number(status) === Number(HttpStatus.INTERNAL_SERVER_ERROR) ? '9999' : String(status),
      data: null,
      msg: message
    });
  }

  private inferModule(path: string): string {
    return (path || '').replace(/^\/api\//, '').split('/')[0] || '';
  }

  /**
   * 归一化操作人ID：sys_log.operator_id 为 INT UNSIGNED，
   * 仅管理员令牌 id 是数字；小程序用户令牌 id 为 32 位 hex 字符串会越界，统一返回 null
   */
  private normalizeOperatorId(id: unknown): number | null {
    return typeof id === 'number' && Number.isInteger(id) ? id : null;
  }
}
