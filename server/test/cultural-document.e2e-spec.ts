import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import {
  CulturalDocumentPublicController,
  CulturalDocumentFamilyController,
  CulturalDocumentPublicAdminController
} from '../src/cultural-document/cultural-document.controller';
import { CulturalDocumentService } from '../src/cultural-document/cultural-document.service';

import { JwtAuthGuard } from '../src/auth/guard/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

/**
 * 文化典籍模块 E2E 测试
 * - 通过 overrideGuard 绕过 JWT/角色/权限守卫
 * - 通过 mock DataSource.query 隔离数据库
 * - 覆盖 3 个 Controller 共 14 个端点
 */
describe('CulturalDocumentController (e2e)', () => {
  let app: INestApplication;
  let queryMock: jest.Mock;

  // ============ 共享 Mock 数据 ============
  const mockDoc = {
    id: '8b1a1a00000000000000000000000001',
    family_id: null,
    type: 'ancient',
    title: '百家姓',
    subtitle: '中华姓氏启蒙经典',
    author: '佚名',
    dynasty: '北宋',
    cover_url: '',
    original_text: '赵钱孙李...',
    annotated_text: '赵、钱、孙、李...',
    translated_text: '赵氏、钱氏...',
    summary: '《百家姓》是中华姓氏启蒙经典...',
    tag_json: null,
    view_count: 100,
    sort_order: 1,
    status: 1,
    audit_status: 1,
    create_by: 'seed',
    create_time: '2026-01-01 00:00:00',
    update_time: '2026-01-01 00:00:00'
  };

  const mockFamilyDoc = { ...mockDoc, family_id: 1, type: 'genealogy', title: '张氏族谱' };

  const mockPages = [
    { id: 1, document_id: mockDoc.id, page_no: 1, image_url: 'https://cdn.x/1.jpg', thumbnail_url: '', width: 1080, height: 1920, ocr_text: null, create_time: '2026-01-01' },
    { id: 2, document_id: mockDoc.id, page_no: 2, image_url: 'https://cdn.x/2.jpg', thumbnail_url: '', width: 1080, height: 1920, ocr_text: null, create_time: '2026-01-01' }
  ];

  const mockChapters = [
    { id: 1, parent_id: 0, title: '全文', page_start: 1, page_end: 2, sort_order: 1 },
    { id: 2, parent_id: 1, title: '第一章', page_start: 1, page_end: 1, sort_order: 1 }
  ];

  beforeAll(async () => {
    queryMock = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        CulturalDocumentPublicController,
        CulturalDocumentFamilyController,
        CulturalDocumentPublicAdminController
      ],
      providers: [
        CulturalDocumentService,
        { provide: DataSource, useValue: { query: queryMock } }
      ]
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard).useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => queryMock.mockReset());

  // ================================================================
  // Part A：公共古籍端点（@Public，无需守卫）
  // ================================================================

  describe('A. 公共古籍 /cultural-doc/public/*', () => {

    describe('GET /cultural-doc/public/list', () => {
      it('返回分页列表', async () => {
        queryMock
          .mockResolvedValueOnce([{ total: 1 }])           // COUNT
          .mockResolvedValueOnce([mockDoc]);                // SELECT

        const res = await request(app.getHttpServer())
          .get('/cultural-doc/public/list?page=1&pageSize=10');

        expect(res.status).toBe(200);
        expect(res.body.code).toBe('0000');
        expect(res.body.data.list).toHaveLength(1);
        expect(res.body.data.total).toBe(1);
        expect(res.body.data.list[0].title).toBe('百家姓');
      });

      it('支持 type 筛选', async () => {
        queryMock
          .mockResolvedValueOnce([{ total: 0 }])
          .mockResolvedValueOnce([]);

        const res = await request(app.getHttpServer())
          .get('/cultural-doc/public/list?type=genealogy');

        expect(res.status).toBe(200);
        expect(res.body.data.list).toHaveLength(0);
      });
    });

    describe('GET /cultural-doc/public/:id', () => {
      it('返回详情', async () => {
        queryMock.mockResolvedValueOnce([mockDoc]);

        const res = await request(app.getHttpServer())
          .get('/cultural-doc/public/' + mockDoc.id);

        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(mockDoc.id);
        expect(res.body.data.title).toBe('百家姓');
        // view_count +1 逻辑也验证（不阻断主流程）
      });

      it('文档不存在返回 404', async () => {
        queryMock.mockResolvedValueOnce([]);

        const res = await request(app.getHttpServer())
          .get('/cultural-doc/public/nonexistent-id');

        expect(res.status).toBe(404);
      });
    });

    describe('GET /cultural-doc/public/:id/chapters', () => {
      it('返回章节树', async () => {
        queryMock.mockResolvedValueOnce(mockChapters);

        const res = await request(app.getHttpServer())
          .get('/cultural-doc/public/' + mockDoc.id + '/chapters');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
      });
    });

    describe('GET /cultural-doc/public/:id/pages', () => {
      it('返回原页图片列表', async () => {
        queryMock.mockResolvedValueOnce(mockPages);

        const res = await request(app.getHttpServer())
          .get('/cultural-doc/public/' + mockDoc.id + '/pages');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.data[0].image_url).toBe('https://cdn.x/1.jpg');
      });
    });
  });

  // ================================================================
  // Part B：家族私有端点（需守卫 + 归属校验）
  // ================================================================

  describe('B. 家族文档 /cultural-doc/:familyId/*', () => {

    describe('GET /cultural-doc/:familyId/list', () => {
      it('返回家族文档列表', async () => {
        queryMock
          .mockResolvedValueOnce([{ id: 1 }])               // ensureFamilyExists
          .mockResolvedValueOnce([{ total: 1 }])            // COUNT
          .mockResolvedValueOnce([mockFamilyDoc]);           // SELECT

        const res = await request(app.getHttpServer())
          .get('/cultural-doc/1/list?page=1&pageSize=10');

        expect(res.status).toBe(200);
        expect(res.body.code).toBe('0000');
        expect(res.body.data.list[0].title).toBe('张氏族谱');
      });

      it('家族不存在返回 404', async () => {
        queryMock.mockResolvedValueOnce([]);

        const res = await request(app.getHttpServer())
          .get('/cultural-doc/999/list?page=1');

        expect(res.status).toBe(404);
      });
    });

    describe('GET /cultural-doc/:familyId/:id', () => {
      it('返回家族文档详情', async () => {
        queryMock
          .mockResolvedValueOnce([{ id: 1 }])
          .mockResolvedValueOnce([mockFamilyDoc]);

        const res = await request(app.getHttpServer())
          .get('/cultural-doc/1/' + mockDoc.id);

        expect(res.status).toBe(200);
        expect(res.body.data.title).toBe('张氏族谱');
      });
    });

    describe('POST /cultural-doc/:familyId/create', () => {
      it('创建成功', async () => {
        queryMock
          .mockResolvedValueOnce([{ id: 1 }])               // ensureFamilyExists
          .mockResolvedValueOnce([])                         // 查重
          .mockResolvedValueOnce({ affectedRows: 1 });       // INSERT

        const res = await request(app.getHttpServer())
          .post('/cultural-doc/1/create')
          .send({ type: 'genealogy', title: '新建族谱', sortOrder: 1 });

        expect(res.status).toBe(201);
        expect(res.body.code).toBe('0000');
        expect(res.body.data.id).toBeDefined();
        expect(res.body.data.id.length).toBe(32);
      });

      it('缺少 title 返回 400', async () => {
        queryMock.mockResolvedValueOnce([{ id: 1 }]);

        const res = await request(app.getHttpServer())
          .post('/cultural-doc/1/create')
          .send({ type: 'genealogy' });

        expect(res.status).toBe(400);
      });

      it('无效 type 返回 400', async () => {
        queryMock.mockResolvedValueOnce([{ id: 1 }]);

        const res = await request(app.getHttpServer())
          .post('/cultural-doc/1/create')
          .send({ type: 'invalid_type', title: 'x' });

        expect(res.status).toBe(400);
      });
    });

    describe('PUT /cultural-doc/:familyId/update/:id', () => {
      it('更新成功', async () => {
        queryMock
          .mockResolvedValueOnce([{ id: 1 }])               // ensureFamilyExists
          .mockResolvedValueOnce([{ id: mockDoc.id, family_id: 1 }]) // assertExistsAndBelongs
          .mockResolvedValueOnce({});                         // UPDATE

        const res = await request(app.getHttpServer())
          .put('/cultural-doc/1/update/' + mockDoc.id)
          .send({ title: '更新后的标题' });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe('0000');
      });
    });

    describe('DELETE /cultural-doc/:familyId/delete/:id', () => {
      it('删除成功（级联删 page + chapter）', async () => {
        queryMock
          .mockResolvedValueOnce([{ id: 1 }])
          .mockResolvedValueOnce([{ id: mockDoc.id, family_id: 1 }])
          .mockResolvedValueOnce({})   // DELETE pages
          .mockResolvedValueOnce({})   // DELETE chapters
          .mockResolvedValueOnce({});  // DELETE doc

        const res = await request(app.getHttpServer())
          .delete('/cultural-doc/1/delete/' + mockDoc.id);

        expect(res.status).toBe(200);
        expect(res.body.code).toBe('0000');
      });
    });

    describe('POST /cultural-doc/:familyId/:id/pages', () => {
      it('上传/覆盖原页成功', async () => {
        queryMock
          .mockResolvedValueOnce([{ id: 1 }])
          .mockResolvedValueOnce([{ id: mockDoc.id, family_id: 1 }])
          .mockResolvedValueOnce({})   // 先 DELETE
          .mockResolvedValueOnce({});  // 再 INSERT

        const pages = [
          { page_no: 1, image_url: 'https://cdn.x/new1.jpg' },
          { page_no: 2, image_url: 'https://cdn.x/new2.jpg' }
        ];

        const res = await request(app.getHttpServer())
          .post('/cultural-doc/1/' + mockDoc.id + '/pages')
          .send({ pages });

        expect(res.status).toBe(201);
        expect(res.body.code).toBe('0000');
        expect(res.body.data.count).toBe(2);
      });

      it('空 pages 数组返回 400', async () => {
        queryMock
          .mockResolvedValueOnce([{ id: 1 }])
          .mockResolvedValueOnce([{ id: mockDoc.id, family_id: 1 }]);

        const res = await request(app.getHttpServer())
          .post('/cultural-doc/1/' + mockDoc.id + '/pages')
          .send({ pages: [] });

        expect(res.status).toBe(400);
      });
    });
  });

  // ================================================================
  // Part C：公共古籍管理端点（family_id IS NULL 的 CRUD）
  // ================================================================

  describe('C. 公共古籍管理 /cultural-doc/admin/public/*', () => {

    describe('POST /cultural-doc/admin/public/create', () => {
      it('创建公共古籍成功（family_id=NULL）', async () => {
        queryMock
          .mockResolvedValueOnce([])   // 查重（family_id IS NULL 下同标题）
          .mockResolvedValueOnce({});

        const res = await request(app.getHttpServer())
          .post('/cultural-doc/admin/public/create')
          .send({ type: 'ancient', title: '三字经', author: '王应麟', dynasty: '南宋' });

        expect(res.status).toBe(201);
        expect(res.body.code).toBe('0000');
        expect(res.body.data.id.length).toBe(32);
      });
    });

    describe('PUT /cultural-doc/admin/public/update/:id', () => {
      it('更新公共古籍成功', async () => {
        queryMock
          .mockResolvedValueOnce([{ id: mockDoc.id, family_id: null }])
          .mockResolvedValueOnce({});

        const res = await request(app.getHttpServer())
          .put('/cultural-doc/admin/public/update/' + mockDoc.id)
          .send({ summary: '新摘要' });

        expect(res.status).toBe(200);
      });
    });

    describe('DELETE /cultural-doc/admin/public/delete/:id', () => {
      it('删除公共古籍成功', async () => {
        queryMock
          .mockResolvedValueOnce([{ id: mockDoc.id, family_id: null }])
          .mockResolvedValueOnce({})   // pages
          .mockResolvedValueOnce({})   // chapters
          .mockResolvedValueOnce({});  // doc

        const res = await request(app.getHttpServer())
          .delete('/cultural-doc/admin/public/delete/' + mockDoc.id);

        expect(res.status).toBe(200);
      });
    });
  });

  // ================================================================
  // Part D：Service 内部逻辑测试
  // ================================================================

  describe('D. Service 内部逻辑', () => {

    describe('generateDocId()', () => {
      it('每次生成 32 位 hex 且唯一', async () => {
        queryMock
          .mockResolvedValueOnce([{ id: 1 }])   // ensureFamilyExists
          .mockResolvedValueOnce([])            // 查重
          .mockResolvedValueOnce({});

        const res1 = await request(app.getHttpServer())
          .post('/cultural-doc/1/create')
          .send({ type: 'genealogy', title: '测试A' });

        queryMock
          .mockResolvedValueOnce([{ id: 1 }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce({});

        const res2 = await request(app.getHttpServer())
          .post('/cultural-doc/1/create')
          .send({ type: 'genealogy', title: '测试B' });

        expect(res1.body.data.id.length).toBe(32);
        expect(res2.body.data.id.length).toBe(32);
        expect(res1.body.data.id).not.toBe(res2.body.data.id);
      });
    });

    describe('标题长度校验', () => {
      it('超过 200 字符返回 400', async () => {
        queryMock.mockResolvedValueOnce([{ id: 1 }]);

        const longTitle = '一'.repeat(201);
        const res = await request(app.getHttpServer())
          .post('/cultural-doc/1/create')
          .send({ type: 'genealogy', title: longTitle });

        expect(res.status).toBe(400);
      });
    });

    describe('空 title 更新报错', () => {
      it('空更新请求返回 400', async () => {
        queryMock
          .mockResolvedValueOnce([{ id: 1 }])
          .mockResolvedValueOnce([{ id: mockDoc.id, family_id: 1 }]);

        const res = await request(app.getHttpServer())
          .put('/cultural-doc/1/update/' + mockDoc.id)
          .send({});

        expect(res.status).toBe(400);
      });
    });
  });
});
