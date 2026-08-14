import { Injectable, NestInterceptor, ExecutionContext, CallHandler, HttpException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { SystemLogService, inferModule, describeAction } from './system-log.service';
import { SystemSecurityService } from '../system-security/system-security.service';
import { type AuthenticatedRequest } from '../common/types/common';

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * 全局日志拦截器：
 * - 每个 API 请求记录一条访问日志（access）
 * - 写操作(POST/PUT/DELETE)成功后额外记录一条操作日志（operation）
 * - 请求失败时记录访问日志 success=0，方便登录锁定等安全策略计数
 * 日志写入为 fire-and-forget，不阻塞业务响应；/auth/login 的日志等待写入完成，
 * 保证连续失败可被登录锁定策略可靠读取。
 */
@Injectable()
export class LogInterceptor implements NestInterceptor {
  constructor(
    private readonly systemLogService: SystemLogService,
    private readonly securityService: SystemSecurityService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const path = req.path || req.url || '';
    const method = req.method || 'GET';
    const start = Date.now();

    // 跳过系统日志自身的接口，避免日志查看页面产生海量访问日志
    if (path.startsWith('/api/system-log')) {
      return next.handle();
    }

    // 是否开启访问日志
    const accessEnabled = this.securityService
      .getConfig('log_access_enabled', 'true')
      .catch(() => 'true');

    const operator = this.resolveOperator(req);

    return next.handle().pipe(
      tap(() => {
        void accessEnabled.then(async enabled => {
          if (enabled !== 'true') return;
          const cost = Date.now() - start;
          const base = {
            module: inferModule(path),
            action: describeAction(method, path),
            method,
            path,
            operator,
            operatorId: this.normalizeOperatorId(req.user?.id),
            ip: this.getClientIp(req),
            userAgent: req.headers['user-agent'] as string,
            status: 200,
            success: true,
            costTime: cost
          };
          if (MUTATING_METHODS.includes(method)) {
            this.systemLogService.writeAsync({ ...base, logType: 'operation', detail: this.buildDetail(req) });
          }
          // 登录相关日志等待写入完成，保证锁定计数即时可见
          const write = this.systemLogService.write({ ...base, logType: 'access' });
          if (path.includes('/auth/')) {
            await write;
          }
        });
      }),
      catchError((err: unknown) => {
        void accessEnabled.then(enabled => {
          if (enabled !== 'true') return;
          const cost = Date.now() - start;
          const status = err instanceof HttpException ? err.getStatus() : 500;
          const detail = err instanceof Error ? err.message : '请求失败';
          this.systemLogService.writeAsync({
            logType: 'access',
            module: inferModule(path),
            action: describeAction(method, path),
            method,
            path,
            operator,
            operatorId: this.normalizeOperatorId(req.user?.id),
            ip: this.getClientIp(req),
            userAgent: req.headers['user-agent'] as string,
            status,
            success: false,
            detail,
            costTime: cost
          });
        });
        throw err;
      })
    );
  }

  /** 解析操作人：已登录取用户名，登录接口取请求体用户名 */
  private resolveOperator(req: AuthenticatedRequest): string {
    if (req.user?.username) return req.user.username;
    const body = (req as AuthenticatedRequest & { body?: { userName?: string } }).body;
    if (body?.userName) return body.userName;
    return 'anonymous';
  }

  /**
   * 归一化操作人ID：sys_log.operator_id 为 INT UNSIGNED，
   * 仅管理员令牌 id 是数字；小程序用户令牌 id 为 32 位 hex 字符串，
   * 直接写入会越界，此处对非数字 id 统一返回 null
   */
  private normalizeOperatorId(id: unknown): number | null {
    return typeof id === 'number' && Number.isInteger(id) ? id : null;
  }

  /** 提取客户端 IP（兼容反向代理 X-Forwarded-For） */
  private getClientIp(req: AuthenticatedRequest): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || '';
  }

  /** 构建操作日志详情（截断敏感字段，如密码） */
  private buildDetail(req: AuthenticatedRequest): string {
    const body = (req as AuthenticatedRequest & { body?: Record<string, unknown> }).body;
    if (!body || Object.keys(body).length === 0) return '';
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (/password|pwd|captcha/i.test(k)) continue; // 不记录密码/验证码
      safe[k] = v;
    }
    return JSON.stringify(safe);
  }
}
