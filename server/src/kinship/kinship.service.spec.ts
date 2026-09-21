import { Test } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { KinshipService } from './kinship.service';

describe('KinshipService', () => {
  let service: KinshipService;
  let queryMock: jest.Mock;

  const mockMember = (overrides: Partial<any> = {}) => ({
    id: 'm1',
    name: '张三',
    gender: 'male',
    generation: 3,
    generation_name: '三',
    birth_date: '1980-01-01',
    death_date: '',
    is_alive: 1,
    father_id: 'f1',
    sort_order: 0,
    ...overrides
  });

  beforeEach(async () => {
    queryMock = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        KinshipService,
        {
          provide: DataSource,
          useValue: { query: queryMock }
        }
      ]
    }).compile();

    service = module.get<KinshipService>(KinshipService);
  });

  describe('validateFamilyAccess', () => {
    it('用户属于该家族时不抛异常', async () => {
      queryMock.mockResolvedValueOnce([{ family_id: 1, status: 1 }]);
      await expect(service.validateFamilyAccess('u1', 1)).resolves.toBeUndefined();
    });

    it('用户不属于该家族时抛 403', async () => {
      queryMock.mockResolvedValueOnce([{ family_id: 2, status: 1 }]);
      await expect(service.validateFamilyAccess('u1', 1)).rejects.toThrow(HttpException);
    });

    it('用户被禁用时抛 403', async () => {
      queryMock.mockResolvedValueOnce([{ family_id: 1, status: 0 }]);
      await expect(service.validateFamilyAccess('u1', 1)).rejects.toThrow(HttpException);
    });
  });

  describe('findCommonAncestor', () => {
    it('选择同一人时抛 400', async () => {
      await expect(service.findCommonAncestor(1, 'm1', 'm1')).rejects.toThrow(HttpException);
    });

    it('找到共同祖先（父子关系）', async () => {
      // ensureMemberTable (getMember A + getMember B 并发，共2次)
      queryMock
        .mockResolvedValueOnce([{ exists: 1 }])
        .mockResolvedValueOnce([{ exists: 1 }]);
      // getMember A
      queryMock.mockResolvedValueOnce([mockMember({ id: 'child', father_id: 'father', generation: 3 })]);
      // getMember B
      queryMock.mockResolvedValueOnce([mockMember({ id: 'father', father_id: '', generation: 2 })]);

      // buildAncestorChain A + B 并发，ensureMemberTable 各调1次
      queryMock
        .mockResolvedValueOnce([{ exists: 1 }])
        .mockResolvedValueOnce([{ exists: 1 }]);

      // chain A 循环：child → father → 结束
      // chain B 循环：father → 结束
      // 由于 Promise.all 并发，A 和 B 的查询可能交错
      // 用 mockImplementation 根据 SQL 内容判断返回什么
      queryMock.mockImplementation((sql: string) => {
        if (sql.includes('child')) {
          return Promise.resolve([mockMember({ id: 'child', father_id: 'father', generation: 3 })]);
        }
        if (sql.includes('father')) {
          return Promise.resolve([mockMember({ id: 'father', father_id: '', generation: 2 })]);
        }
        return Promise.resolve([]);
      });

      const result = await service.findCommonAncestor(1, 'child', 'father');
      expect(result.hasCommonAncestor).toBe(true);
      expect(result.commonAncestor?.id).toBe('father');
      expect(result.relationship?.label).toContain('父亲');
    });

    it('无共同祖先时返回 hasCommonAncestor=false', async () => {
      // ensureMemberTable (getMember A + getMember B 并发，共2次)
      queryMock
        .mockResolvedValueOnce([{ exists: 1 }])
        .mockResolvedValueOnce([{ exists: 1 }]);
      // getMember A（无父亲）
      queryMock.mockResolvedValueOnce([mockMember({ id: 'a', father_id: '' })]);
      // getMember B（不同根，无父亲）
      queryMock.mockResolvedValueOnce([mockMember({ id: 'b', father_id: '' })]);
      // ensureMemberTable (buildAncestorChain A + B 并发，共2次)
      queryMock
        .mockResolvedValueOnce([{ exists: 1 }])
        .mockResolvedValueOnce([{ exists: 1 }]);
      // chain A: a（无父）
      queryMock.mockResolvedValueOnce([mockMember({ id: 'a', father_id: '' })]);
      // chain B: b（无父）
      queryMock.mockResolvedValueOnce([mockMember({ id: 'b', father_id: '' })]);

      const result = await service.findCommonAncestor(1, 'a', 'b');
      expect(result.hasCommonAncestor).toBe(false);
      expect(result.commonAncestor).toBeNull();
    });
  });

  describe('searchMembers', () => {
    it('按姓名模糊搜索并返回父亲姓名', async () => {
      // ensureMemberTable
      queryMock.mockResolvedValueOnce([{ exists: 1 }]);
      // 成员查询
      queryMock.mockResolvedValueOnce([
        { id: 'm1', name: '张三', gender: 'male', generation: 3, generation_name: '三', birth_date: '1980', father_id: 'f1' }
      ]);
      // 父亲查询
      queryMock.mockResolvedValueOnce([{ id: 'f1', name: '张父' }]);

      const result = await service.searchMembers(1, '张三');
      expect(result).toHaveLength(1);
      expect(result[0].fatherName).toBe('张父');
    });

    it('无父亲时 fatherName 为空', async () => {
      queryMock.mockResolvedValueOnce([{ exists: 1 }]);
      queryMock.mockResolvedValueOnce([
        { id: 'm1', name: '张三', gender: 'male', generation: 1, generation_name: '', birth_date: '', father_id: '' }
      ]);

      const result = await service.searchMembers(1, '张三');
      expect(result[0].fatherName).toBe('');
    });
  });
});
