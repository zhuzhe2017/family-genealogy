import { SurnameService } from './surname.service';
import { HttpStatus } from '@nestjs/common';

describe('SurnameService', () => {
  let service: SurnameService;
  let queryMock: jest.Mock;

  beforeEach(() => {
    queryMock = jest.fn();
    service = new SurnameService({ query: queryMock } as unknown as import('typeorm').DataSource);
  });

  describe('getList', () => {
    it('page=0 被纠正为 1 并返回正确 offset', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 5 }])
        .mockResolvedValueOnce([{ id: 1, surname: '张' }]);

      const result = await service.getList({ page: 0, pageSize: 10 });

      expect(result.page).toBe(1);
      expect(queryMock.mock.calls[1][1]).toEqual([10, 0]); // LIMIT 10 OFFSET 0
    });

    it('负数 page 被纠正为 1', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 5 }])
        .mockResolvedValueOnce([]);

      await service.getList({ page: -3, pageSize: 10 });

      expect(queryMock.mock.calls[1][1]).toEqual([10, 0]);
    });

    it('pageSize 超过 100 被限制为 100', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 200 }])
        .mockResolvedValueOnce([]);

      const result = await service.getList({ page: 1, pageSize: 500 });

      expect(result.pageSize).toBe(100);
      expect(queryMock.mock.calls[1][1]).toEqual([100, 0]);
    });

    it('pageSize 为 0 或负数被纠正为 10', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 5 }])
        .mockResolvedValueOnce([]);

      const result = await service.getList({ page: 1, pageSize: 0 });

      expect(result.pageSize).toBe(10);
      expect(queryMock.mock.calls[1][1]).toEqual([10, 0]);
    });

    it('正常 page=2, pageSize=10 返回 OFFSET 10', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 50 }])
        .mockResolvedValueOnce([]);

      const result = await service.getList({ page: 2, pageSize: 10 });

      expect(result.page).toBe(2);
      expect(queryMock.mock.calls[1][1]).toEqual([10, 10]);
    });

    it('keyword 触发 surname/pinyin 模糊查询', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{ id: 1, surname: '张' }]);

      await service.getList({ page: 1, pageSize: 10, keyword: '张' });

      const countSql = queryMock.mock.calls[0][0];
      expect(countSql).toContain('`surname` LIKE ?');
      expect(countSql).toContain('`pinyin` LIKE ?');
      expect(queryMock.mock.calls[0][1]).toContain('%张%');
    });
  });

  describe('create', () => {
    it('姓氏为空时抛出 BAD_REQUEST', async () => {
      await expect(service.create({ surname: '' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('重复姓氏时抛出 BAD_REQUEST', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1 }]);
      await expect(service.create({ surname: '张' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('创建成功返回 insertId', async () => {
      queryMock.mockResolvedValueOnce([]).mockResolvedValueOnce({ insertId: 10 });
      const result = await service.create({ surname: '李' });
      expect(result.id).toBe(10);
    });
  });
});
