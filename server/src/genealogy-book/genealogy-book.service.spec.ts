import { HttpStatus } from '@nestjs/common';
import { GenealogyBookService } from './genealogy-book.service';

describe('GenealogyBookService', () => {
  let service: GenealogyBookService;
  let queryMock: jest.Mock;

  beforeEach(() => {
    queryMock = jest.fn();
    service = new GenealogyBookService({ query: queryMock } as unknown as import('typeorm').DataSource);
  });

  describe('getTemplates', () => {
    it('返回所有可用模板', () => {
      const templates = service.getTemplates();
      expect(templates).toHaveLength(4);
      expect(templates.map(t => t.key)).toContain('european');
      expect(templates.map(t => t.key)).toContain('su_style');
      expect(templates.map(t => t.key)).toContain('modern');
      expect(templates.map(t => t.key)).toContain('classical');
    });
  });

  describe('validateTemplate', () => {
    it('有效模板不抛异常', () => {
      expect(() => service['validateTemplate']('european')).not.toThrow();
      expect(() => service['validateTemplate']('su_style')).not.toThrow();
      expect(() => service['validateTemplate']('modern')).not.toThrow();
      expect(() => service['validateTemplate']('classical')).not.toThrow();
    });

    it('无效模板抛出 BAD_REQUEST', () => {
      expect(() => service['validateTemplate']('invalid')).toThrow(
        expect.objectContaining({ status: HttpStatus.BAD_REQUEST })
      );
    });

    it('undefined 模板不抛异常', () => {
      expect(() => service['validateTemplate'](undefined)).not.toThrow();
    });
  });

  describe('normalizeTitle', () => {
    it('空标题抛出异常', () => {
      expect(() => service['normalizeTitle']('')).toThrow(
        expect.objectContaining({ status: HttpStatus.BAD_REQUEST })
      );
      expect(() => service['normalizeTitle']('   ')).toThrow(
        expect.objectContaining({ status: HttpStatus.BAD_REQUEST })
      );
    });

    it('超长标题抛出异常', () => {
      expect(() => service['normalizeTitle']('a'.repeat(101))).toThrow(
        expect.objectContaining({ status: HttpStatus.BAD_REQUEST })
      );
    });

    it('正常标题返回去空格后的值', () => {
      expect(service['normalizeTitle']('  张氏族谱  ')).toBe('张氏族谱');
    });
  });

  describe('create', () => {
    it('缺少标题时抛出异常', async () => {
      await expect(service.create(1, { familyId: 1, title: '' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('家族不存在时抛出 NOT_FOUND', async () => {
      queryMock.mockResolvedValueOnce([]); // ensureFamilyExists
      await expect(service.create(1, { familyId: 1, title: '测试' })).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      });
    });

    it('创建成功返回 id', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists
        .mockResolvedValueOnce([]) // check duplicate
        .mockResolvedValueOnce({ insertId: 123 }); // insert

      const result = await service.create(1, { familyId: 1, title: '张氏族谱' });
      expect(result).toEqual({ id: 123 });
    });
  });

  describe('getById', () => {
    it('记录不存在时抛出 NOT_FOUND', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists
        .mockResolvedValueOnce([]); // getById

      await expect(service.getById(1, 999)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      });
    });

    it('返回记录', async () => {
      const mockRow = { id: 1, family_id: 1, title: '测试' };
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists
        .mockResolvedValueOnce([mockRow]); // getById

      const result = await service.getById(1, 1);
      expect(result).toEqual(mockRow);
    });
  });

  describe('update', () => {
    it('无字段更新时抛出异常', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists
        .mockResolvedValueOnce([{ id: 1, family_id: 1, title: '测试' }]); // getById

      await expect(service.update(1, 1, {})).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });
  });

  describe('toggleStatus', () => {
    it('切换状态成功', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1 }]) // ensureFamilyExists
        .mockResolvedValueOnce([{ id: 1, family_id: 1, status: 1 }]) // getById
        .mockResolvedValueOnce({}); // update

      const result = await service.toggleStatus(1, 1);
      expect(result).toEqual({ id: 1, status: 0 });
    });
  });

  describe('getMembersGrouped 大数据量性能', () => {
    function buildMockMembers(count: number) {
      return Array.from({ length: count }, (_, i) => ({
        id: `uuid-${i}`,
        name: `成员${i}`,
        gender: 'male',
        generation: Math.floor(i / 100) + 1, // 每100人一代
        generation_name: '文',
        birth_date: '1950-01-01',
        birth_place: '河南',
        is_alive: 1,
        death_date: '',
        bio: '',
        father_id: i > 0 ? `uuid-${Math.floor((i - 1) / 10)}` : '',
        mother_id: '',
        spouse_info: JSON.stringify([{ name: '配偶' }]),
        sort_order: i
      }));
    }

    function setupMocks(members: ReturnType<typeof buildMockMembers>) {
      queryMock
        .mockResolvedValueOnce([{ exists: 1 }]) // ensureMemberTable
        .mockResolvedValueOnce(members); // members query
    }

    it('1000 人：处理时间 < 1s', async () => {
      const members = buildMockMembers(1000);
      setupMocks(members);

      const start = performance.now();
      const result = await service['getMembersGrouped'](1);
      const elapsed = performance.now() - start;

      expect(result.memberCount).toBe(1000);
      expect(result.generationCount).toBe(10);
      expect(elapsed).toBeLessThan(1000);
    });

    it('5000 人：处理时间 < 3s', async () => {
      const members = buildMockMembers(5000);
      setupMocks(members);

      const start = performance.now();
      const result = await service['getMembersGrouped'](1);
      const elapsed = performance.now() - start;

      expect(result.memberCount).toBe(5000);
      expect(elapsed).toBeLessThan(3000);
    });

    it('10000 人：处理时间 < 5s 且 childrenIds 正确', async () => {
      const members = buildMockMembers(10000);
      setupMocks(members);

      const start = performance.now();
      const result = await service['getMembersGrouped'](1);
      const elapsed = performance.now() - start;

      expect(result.memberCount).toBe(10000);
      expect(result.generationCount).toBe(100);
      expect(elapsed).toBeLessThan(5000);

      // 验证 childrenIds 构建正确（至少有一个成员有子女）
      const allMembers = result.generationLabels.flatMap(g => g.members);
      const withChildren = allMembers.filter(m => m.childrenIds.length > 0);
      expect(withChildren.length).toBeGreaterThan(0);
    });
  });
});
