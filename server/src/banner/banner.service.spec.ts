import { HttpStatus } from '@nestjs/common';
import { BannerService } from './banner.service';

describe('BannerService', () => {
  let service: BannerService;
  let queryMock: jest.Mock;

  beforeEach(() => {
    queryMock = jest.fn();
    service = new BannerService({ query: queryMock } as unknown as import('typeorm').DataSource);
  });

  describe('getActiveList', () => {
    it('缺少 familyId 时抛出 BAD_REQUEST', async () => {
      await expect(service.getActiveList('u1', 0)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('非家族成员仅返回全局广告，不报错', async () => {
      queryMock
        .mockResolvedValueOnce([]) // family_permission
        .mockResolvedValueOnce([]) // user.family_id
        .mockResolvedValueOnce([]) // family.status=1 无记录（非成员）
        .mockResolvedValueOnce([
          { id: 2, family_id: 0, title: 'g', image_url: '/g.jpg', link_type: 'none', link_url: '',
            sort_order: 0, start_time: null, end_time: null, create_time: '2026-01-01' },
          { id: 1, family_id: 1, title: 't', image_url: '/a.jpg', link_type: 'page', link_url: '/pages/home/home',
            sort_order: 1, start_time: null, end_time: null, create_time: '2026-01-01' }
        ])
        .mockResolvedValueOnce([{ config_value: '3000' }]);

      const result = await service.getActiveList('u1', 1);
      expect(result.list).toHaveLength(1);
      expect(result.list[0].familyId).toBe(0);
    });

    it('返回启用广告与默认间隔', async () => {
      queryMock
        .mockResolvedValueOnce([]) // family_permission
        .mockResolvedValueOnce([{ family_id: 1 }]) // user.family_id
        .mockResolvedValueOnce([{
          id: 1, family_id: 1, title: 't', image_url: '/a.jpg', link_type: 'page', link_url: '/pages/home/home',
          sort_order: 1, start_time: null, end_time: null, create_time: '2026-01-01'
        }])
        .mockResolvedValueOnce([{ config_value: '4000' }]);

      const result = await service.getActiveList('u1', 1);
      expect(result.list).toHaveLength(1);
      expect(result.list[0].linkType).toBe('page');
      expect(result.interval).toBe(4000);
    });

    it('非法/过大 interval 被截断为默认值或上限', async () => {
      queryMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ family_id: 1 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ config_value: '99999999' }]);

      const result = await service.getActiveList('u1', 1);
      expect(result.interval).toBe(60000);
    });
  });

  describe('getGlobalList', () => {
    it('仅返回全局广告（family_id=0）与间隔', async () => {
      queryMock
        .mockResolvedValueOnce([
          { id: 2, family_id: 0, title: 'g', image_url: '/g.jpg', link_type: 'none', link_url: '',
            sort_order: 0, start_time: null, end_time: null, create_time: '2026-01-01' }
        ])
        .mockResolvedValueOnce([{ config_value: '3500' }]);

      const result = await service.getGlobalList();
      expect(result.list).toHaveLength(1);
      expect(result.list[0].familyId).toBe(0);
      expect(result.interval).toBe(3500);
    });
  });
});
