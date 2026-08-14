import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { FamilyController } from '../src/family/family.controller';
import { FamilyService } from '../src/family/family.service';
import { JwtAuthGuard } from '../src/auth/guard/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

/**
 * 家族管理模块集成测试
 * - 通过 overrideGuard 绕过 JWT/角色/权限守卫
 * - 通过 mock DataSource 隔离真实数据库
 */
describe('FamilyController (e2e)', () => {
  let app: INestApplication;
  let queryMock: jest.Mock;

  beforeAll(async () => {
    queryMock = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [FamilyController],
      providers: [
        FamilyService,
        {
          provide: DataSource,
          useValue: {
            query: queryMock,
            // create 内部使用 dataSource.transaction,回调内的 manager.query 复用 queryMock
            transaction: jest.fn(async (cb: (manager: { query: jest.Mock }) => unknown) => cb({ query: queryMock }))
          }
        }
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
  });

  describe('GET /family/list', () => {
    it('返回标准响应结构 {code,data,msg}', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{ id: 'f1', name: '张氏家族', status: 1 }])
        .mockResolvedValueOnce([{ family_id: 'f1', cnt: 3 }]) // member
        .mockResolvedValueOnce([]) // event
        .mockResolvedValueOnce([]) // photo
        .mockResolvedValueOnce([]) // doc
        .mockResolvedValueOnce([]) // dynamic
        .mockResolvedValueOnce([]) // admin
        .mockResolvedValueOnce([]); // batchGenerationNames

      const res = await request(app.getHttpServer()).get('/family/list?page=1&pageSize=10');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.msg).toBe('success');
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.list).toHaveLength(1);
      expect(res.body.data.list[0].realMemberCount).toBe(3);
    });

    it('keyword 查询参数被正确接收', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer()).get('/family/list?keyword=张');

      expect(res.status).toBe(200);
      // 验证 count 查询参数包含 keyword
      expect(queryMock.mock.calls[0][1]).toContain('%张%');
    });
  });

  describe('GET /family/:id', () => {
    it('不存在时返回 404', async () => {
      queryMock.mockResolvedValueOnce([]); // 主查询为空
      // batchStats 不会被调用（getById 在主查询为空时直接抛出）
      const res = await request(app.getHttpServer()).get('/family/999999');
      expect(res.status).toBe(404);
    });

    it('存在时返回详情', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 123456, name: '张氏', status: 1 }])
        .mockResolvedValueOnce([{ family_id: 123456, cnt: 2 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]); // batchGenerationNames

      const res = await request(app.getHttpServer()).get('/family/123456');
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(123456);
      expect(res.body.data.memberCount).toBe(2);
    });
  });

  describe('POST /family/create', () => {
    it('名称为空时返回 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/family/create')
        .send({ name: '' });
      expect(res.status).toBe(400);
    });

    it('成功创建返回 id', async () => {
      queryMock
        .mockResolvedValueOnce([]) // 重复检查通过
        .mockResolvedValueOnce({ insertId: 42 }) // INSERT
        .mockResolvedValueOnce({}); // CREATE TABLE 成员分表

      const res = await request(app.getHttpServer())
        .post('/family/create')
        .send({ name: '新家族', isPublic: 1, allowJoin: 1 });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(42);
    });
  });

  describe('PUT /family/update/:id', () => {
    it('家族不存在时返回 404', async () => {
      queryMock.mockResolvedValueOnce([]); // select 为空
      const res = await request(app.getHttpServer())
        .put('/family/update/999999')
        .send({ name: '新名' });
      expect(res.status).toBe(404);
    });

    it('成功更新', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 123456, name: '旧名' }]) // 存在检查
        .mockResolvedValueOnce([]) // 重名检查（无冲突）
        .mockResolvedValueOnce({ success: true }); // UPDATE

      const res = await request(app.getHttpServer())
        .put('/family/update/123456')
        .send({ name: '新名', isPublic: 0 });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
    });
  });

  describe('DELETE /family/delete/:id', () => {
    it('软删除成功', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 123456, status: 1 }])
        .mockResolvedValueOnce({ success: true });

      const res = await request(app.getHttpServer()).delete('/family/delete/123456');
      expect(res.status).toBe(200);
      // 验证第二条 SQL 为 UPDATE status=0
      const updateCall = queryMock.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE `family` SET `status` = 0');
    });
  });

  describe('POST /family/toggle-public/:id', () => {
    it('切换公开状态', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 123456, is_public: 1 }])
        .mockResolvedValueOnce({ success: true });

      const res = await request(app.getHttpServer()).post('/family/toggle-public/123456');
      expect(res.status).toBe(201);
      expect(res.body.data.isPublic).toBe(0);
    });
  });
});
