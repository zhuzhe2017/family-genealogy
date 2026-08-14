import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { SurnameController } from '../src/surname/surname.controller';
import { SurnameService } from '../src/surname/surname.service';
import { JwtAuthGuard } from '../src/auth/guard/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

/**
 * 姓氏模块集成测试
 * - 通过 overrideGuard 绕过 JWT/角色/权限守卫
 * - 通过 mock DataSource 隔离真实数据库
 */
describe('Surname (e2e)', () => {
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
      controllers: [SurnameController],
      providers: [
        SurnameService,
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

  describe('GET /surname/list', () => {
    it('返回姓氏分页列表', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 1 }]) // COUNT
        .mockResolvedValueOnce([{ id: 1, surname: '张', pinyin: 'zhang', status: 1 }]); // SELECT

      const res = await request(app.getHttpServer()).get('/surname/list?page=1&pageSize=10');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.total).toBe(1);
    });
  });

  describe('GET /surname/all', () => {
    it('返回全部姓氏', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1, surname: '张', status: 1 }]);

      const res = await request(app.getHttpServer()).get('/surname/all');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /surname/:id', () => {
    it('返回姓氏详情', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1, surname: '张', pinyin: 'zhang' }]);

      const res = await request(app.getHttpServer()).get('/surname/1');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.surname).toBe('张');
    });

    it('不存在时返回 404', async () => {
      queryMock.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer()).get('/surname/999');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /surname/create', () => {
    it('创建姓氏成功', async () => {
      queryMock
        .mockResolvedValueOnce([]) // 不存在
        .mockResolvedValueOnce({ insertId: 2 }); // INSERT

      const res = await request(app.getHttpServer())
        .post('/surname/create')
        .send({ surname: '王', pinyin: 'wang' });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.id).toBe(2);
    });
  });

  describe('PUT /surname/update/:id', () => {
    it('更新姓氏成功', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // 存在检查
        .mockResolvedValueOnce({ affectedRows: 1 }); // UPDATE

      const res = await request(app.getHttpServer())
        .put('/surname/update/1')
        .send({ pinyin: 'zh' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.success).toBe(true);
    });
  });

  describe('DELETE /surname/delete/:id', () => {
    it('删除姓氏成功', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // 存在检查
        .mockResolvedValueOnce({ affectedRows: 1 }); // DELETE

      const res = await request(app.getHttpServer()).delete('/surname/delete/1');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.success).toBe(true);
    });
  });

  describe('POST /surname/toggle-status/:id', () => {
    it('切换姓氏状态成功', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1, status: 1 }]) // 存在且 status=1
        .mockResolvedValueOnce({ affectedRows: 1 }); // UPDATE

      const res = await request(app.getHttpServer()).post('/surname/toggle-status/1');

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.status).toBe(0); // 1 → 0
    });
  });
});
