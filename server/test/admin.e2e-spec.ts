jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockReturnValue('hashed')
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminController, AdminManageController } from '../src/admin/admin.controller';
import { AdminService } from '../src/admin/admin.service';
import { SystemSecurityService } from '../src/system-security/system-security.service';
import { JwtAuthGuard } from '../src/auth/guard/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

/**
 * 管理员 / 认证模块集成测试
 * - 通过 overrideGuard 绕过 JWT/角色/权限守卫(同时注入 req.user 以供 getUserInfo 使用)
 * - 通过 mock DataSource 隔离真实数据库
 * - bcrypt 与 JwtService、ConfigService 均被 mock
 */
describe('Admin & Auth (e2e)', () => {
  let app: INestApplication;
  let queryMock: jest.Mock;
  const qrQueryMock = jest.fn();
  const jwtVerifyAsyncMock = jest.fn();
  const jwtSignMock = jest.fn().mockReturnValue('mock-token');

  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    query: qrQueryMock,
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined)
  };

  beforeAll(async () => {
    queryMock = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminController, AdminManageController],
      providers: [
        AdminService,
        { provide: JwtService, useValue: { sign: jwtSignMock, verifyAsync: jwtVerifyAsyncMock } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: DataSource, useValue: { query: queryMock, createQueryRunner: jest.fn().mockReturnValue(queryRunner) } },
        // securityService 关键方法全部 mock:getConfig 返回配置默认值,校验类方法直接放行
        {
          provide: SystemSecurityService,
          useValue: {
            checkLoginAllowed: jest.fn().mockResolvedValue(undefined),
            getConfig: jest.fn().mockResolvedValue('7'),
            validatePassword: jest.fn().mockResolvedValue(''),
            verifyPassword: jest.fn().mockResolvedValue(true)
          }
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          if (!req.user) req.user = { id: 1, username: 'admin', role: 'super' };
          return true;
        }
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    queryMock.mockReset();
    qrQueryMock.mockReset();
    jwtVerifyAsyncMock.mockReset();
  });

  describe('POST /auth/login', () => {
    it('用户不存在返回 401', async () => {
      queryMock.mockResolvedValueOnce([]); // SELECT sys_admin 为空

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ userName: 'nobody', password: '123456' });

      expect(res.status).toBe(401);
    });

    it('登录成功返回 token', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1, username: 'admin', password: 'hashed', role: 'super', status: 1 }]) // SELECT
        .mockResolvedValueOnce({ affectedRows: 1 }); // UPDATE last_login_time

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ userName: 'admin', password: '123456' });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.token).toBe('mock-token');
    });
  });

  describe('GET /auth/getUserInfo', () => {
    it('返回当前管理员信息', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1, username: 'admin', role: 'super', status: 1, nickname: 'admin', avatar_url: null, phone: null, email: null, last_login_time: null }]) // 主查询
        .mockResolvedValueOnce([]) // families
        .mockResolvedValueOnce([]) // getAdminRoles JOIN
        .mockResolvedValueOnce([]); // getAdminPermissions (super 分支)

      const res = await request(app.getHttpServer()).get('/auth/getUserInfo');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.userName).toBe('admin');
    });
  });

  describe('POST /auth/refreshToken', () => {
    it('空 body 返回 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refreshToken')
        .send({});

      expect(res.status).toBe(400);
    });

    it('刷新成功返回新 token', async () => {
      jwtVerifyAsyncMock.mockResolvedValueOnce({ sub: 1 });
      queryMock.mockResolvedValueOnce([{ id: 1, username: 'admin', role: 'super', status: 1 }]); // SELECT admin

      const res = await request(app.getHttpServer())
        .post('/auth/refreshToken')
        .send({ refreshToken: 'some-refresh-token' });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.token).toBe('mock-token');
    });
  });

  describe('GET /admin/list', () => {
    it('返回管理员分页列表', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 1 }]) // COUNT
        .mockResolvedValueOnce([{ id: 1, username: 'admin', role: 'super', status: 1 }]); // SELECT list

      const res = await request(app.getHttpServer()).get('/admin/list?page=1&pageSize=10');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.total).toBe(1);
    });
  });

  describe('POST /admin/create', () => {
    it('创建管理员成功', async () => {
      queryMock
        .mockResolvedValueOnce([]) // 账号不存在
        .mockResolvedValueOnce({ insertId: 2 }); // INSERT

      const res = await request(app.getHttpServer())
        .post('/admin/create')
        .send({ username: 'newadmin', password: '123456' });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.id).toBe(2);
    });
  });

  describe('PUT /admin/update/:id', () => {
    it('更新管理员成功', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // 存在检查
        .mockResolvedValueOnce({ affectedRows: 1 }); // UPDATE

      const res = await request(app.getHttpServer())
        .put('/admin/update/1')
        .send({ nickname: '新昵称' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.success).toBe(true);
    });
  });
});
