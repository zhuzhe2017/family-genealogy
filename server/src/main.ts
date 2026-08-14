import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { UPLOAD_DIR } from './common/upload/upload.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose']
  });
  const logger = new Logger('Bootstrap');

  // helmet:设置一组安全 HTTP 响应头(X-Content-Type-Options、Strict-Transport-Security 等),
  // 必须在路由处理前生效,放在最前
  // 禁用 CSP:本服务为纯 JSON API,CSP 适用于 HTML 页面而非 API 响应;
  // 前端 CSP 应在前端部署层(nginx/CDN/index.html meta)按 Vue 应用需求单独配置
  // 禁用 crossOriginResourcePolicy:微信小程序 <image> 组件加载 /uploads 图片是跨源请求,
  // 默认的 Cross-Origin-Resource-Policy: same-origin 会直接拦截图片(ERR_BLOCKED_BY_RESPONSE)
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false
  }));

  app.setGlobalPrefix('api');

  // 静态资源：全局前缀 api 不作用于静态资源,上传的图片通过 /uploads/xxx 访问
  // 显式声明 cross-origin,确保小程序 image 组件可以跨源加载上传的图片
  app.useStaticAssets(join(UPLOAD_DIR), {
    prefix: '/uploads/',
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  });

  // CORS:依据 CORS_ORIGINS 环境变量配置白名单
  // 未配置时默认拒绝跨域请求,避免生产环境意外开放
  const rawOrigins = process.env.CORS_ORIGINS?.trim();
  const allowedOrigins = rawOrigins
    ? rawOrigins.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  app.enableCors({
    origin: (origin, cb) => {
      // 同源请求(无 origin)以及白名单内的来源允许通过
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin ${origin} not allowed`), false);
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true
  });

  // 全局 ValidationPipe:启用 DTO 自动转换与属性白名单,剥离未声明字段
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false
    })
  );

  app.useGlobalInterceptors(new ResponseInterceptor());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Server is running on: http://localhost:${port}/api`);
}

void bootstrap();
