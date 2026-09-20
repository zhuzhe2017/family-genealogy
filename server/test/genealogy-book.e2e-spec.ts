import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { GenealogyBookController } from '../src/genealogy-book/genealogy-book.controller';
import { GenealogyBookService } from '../src/genealogy-book/genealogy-book.service';
import { JwtAuthGuard } from '../src/auth/guard/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

/**
 * 家谱成书模块集成测试
 * - 通过 overrideGuard 绕过 JWT/角色/权限守卫
 * - 通过 mock DataSource 隔离真实数据库
 */
describe('GenealogyBookController (e2e)', () => {
  let app: INestApplication;
  let queryMock: jest.Mock;

  beforeAll(async () => {
    queryMock = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [GenealogyBookController],
      providers: [
        GenealogyBookService,
        {
          provide: DataSource,
          useValue: {
            query: queryMock
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

  describe('GET /genealogy-book/:familyId/templates', () => {
    it('返回模板列表', async () => {
      const res = await request(app.getHttpServer()).get('/genealogy-book/1/templates');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(4);
      expect(res.body.data[0]).toHaveProperty('key');
      expect(res.body.data[0]).toHaveProperty('name');
      expect(res.body.data[0]).toHaveProperty('description');
      expect(res.body.data[0]).toHaveProperty('features');
    });
  });

  describe('GET /genealogy-book/:familyId/list', () => {
    it('返回分页列表', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists
        .mockResolvedValueOnce([{ total: 1 }]) // count
        .mockResolvedValueOnce([{ id: 1, family_id: 1, title: '测试家谱' }]); // list

      const res = await request(app.getHttpServer()).get('/genealogy-book/1/list?page=1&pageSize=10');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.list).toHaveLength(1);
    });
  });

  describe('POST /genealogy-book/:familyId/create', () => {
    it('创建成功', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists
        .mockResolvedValueOnce([]) // check duplicate
        .mockResolvedValueOnce({ insertId: 1 }); // insert

      const res = await request(app.getHttpServer())
        .post('/genealogy-book/1/create')
        .send({ title: '张氏族谱', template: 'european' });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.id).toBe(1);
    });

    it('缺少标题返回 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/genealogy-book/1/create')
        .send({ template: 'european' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /genealogy-book/:familyId/:id', () => {
    it('获取单条记录', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists
        .mockResolvedValueOnce([{ id: 1, family_id: 1, title: '测试' }]); // getById

      const res = await request(app.getHttpServer()).get('/genealogy-book/1/1');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.id).toBe(1);
    });
  });

  describe('PUT /genealogy-book/:familyId/update/:id', () => {
    it('更新成功', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists
        .mockResolvedValueOnce([{ id: 1, family_id: 1 }]) // getById
        .mockResolvedValueOnce({}); // update

      const res = await request(app.getHttpServer())
        .put('/genealogy-book/1/update/1')
        .send({ title: '新标题' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
    });
  });

  describe('DELETE /genealogy-book/:familyId/delete/:id', () => {
    it('删除成功', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists
        .mockResolvedValueOnce([{ id: 1, family_id: 1 }]) // getById
        .mockResolvedValueOnce({}); // delete

      const res = await request(app.getHttpServer()).delete('/genealogy-book/1/delete/1');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
    });
  });

  describe('POST /genealogy-book/:familyId/toggle-status/:id', () => {
    it('切换状态成功', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists
        .mockResolvedValueOnce([{ id: 1, family_id: 1, status: 1 }]) // getById
        .mockResolvedValueOnce({}); // update

      const res = await request(app.getHttpServer()).post('/genealogy-book/1/toggle-status/1');

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.status).toBe(0);
    });
  });

  describe('GET /genealogy-book/:familyId/preview/:id', () => {
    it('返回预览数据', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists (preview)
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists (getById)
        .mockResolvedValueOnce([{ id: 1, family_id: 1, title: '测试', template: 'european' }]) // getById
        .mockResolvedValueOnce([{ name: '测试家族' }]) // family name
        .mockResolvedValueOnce([{ exists: 1 }]) // member table exists
        .mockResolvedValueOnce([]) // members query
        .mockResolvedValueOnce([]); // generation table

      const res = await request(app.getHttpServer()).get('/genealogy-book/1/preview/1');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data).toHaveProperty('bookTitle');
      expect(res.body.data).toHaveProperty('generationLabels');
    });
  });

  describe('GET /genealogy-book/:familyId/export/:id', () => {
    it('导出 HTML', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists (getById in exportHtml)
        .mockResolvedValueOnce([{ id: 1, family_id: 1, title: '测试', template: 'european', subtitle: '', preface: '', introduction: '', clan_rules: '', generation_poem: '', appendix: '', cover_style: 'default', font_family: 'serif', paper_size: 'A4', include_generation_table: 1, include_member_bio: 1, include_tree_chart: 1, include_index: 1 }]) // getById in exportHtml
        .mockResolvedValueOnce([{ exists: 1 }]) // member table exists
        .mockResolvedValueOnce([]) // members query
        .mockResolvedValueOnce([]) // generation table
        .mockResolvedValueOnce([{ name: '测试家族' }]) // family name (getFamilyName)
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists (getById in controller)
        .mockResolvedValueOnce([{ id: 1, family_id: 1, title: '测试', template: 'european', subtitle: '', preface: '', introduction: '', clan_rules: '', generation_poem: '', appendix: '', cover_style: 'default', font_family: 'serif', paper_size: 'A4', include_generation_table: 1, include_member_bio: 1, include_tree_chart: 1, include_index: 1 }]); // getById in controller

      const res = await request(app.getHttpServer()).get('/genealogy-book/1/export/1');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });
});
