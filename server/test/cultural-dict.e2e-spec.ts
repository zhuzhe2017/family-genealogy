import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { CulturalDictController } from '../src/cultural-dict/cultural-dict.controller';
import { CulturalDictService } from '../src/cultural-dict/cultural-dict.service';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

/**
 * 文化字典模块 E2E 测试
 * - @Public() 公开端点，无需守卫 override
 * - mock DataSource.query
 */
describe('CulturalDictController (e2e)', () => {
  let app: INestApplication;
  let queryMock: jest.Mock;

  const mockRows = [
    { id: 1, category: 'zibei', dict_key: '文', surname: '', content: '文，意为文采...', source: '说文', tags: null, sort_order: 1 },
    { id: 2, category: 'zibei', dict_key: '明', surname: '', content: '明，意为光明...', source: '说文', tags: null, sort_order: 2 },
    { id: 3, category: 'tanghao', dict_key: '陇西堂', surname: '李', content: '陇西堂是李氏最著名的堂号...', source: '百家姓注', tags: null, sort_order: 1 }
  ];

  beforeAll(async () => {
    queryMock = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CulturalDictController],
      providers: [
        CulturalDictService,
        { provide: DataSource, useValue: { query: queryMock } }
      ]
    }).compile();

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
  // GET /cultural-dict/list
  // ================================================================

  describe('GET /cultural-dict/list', () => {

    it('无筛选参数，返回全部（分页）', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 3 }])
        .mockResolvedValueOnce(mockRows);

      const res = await request(app.getHttpServer())
        .get('/cultural-dict/list');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(res.body.data.list).toHaveLength(3);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.list[0].dict_key).toBe('文');
    });

    it('按 category 筛选', async () => {
      const zibeiRows = mockRows.filter(r => r.category === 'zibei');
      queryMock
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce(zibeiRows);

      const res = await request(app.getHttpServer())
        .get('/cultural-dict/list?category=zibei');

      expect(res.status).toBe(200);
      expect(res.body.data.list).toHaveLength(2);
      expect(res.body.data.list[0].category).toBe('zibei');
    });

    it('按 keyword 搜索', async () => {
      const rows = mockRows.filter(r => r.dict_key.includes('明') || r.content.includes('明'));
      queryMock
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce(rows);

      const res = await request(app.getHttpServer())
        .get('/cultural-dict/list?keyword=%E6%98%8E'); // 明

      expect(res.status).toBe(200);
    });

    it('按 surname 筛选（堂号专属）', async () => {
      const rows = mockRows.filter(r => r.surname === '李');
      queryMock
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce(rows);

      const res = await request(app.getHttpServer())
        .get('/cultural-dict/list?surname=%E6%9D%8E');

      expect(res.status).toBe(200);
      expect(res.body.data.list[0].dict_key).toBe('陇西堂');
    });

    it('组合筛选：category + keyword', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([mockRows[0]]);

      const res = await request(app.getHttpServer())
        .get('/cultural-dict/list?category=zibei&keyword=%E6%96%87');

      expect(res.status).toBe(200);
    });

    it('无效 category 不报错（数据库字段校验）', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer())
        .get('/cultural-dict/list?category=invalid');

      expect(res.status).toBe(200);
      expect(res.body.data.list).toHaveLength(0);
    });
  });

  // ================================================================
  // GET /cultural-dict/stats
  // ================================================================

  describe('GET /cultural-dict/stats', () => {

    it('返回各分类条数统计', async () => {
      queryMock.mockResolvedValueOnce([
        { category: 'zibei', count: 10 },
        { category: 'tanghao', count: 10 },
        { category: 'terminology', count: 20 }
      ]);

      const res = await request(app.getHttpServer())
        .get('/cultural-dict/stats');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0].category).toBe('zibei');
      expect(res.body.data[0].count).toBe(10);
    });

    it('空库返回空数组', async () => {
      queryMock.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer())
        .get('/cultural-dict/stats');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });
});
