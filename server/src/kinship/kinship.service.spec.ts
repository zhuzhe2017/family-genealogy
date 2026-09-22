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

  /** 模拟成员表存在 + 递归 CTE 按成员 ID 返回祖先链 */
  const mockChains = (chains: Record<string, any[]>) => {
    queryMock.mockImplementation((sql: string, params: any[]) => {
      if (sql.includes('information_schema')) {
        return Promise.resolve([{ exists: 1 }]);
      }
      if (sql.includes('WITH RECURSIVE')) {
        return Promise.resolve(chains[params[0]] || []);
      }
      return Promise.resolve([]);
    });
  };

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
    it('user.family_id 匹配时不抛异常', async () => {
      // 途径1：family_permission 无记录
      queryMock.mockResolvedValueOnce([]);
      // 途径2：user.family_id 匹配
      queryMock.mockResolvedValueOnce([{ family_id: 1, status: 1 }]);
      await expect(service.validateFamilyAccess('u1', 1)).resolves.toBeUndefined();
    });

    it('family_permission 有记录时不抛异常（多家族权限）', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1 }]);
      await expect(service.validateFamilyAccess('u1', 1)).resolves.toBeUndefined();
    });

    it('家族创建者不抛异常', async () => {
      // 途径1：无 family_permission
      queryMock.mockResolvedValueOnce([]);
      // 途径2：user.family_id 不匹配
      queryMock.mockResolvedValueOnce([{ family_id: 2, status: 1 }]);
      // 途径3：是家族创建者
      queryMock.mockResolvedValueOnce([{ creator_user_id: 'u1' }]);
      await expect(service.validateFamilyAccess('u1', 1)).resolves.toBeUndefined();
    });

    it('用户不属于该家族时抛 403', async () => {
      queryMock.mockResolvedValueOnce([]); // family_permission
      queryMock.mockResolvedValueOnce([{ family_id: 2, status: 1 }]); // user 不匹配
      queryMock.mockResolvedValueOnce([{ creator_user_id: 'other' }]); // 非创建者
      await expect(service.validateFamilyAccess('u1', 1)).rejects.toThrow(HttpException);
    });

    it('用户被禁用时抛 403', async () => {
      queryMock.mockResolvedValueOnce([]); // family_permission
      queryMock.mockResolvedValueOnce([{ family_id: null, status: 0 }]); // 被禁用
      await expect(service.validateFamilyAccess('u1', 1)).rejects.toThrow(HttpException);
    });
  });

  describe('findCommonAncestor', () => {
    it('选择同一人时抛 400', async () => {
      await expect(service.findCommonAncestor(1, 'm1', 'm1')).rejects.toThrow(HttpException);
    });

    it('成员不存在时抛 404', async () => {
      mockChains({ child: [] });
      await expect(service.findCommonAncestor(1, 'child', 'father')).rejects.toThrow(HttpException);
    });

    it('找到共同祖先（父子关系），直系称谓含双方姓名', async () => {
      mockChains({
        child: [
          mockMember({ id: 'child', name: '张小三', father_id: 'father', generation: 3 }),
          mockMember({ id: 'father', name: '张大三', father_id: '', generation: 2 })
        ],
        father: [mockMember({ id: 'father', name: '张大三', father_id: '', generation: 2 })]
      });

      const result = await service.findCommonAncestor(1, 'child', 'father');
      expect(result.hasCommonAncestor).toBe(true);
      expect(result.commonAncestor?.id).toBe('father');
      expect(result.relationship?.label).toBe('张大三 是 张小三 的父亲');
      expect(result.relationship?.closeness).toContain('父系');
    });

    it('同辈兄弟（共享父亲）为旁系血亲', async () => {
      mockChains({
        a: [
          mockMember({ id: 'a', name: '张甲', father_id: 'f', generation: 3 }),
          mockMember({ id: 'f', name: '张父', father_id: '', generation: 2 })
        ],
        b: [
          mockMember({ id: 'b', name: '张乙', father_id: 'f', generation: 3 }),
          mockMember({ id: 'f', name: '张父', father_id: '', generation: 2 })
        ]
      });

      const result = await service.findCommonAncestor(1, 'a', 'b');
      expect(result.hasCommonAncestor).toBe(true);
      expect(result.relationship?.label).toBe('兄弟');
      expect(result.relationship?.closeness).toContain('旁系血亲');
      expect(result.relationship?.closeness).toContain('同父亲');
    });

    it('叔侄关系：世代号小者为长辈（验证辈分方向）', async () => {
      // 叔叔第3代，侄子第4代（世代号越小辈分越高）
      mockChains({
        uncle: [
          mockMember({ id: 'uncle', name: '张叔', gender: 'male', father_id: 'gf', generation: 3 }),
          mockMember({ id: 'gf', name: '张祖', father_id: '', generation: 2 })
        ],
        nephew: [
          mockMember({ id: 'nephew', name: '张侄', gender: 'male', father_id: 'f', generation: 4 }),
          mockMember({ id: 'f', name: '张父', gender: 'male', father_id: 'gf', generation: 3 }),
          mockMember({ id: 'gf', name: '张祖', father_id: '', generation: 2 })
        ]
      });

      const result = await service.findCommonAncestor(1, 'uncle', 'nephew');
      expect(result.hasCommonAncestor).toBe(true);
      // 长辈是叔叔（男性），称谓应为"叔伯与侄子"而非"姑与侄"
      expect(result.relationship?.label).toBe('叔伯与侄子');
    });

    it('堂兄弟（共享祖父）', async () => {
      mockChains({
        a: [
          mockMember({ id: 'a', name: '张甲', father_id: 'f1', generation: 4 }),
          mockMember({ id: 'f1', name: '张大伯', gender: 'male', father_id: 'gf', generation: 3 }),
          mockMember({ id: 'gf', name: '张祖', father_id: '', generation: 2 })
        ],
        b: [
          mockMember({ id: 'b', name: '张乙', father_id: 'f2', generation: 4 }),
          mockMember({ id: 'f2', name: '张二伯', gender: 'male', father_id: 'gf', generation: 3 }),
          mockMember({ id: 'gf', name: '张祖', father_id: '', generation: 2 })
        ]
      });

      const result = await service.findCommonAncestor(1, 'a', 'b');
      expect(result.relationship?.label).toBe('堂兄弟');
      expect(result.relationship?.closeness).toContain('共同祖先为第 2 代');
    });

    it('无共同祖先时返回 hasCommonAncestor=false 并提示仅支持父系', async () => {
      mockChains({
        a: [mockMember({ id: 'a', name: '张甲', father_id: '' })],
        b: [mockMember({ id: 'b', name: '张乙', father_id: '' })]
      });

      const result = await service.findCommonAncestor(1, 'a', 'b');
      expect(result.hasCommonAncestor).toBe(false);
      expect(result.commonAncestor).toBeNull();
      expect(result.noCommonReason).toContain('父系');
    });

    it('路径超过称谓计算深度时返回共同祖先但不计算称谓', async () => {
      // 两条 8 代链仅共享顶层祖先 root：a8 → ... → a1(root)，b8 → ... → b1(root)
      const chainOf = (prefix: string) => {
        const chain = [];
        for (let g = 8; g >= 1; g--) {
          chain.push(
            mockMember({
              id: g === 1 ? 'root' : `${prefix}${g}`,
              name: `成员${prefix}${g}`,
              father_id: g > 2 ? `${prefix}${g - 1}` : g === 2 ? 'root' : '',
              generation: g
            })
          );
        }
        return chain;
      };
      mockChains({ ax: chainOf('a'), bx: chainOf('b') });

      const result = await service.findCommonAncestor(1, 'ax', 'bx');
      expect(result.hasCommonAncestor).toBe(true);
      expect(result.commonAncestor?.id).toBe('root');
      expect(result.relationship).toBeNull();
      expect(result.noCommonReason).toContain('超过');
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

    it('LIKE 通配符被转义', async () => {
      queryMock.mockResolvedValueOnce([{ exists: 1 }]);
      queryMock.mockResolvedValueOnce([]);

      await service.searchMembers(1, '张%_');

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('LIKE'),
        ['%张\\%\\_%']
      );
    });
  });
});
