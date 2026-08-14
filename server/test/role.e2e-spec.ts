import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { RoleController, PermissionController, AdminRoleController } from '../src/role/role.controller';
import { RoleService } from '../src/role/role.service';
import { JwtAuthGuard } from '../src/auth/guard/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

/**
 * 角色 / 权限 / 管理员角色模块集成测试
 * - 通过 overrideGuard 绕过 JWT/角色/权限守卫
 * - 通过 mock DataSource 与 queryRunner 隔离真实数据库
 */
describe('Role & Permission (e2e)', () => {
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
      controllers: [RoleController, PermissionController, AdminRoleController],
      providers: [
        RoleService,
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

  describe('GET /role/list', () => {
    it('返回角色列表', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1, name: '超级管理员', code: 'super', status: 1 }]) // roles
        .mockResolvedValueOnce([]); // permissions

      const res = await request(app.getHttpServer()).get('/role/list');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /role/:id', () => {
    it('返回角色详情', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1, name: '超级管理员', code: 'super', status: 1 }]) // role
        .mockResolvedValueOnce([]); // permissions

      const res = await request(app.getHttpServer()).get('/role/1');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.id).toBe(1);
    });
  });

  describe('POST /role/create', () => {
    it('创建角色成功', async () => {
      queryMock
        .mockResolvedValueOnce([]) // 角色编码不存在
        .mockResolvedValueOnce({ insertId: 2 }); // INSERT

      const res = await request(app.getHttpServer())
        .post('/role/create')
        .send({ name: '测试角色', code: 'test' });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.id).toBe(2);
    });
  });

  describe('PUT /role/update/:id', () => {
    it('更新角色成功', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // 存在检查
        .mockResolvedValueOnce({ affectedRows: 1 }); // UPDATE

      const res = await request(app.getHttpServer())
        .put('/role/update/1')
        .send({ name: '新角色名' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.success).toBe(true);
    });
  });

  describe('DELETE /role/delete/:id', () => {
    it('删除角色(事务清理 4 张关联表)', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1 }]); // 存在检查

      const res = await request(app.getHttpServer()).delete('/role/delete/1');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(qrQueryMock).toHaveBeenCalledTimes(4); // 4 张关联表 DELETE
    });
  });

  describe('POST /role/assign-permissions/:id', () => {
    it('为角色分配权限', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // 角色存在
        .mockResolvedValueOnce([{ id: 1 }]); // 权限存在校验

      const res = await request(app.getHttpServer())
        .post('/role/assign-permissions/1')
        .send({ permissionIds: [1] });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      expect(qrQueryMock).toHaveBeenCalledTimes(2); // DELETE + INSERT
    });
  });

  describe('POST /role/assign-menus/:id', () => {
    it('为角色分配菜单', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // 角色存在
        .mockResolvedValueOnce([{ id: 1 }]); // 菜单存在校验

      const res = await request(app.getHttpServer())
        .post('/role/assign-menus/1')
        .send({ menuIds: [1] });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      expect(qrQueryMock).toHaveBeenCalledTimes(2); // DELETE + INSERT
    });
  });

  describe('GET /permission/list', () => {
    it('返回权限列表', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1, name: '测试', code: 'test:list', status: 1 }]);

      const res = await request(app.getHttpServer()).get('/permission/list');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('DELETE /permission/delete/:id', () => {
    it('删除权限(事务清理 2 张关联表)', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1 }]); // 存在检查

      const res = await request(app.getHttpServer()).delete('/permission/delete/1');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(qrQueryMock).toHaveBeenCalledTimes(2); // 2 张关联表 DELETE
    });
  });

  describe('GET /admin-role/:adminId', () => {
    it('返回管理员已绑定角色', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1, name: 'super' }]);

      const res = await request(app.getHttpServer()).get('/admin-role/1');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data).toHaveLength(1);
    });
  });
});
