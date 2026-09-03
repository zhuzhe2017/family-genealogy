import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  code: string;
  data: T;
  msg: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T> | T> {
    // 文件下载/导出类接口返回原始内容，不做统一 {code,data,msg} 包装，
    // 否则前端以 blob 下载到的会是 JSON 字符串而非 CSV 内容
    const request = context.switchToHttp().getRequest<{ path?: string }>();
    if (request.path && (request.path.endsWith('/import-template') || request.path.endsWith('/export'))) {
      return next.handle();
    }
    return next.handle().pipe(
      map((data: T) => ({
        code: '0000',
        data,
        msg: 'success'
      }))
    );
  }
}
