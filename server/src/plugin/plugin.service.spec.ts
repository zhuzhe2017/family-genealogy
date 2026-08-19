import { HttpStatus } from '@nestjs/common';
import { PluginService } from './plugin.service';
import { PluginAdminService } from './plugin-admin.service';

describe('PluginService', () => {
  let service: PluginService;
  let queryMock: jest.Mock;

  beforeEach(() => {
    queryMock = jest.fn();
    service = new PluginService({ query: queryMock } as unknown as import('typeorm').DataSource);
  });

  describe('getActiveList', () => {
    it('仅返回启用插件，按排序值映射字段', async () => {
      queryMock.mockResolvedValueOnce([
        {
          id: 1,
          code: 'naming',
          name: '运势取名',
          icon: '📛',
          description: 'AI 取名',
          entry_type: 'url',
          entry_value: 'https://h5.example.com/naming',
          sort_order: 0,
          create_time: '2026-08-19'
        },
        {
          id: 2,
          code: 'compass',
          name: '电子罗盘',
          icon: '🧭',
          description: '看风水',
          entry_type: 'page',
          entry_value: '/pages/compass/compass',
          sort_order: 10,
          create_time: '2026-08-19'
        }
      ]);

      const result = await service.getActiveList();
      expect(result.list).toHaveLength(2);
      expect(result.list[0].code).toBe('naming');
      expect(result.list[0].entryType).toBe('url');
      expect(result.list[1].entryType).toBe('page');
    });
  });
});

describe('PluginAdminService', () => {
  let service: PluginAdminService;
  let queryMock: jest.Mock;

  beforeEach(() => {
    queryMock = jest.fn();
    service = new PluginAdminService({ query: queryMock } as unknown as import('typeorm').DataSource);
  });

  describe('create', () => {
    it('缺少必填字段时抛出 BAD_REQUEST', async () => {
      await expect(service.create({ name: 'x' }, 'admin')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('编码重复时抛出 BAD_REQUEST', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1 }]);
      await expect(
        service.create({ code: 'compass', name: '电子罗盘', icon: '🧭', entryType: 'page', entryValue: '/pages/compass/compass' }, 'admin')
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('合法参数创建成功', async () => {
      queryMock
        .mockResolvedValueOnce([]) // code 查重
        .mockResolvedValueOnce({ affectedRows: 1 }); // INSERT

      const result = await service.create(
        { code: 'compass', name: '电子罗盘', icon: '🧭', entryType: 'page', entryValue: '/pages/compass/compass', sortOrder: 5, status: 1 },
        'admin'
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('update', () => {
    it('插件不存在时抛出 NOT_FOUND', async () => {
      queryMock.mockResolvedValueOnce([]);
      await expect(service.update(99, { name: '改名' })).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      });
    });

    it('无字段变化时抛出 BAD_REQUEST', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1, code: 'compass' }]);
      await expect(service.update(1, {})).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });
  });

  describe('delete', () => {
    it('删除成功', async () => {
      queryMock.mockResolvedValueOnce({ affectedRows: 1 });
      await expect(service.delete(1)).resolves.toEqual({ success: true });
    });

    it('删除不存在的插件时抛出 NOT_FOUND', async () => {
      queryMock.mockResolvedValueOnce({ affectedRows: 0 });
      await expect(service.delete(99)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      });
    });
  });
});
