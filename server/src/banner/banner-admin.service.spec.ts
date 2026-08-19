import { HttpStatus } from '@nestjs/common';
import { BannerAdminService } from './banner-admin.service';

describe('BannerAdminService', () => {
  let service: BannerAdminService;
  let queryMock: jest.Mock;

  beforeEach(() => {
    queryMock = jest.fn();
    service = new BannerAdminService({ query: queryMock } as unknown as import('typeorm').DataSource);
  });

  describe('getList', () => {
    it('默认查询 status=1 并按 sort_order 升序 id 降序', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{
          id: 1, family_id: 0, title: '测试', image_url: '/a.jpg', link_type: 'none', link_url: '', sort_order: 0,
          status: 1, start_time: null, end_time: null, creator_user_id: 'admin1', create_time: '2026-01-01', update_time: '2026-01-01'
        }]);

      const result = await service.getList({ page: 1, pageSize: 10 });
      expect(result.total).toBe(1);
      expect(result.list).toHaveLength(1);
      expect(result.list[0].linkType).toBe('none');
    });
  });

  describe('create', () => {
    it('缺少标题时抛出 BAD_REQUEST', async () => {
      await expect(service.create({ familyId: 1, title: '   ', imageUrl: '/a.jpg' } as any, 'admin1')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('非法 linkType 时抛出 BAD_REQUEST', async () => {
      await expect(service.create({
        familyId: 1, title: 't', imageUrl: '/a.jpg', linkType: 'invalid'
      } as any, 'admin1')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('成功时执行 INSERT', async () => {
      queryMock.mockResolvedValueOnce({ insertId: 1 });

      await service.create({
        familyId: 1, title: 't', imageUrl: '/a.jpg', linkType: 'page', linkUrl: '/pages/home/home'
      } as any, 'admin1');

      const insertCall = queryMock.mock.calls[0];
      expect(insertCall[0]).toContain('INSERT INTO `family_banner`');
      expect(insertCall[1]).toContain('/pages/home/home');
    });
  });

  describe('update', () => {
    it('广告不存在时抛出 NOT_FOUND', async () => {
      queryMock.mockResolvedValueOnce([]);
      await expect(service.update(999, { title: 'x' }, 'admin1')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      });
    });

    it('无字段更新时抛出 BAD_REQUEST', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);
      await expect(service.update(1, {}, 'admin1')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('成功时执行 UPDATE', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce({ success: true });

      await service.update(1, { title: '新标题' }, 'admin1');

      const updateCall = queryMock.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE `family_banner`');
      expect(updateCall[0]).toContain('`title` = ?');
    });
  });

  describe('delete', () => {
    it('广告不存在时抛出 NOT_FOUND', async () => {
      queryMock.mockResolvedValueOnce([]);
      await expect(service.delete(999, 'admin1')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      });
    });

    it('非创建者删除普通广告且无超管权限时抛出 FORBIDDEN', async () => {
      queryMock
        .mockResolvedValueOnce([{ family_id: 1, creator_user_id: 'admin2' }])
        .mockResolvedValueOnce([{ role: 'other' }])
        .mockResolvedValueOnce([{ code: 'other' }]);

      await expect(service.delete(1, 'admin1')).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN
      });
    });

    it('超级管理员可删除他人广告', async () => {
      queryMock
        .mockResolvedValueOnce([{ family_id: 1, creator_user_id: 'admin2' }])
        .mockResolvedValueOnce([{ role: 'super' }])
        .mockResolvedValueOnce({ affectedRows: 1 });

      const result = await service.delete(1, 'admin1');
      expect(result.success).toBe(true);
    });

    it('创建者可删除自己的广告', async () => {
      queryMock
        .mockResolvedValueOnce([{ family_id: 1, creator_user_id: 'admin1' }])
        .mockResolvedValueOnce({ affectedRows: 1 });

      const result = await service.delete(1, 'admin1');
      expect(result.success).toBe(true);
    });
  });
});
