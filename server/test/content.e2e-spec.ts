import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ContentController } from '../src/content/content.controller';
import { ContentService } from '../src/content/content.service';
import { JwtAuthGuard } from '../src/auth/guard/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

/**
 * 内容管理模块集成测试
 * - 通过 overrideGuard 绕过 JWT/角色/权限守卫
 * - 通过 mock DataSource 隔离真实数据库
 */
describe('Content (e2e)', () => {
  let app: INestApplication;
  let queryMock: jest.Mock;
  const qrQueryMock = jest.fn();

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
      controllers: [ContentController],
      providers: [
        ContentService,
        { provide: DataSource, useValue: { query: queryMock, createQueryRunner: jest.fn().mockReturnValue(queryRunner) } }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
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
  });

  describe('GET /content/:type/list', () => {
    it('dynamic 类型列表', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 1 }]) // COUNT
        .mockResolvedValueOnce([{ id: 'c1', title: '测试', audit_status: 1 }]); // SELECT

      const res = await request(app.getHttpServer()).get('/content/dynamic/list?page=1&pageSize=10');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.total).toBe(1);
    });

    it('photo 类型列表', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 1 }]) // COUNT
        .mockResolvedValueOnce([{ id: 'c1', title: '测试', audit_status: 1 }]); // SELECT

      const res = await request(app.getHttpServer()).get('/content/photo/list?page=1&pageSize=10');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.total).toBe(1);
    });

    it('非法类型返回 500', async () => {
      const res = await request(app.getHttpServer()).get('/content/invalidtype/list?page=1&pageSize=10');

      expect(res.status).toBe(500);
    });
  });

  describe('POST /content/:type/audit/:id', () => {
    it('审核 dynamic 内容', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 'c1' }]) // ensureExist
        .mockResolvedValueOnce({ affectedRows: 1 }); // UPDATE audit_status

      const res = await request(app.getHttpServer())
        .post('/content/dynamic/audit/c1')
        .send({ auditStatus: 1 });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.auditStatus).toBe(1);
    });
  });

  describe('POST /content/:type/toggle/:id', () => {
    it('上下架切换', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 'c1', audit_status: 1, status: 1 }]) // ensureExist
        .mockResolvedValueOnce({ affectedRows: 1 }); // UPDATE

      const res = await request(app.getHttpServer()).post('/content/dynamic/toggle/c1');

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.auditStatus).toBe(2); // 1 → 2 下架
    });
  });

  describe('DELETE /content/:type/:id', () => {
    it('软删除内容', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 'c1', audit_status: 1, status: 1 }]) // ensureExist
        .mockResolvedValueOnce({ affectedRows: 1 }); // UPDATE status=0

      const res = await request(app.getHttpServer()).delete('/content/dynamic/c1');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.success).toBe(true);
    });
  });
});
