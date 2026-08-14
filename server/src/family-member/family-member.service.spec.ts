import { FamilyMemberService } from './family-member.service';
import { HttpStatus } from '@nestjs/common';

describe('FamilyMemberService', () => {
  let service: FamilyMemberService;
  let queryMock: jest.Mock;

  beforeEach(() => {
    queryMock = jest.fn();
    service = new FamilyMemberService({ query: queryMock } as unknown as import('typeorm').DataSource);
  });

  const mockTableExists = (_tableName = 'family_members_1') => {
    queryMock.mockResolvedValueOnce([{ exists: 1 }]);
  };

  describe('getList', () => {
    it('表不存在时抛出 NOT_FOUND', async () => {
      queryMock.mockResolvedValueOnce([]); // table not exists
      await expect(service.getList(1, { page: 1, pageSize: 10 })).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      });
    });

    it('默认过滤 status=1 并分页返回', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce([{ id: 'a1', name: '张三' }, { id: 'a2', name: '李四' }]);

      const result = await service.getList(1, { page: 1, pageSize: 10 });

      const countSql = queryMock.mock.calls[1][0];
      expect(countSql).toContain('family_members_1');
      expect(countSql).toContain('`status` = ?');
      expect(queryMock.mock.calls[1][1]).toContain(1);
      expect(result.list).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('支持按代数筛选', async () => {
      mockTableExists();
      queryMock.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);

      await service.getList(1, { page: 1, pageSize: 10, generation: 3 });

      const sql = queryMock.mock.calls[1][0];
      expect(sql).toContain('`generation` = ?');
      expect(queryMock.mock.calls[1][1]).toContain(3);
    });
  });

  describe('getAll', () => {
    it('返回全部成员按 generation 排序', async () => {
      mockTableExists();
      queryMock.mockResolvedValueOnce([{ id: 'a', name: 'A', generation: 1 }]);

      const result = await service.getAll(1);
      expect(result).toHaveLength(1);
      const sql = queryMock.mock.calls[1][0];
      expect(sql).toContain('ORDER BY `generation` ASC');
    });
  });

  describe('getById', () => {
    it('找不到成员时抛出 NOT_FOUND', async () => {
      mockTableExists();
      queryMock.mockResolvedValueOnce([]);
      await expect(service.getById(1, 'not-found')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      });
    });

    it('正确返回成员详情并附带照片', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce([{ id: 'm1', name: '张三' }]) // 成员行
        .mockResolvedValueOnce([{ exists: 1 }]) // 照片分表存在
        .mockResolvedValueOnce([{ photo_url: '/uploads/a.jpg' }, { photo_url: '/uploads/b.jpg' }]); // 照片列表
      const result = await service.getById(1, 'm1');
      expect(result.name).toBe('张三');
      expect(result.photos).toEqual(['/uploads/a.jpg', '/uploads/b.jpg']);
    });
  });

  describe('create', () => {
    it('姓名为空时抛出 BAD_REQUEST', async () => {
      mockTableExists();
      await expect(service.create(1, { name: '   ' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('性别非法时抛出 BAD_REQUEST', async () => {
      mockTableExists();
      await expect(service.create(1, { name: '张三', gender: 'unknown' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('成功创建第1代成员并返回 32 位 hex ID', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce({ affectedRows: 1 }) // INSERT
        .mockResolvedValueOnce({ affectedRows: 1 }); // member_count +1

      const result = await service.create(1, { name: '张三', generation: 1 });

      expect(result.id).toMatch(/^[a-f0-9]{32}$/);
      const sql = queryMock.mock.calls[1][0];
      expect(sql).toContain('INSERT INTO `family_members_1`');
      expect(queryMock.mock.calls[1][1]).toContain(1); // family_id
      expect(queryMock.mock.calls[1][1]).toContain(1); // generation
      expect(queryMock.mock.calls[1][1]).toContain('张三');
      expect(queryMock.mock.calls[1][1]).toContain(''); // father_id 为空

      // 创建后 member_count 原子 +1
      const incSql = queryMock.mock.calls[2][0];
      expect(incSql).toContain('UPDATE `family`');
      expect(incSql).toContain('GREATEST(CAST(member_count AS SIGNED) + ?, 0)');
      expect(queryMock.mock.calls[2][1]).toEqual([1, 1]);
    });

    it('成功创建第2代及以上成员并返回 32 位 hex ID', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce([{ id: 'f1', gender: 'male', generation: 1 }]) // 关系校验：父亲存在且为上一代男性
        .mockResolvedValueOnce([{ exists: 1 }]) // checkDuplicate 内部 ensureTable
        .mockResolvedValueOnce([]) // 同父同名唯一性校验：不存在
        .mockResolvedValueOnce({ affectedRows: 1 }) // INSERT
        .mockResolvedValueOnce({ affectedRows: 1 }); // member_count +1

      const result = await service.create(1, { name: '张三', generation: 2, fatherId: 'f1' });

      expect(result.id).toMatch(/^[a-f0-9]{32}$/);
      const sql = queryMock.mock.calls[4][0];
      expect(sql).toContain('INSERT INTO `family_members_1`');
      expect(queryMock.mock.calls[4][1]).toContain(1); // family_id
      expect(queryMock.mock.calls[4][1]).toContain(2); // generation
      expect(queryMock.mock.calls[4][1]).toContain('张三');
      expect(queryMock.mock.calls[4][1]).toContain('f1'); // father_id

      // 创建后 member_count 原子 +1
      const incSql = queryMock.mock.calls[5][0];
      expect(incSql).toContain('UPDATE `family`');
      expect(incSql).toContain('GREATEST(CAST(member_count AS SIGNED) + ?, 0)');
      expect(queryMock.mock.calls[5][1]).toEqual([1, 1]);
    });

    it('第2代及以上未选父亲时抛出 BAD_REQUEST', async () => {
      mockTableExists();
      await expect(service.create(1, { name: '张三', generation: 2 })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('第1代设置父亲时抛出 BAD_REQUEST', async () => {
      mockTableExists();
      await expect(service.create(1, { name: '张三', generation: 1, fatherId: 'f1' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('父与母为同一成员时抛出 BAD_REQUEST', async () => {
      mockTableExists();
      await expect(service.create(1, { name: '张三', generation: 2, fatherId: 'f1', motherId: 'f1' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('父/母成员不存在时抛出 BAD_REQUEST', async () => {
      mockTableExists();
      queryMock.mockResolvedValueOnce([]); // 查询父/母返回空
      await expect(service.create(1, { name: '张三', generation: 2, fatherId: 'f1' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('父/母成员有效时创建成功', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce([{ id: 'f1', gender: 'male', generation: 1 }]) // 关系校验通过
        .mockResolvedValueOnce([{ exists: 1 }]) // checkDuplicate 内部 ensureTable
        .mockResolvedValueOnce([]) // 同父同名唯一性校验：不存在
        .mockResolvedValueOnce({ affectedRows: 1 }); // INSERT

      const result = await service.create(1, { name: '张三', generation: 2, fatherId: 'f1' });

      expect(result.id).toMatch(/^[a-f0-9]{32}$/);
      const insertSql = queryMock.mock.calls[4][0];
      expect(insertSql).toContain('INSERT INTO `family_members_1`');
      expect(queryMock.mock.calls[4][1]).toContain('f1'); // father_id
    });

    it('同一父亲下存在同名成员时抛出 BAD_REQUEST（提示成员已经存在）', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce([{ id: 'f1', gender: 'male', generation: 1 }]) // 关系校验通过
        .mockResolvedValueOnce([{ exists: 1 }]) // checkDuplicate 内部 ensureTable
        .mockResolvedValueOnce([{ id: 'dup' }]); // 唯一性校验：已存在同名成员

      await expect(service.create(1, { name: '张三', generation: 2, fatherId: 'f1' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: '成员已经存在'
      });
    });
  });

  describe('update', () => {
    it('成员不存在时抛出 NOT_FOUND', async () => {
      mockTableExists();
      queryMock.mockResolvedValueOnce([]);
      await expect(service.update(1, 'x', { name: '李四' })).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      });
    });

    it('无字段时抛出 BAD_REQUEST', async () => {
      mockTableExists();
      queryMock.mockResolvedValueOnce([{ id: 'x' }]);
      await expect(service.update(1, 'x', {})).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('成功更新字段', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce([{ id: 'x', status: 1 }])
        .mockResolvedValueOnce({ affectedRows: 1 }); // UPDATE

      await service.update(1, 'x', { name: '李四', generation: 1 });

      const sql = queryMock.mock.calls[2][0];
      expect(sql).toContain('UPDATE `family_members_1`');
      expect(sql).toContain('`name` = ?');
      expect(sql).toContain('`generation` = ?');
      expect(queryMock.mock.calls[2][1]).toContain('李四');
      expect(queryMock.mock.calls[2][1]).toContain(1);

      // 未变更 status，不触发计数调整
      expect(queryMock.mock.calls).toHaveLength(3);
    });

    it('修改代数为2代及以上但清空父亲时抛出 BAD_REQUEST', async () => {
      mockTableExists();
      queryMock.mockResolvedValueOnce([{ id: 'x' }]);
      await expect(service.update(1, 'x', { generation: 2, fatherId: '' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('状态 1→0 时 member_count 原子 -1', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce([{ id: 'x', status: 1 }]) // 查找成员
        .mockResolvedValueOnce({ affectedRows: 1 }) // UPDATE
        .mockResolvedValueOnce({ affectedRows: 1 }); // member_count -1

      await service.update(1, 'x', { status: 0 });

      const decSql = queryMock.mock.calls[3][0];
      expect(decSql).toContain('UPDATE `family`');
      expect(decSql).toContain('GREATEST(CAST(member_count AS SIGNED) + ?, 0)');
      expect(queryMock.mock.calls[3][1]).toEqual([-1, 1]);
    });

    it('姓名为空时抛出 BAD_REQUEST', async () => {
      mockTableExists();
      queryMock.mockResolvedValueOnce([{ id: 'x' }]);
      await expect(service.update(1, 'x', { name: '' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('父/母指向自己时抛出 BAD_REQUEST', async () => {
      mockTableExists();
      queryMock.mockResolvedValueOnce([{ id: 'x' }]); // 查找成员
      await expect(service.update(1, 'x', { fatherId: 'x' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('形成循环引用时抛出 BAD_REQUEST', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce([{ id: 'x' }]) // 查找成员
        .mockResolvedValueOnce([{ id: 'y', gender: 'male', generation: 1 }]) // 关系校验：y 存在且为上一代男性
        .mockResolvedValueOnce([{ id: 'y', father_id: 'x', mother_id: '' }]) // 追溯 y 的祖先
        .mockResolvedValueOnce([{ id: 'x', father_id: '', mother_id: '' }]); // 追溯到 x（循环）
      await expect(service.update(1, 'x', { fatherId: 'y', generation: 2 })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('关系字段有效时更新成功', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce([{ id: 'x' }]) // 查找成员
        .mockResolvedValueOnce([{ id: 'f1', gender: 'male', generation: 1 }]) // 关系校验：f1 存在且有效（motherId 为配偶 rank，不校验成员身份）
        .mockResolvedValueOnce([{ id: 'f1', father_id: '', mother_id: '' }]) // 追溯 f1 祖先，无循环
        .mockResolvedValueOnce({ affectedRows: 1 }); // UPDATE

      await service.update(1, 'x', { motherId: 'm1', generation: 2, fatherId: 'f1' });

      const sql = queryMock.mock.calls[4][0];
      expect(sql).toContain('UPDATE `family_members_1`');
      expect(sql).toContain('`mother_id` = ?');
      expect(queryMock.mock.calls[4][1]).toContain('m1');
    });

    it('修改为同父同名时抛出 BAD_REQUEST（排除自身）', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce([{ id: 'x', status: 1 }]) // 查找成员
        .mockResolvedValueOnce([{ id: 'f1', gender: 'male', generation: 1 }]) // 关系校验：f1 存在且有效
        .mockResolvedValueOnce([{ id: 'f1', father_id: '', mother_id: '' }]) // 追溯 f1 祖先，无循环
        .mockResolvedValueOnce([{ exists: 1 }]) // checkDuplicate 内部 ensureTable
        .mockResolvedValueOnce([{ id: 'dup' }]); // 唯一性校验：其他成员已同名

      await expect(service.update(1, 'x', { name: '张三', generation: 2, fatherId: 'f1' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: '成员已经存在'
      });
    });
  });

  describe('delete', () => {
    it('软删除状态置为 0', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce([{ id: 'x', status: 1 }])
        .mockResolvedValueOnce({ affectedRows: 1 }) // UPDATE status=0
        .mockResolvedValueOnce({ affectedRows: 1 }); // member_count -1

      await service.delete(1, 'x');

      const sql = queryMock.mock.calls[2][0];
      expect(sql).toContain('UPDATE `family_members_1`');
      expect(sql).toContain('`status` = 0');

      // 删除后 member_count 原子 -1
      const decSql = queryMock.mock.calls[3][0];
      expect(decSql).toContain('UPDATE `family`');
      expect(decSql).toContain('GREATEST(CAST(member_count AS SIGNED) + ?, 0)');
      expect(queryMock.mock.calls[3][1]).toEqual([-1, 1]);
    });

    it('删除已删除成员时不重复减计数', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce([{ id: 'x' }]) // 查找成员存在
        .mockResolvedValueOnce({ affectedRows: 0 }); // 条件更新未命中（原状态已是 0）

      await service.delete(1, 'x');

      // 条件更新 affectedRows=0，不触发计数调整
      expect(queryMock.mock.calls).toHaveLength(3);
    });

    it('并发重复删除同一成员只减一次计数', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce([{ id: 'x' }]) // 查找成员
        .mockResolvedValueOnce({ affectedRows: 1 }) // 条件更新命中（本次删除生效）
        .mockResolvedValueOnce({ affectedRows: 1 }); // member_count -1

      await service.delete(1, 'x');

      // 条件更新必须是 WHERE status = 1
      const sql = queryMock.mock.calls[2][0];
      expect(sql).toContain('`status` = 0');
      expect(sql).toContain('AND `status` = 1');
    });
  });

  describe('toggleAlive', () => {
    it('1 -> 0', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce([{ id: 'x', is_alive: 1 }])
        .mockResolvedValueOnce({ affectedRows: 1 });

      const result = await service.toggleAlive(1, 'x');
      expect(result.isAlive).toBe(0);
    });
  });

  describe('exists', () => {
    it('表不存在返回 false', async () => {
      queryMock.mockResolvedValueOnce([]);
      const result = await service.exists(1);
      expect(result).toBe(false);
    });

    it('表存在返回 true', async () => {
      mockTableExists();
      const result = await service.exists(1);
      expect(result).toBe(true);
    });
  });

  describe('checkDuplicate', () => {
    it('同一父亲下存在同名成员时返回 exists=true', async () => {
      mockTableExists();
      queryMock.mockResolvedValueOnce([{ id: 'dup' }]);
      const result = await service.checkDuplicate(1, '张三', 'f1', '');
      expect(result.exists).toBe(true);
    });

    it('不存在同名成员时返回 exists=false', async () => {
      mockTableExists();
      queryMock.mockResolvedValueOnce([]);
      const result = await service.checkDuplicate(1, '张三', 'f1', '');
      expect(result.exists).toBe(false);
    });

    it('排除自身后同名不误判', async () => {
      mockTableExists();
      queryMock.mockResolvedValueOnce([]);
      const result = await service.checkDuplicate(1, '张三', 'f1', 'self');
      expect(result.exists).toBe(false);
      expect(queryMock.mock.calls[1][1]).toContain('self');
    });

    it('姓名或父亲为空时不查库直接返回 false', async () => {
      mockTableExists();
      const result = await service.checkDuplicate(1, '  ', 'f1', '');
      expect(result.exists).toBe(false);
      expect(queryMock.mock.calls).toHaveLength(1);
    });
  });

  describe('batchImport', () => {
    it('导入数据为空时抛出 BAD_REQUEST', async () => {
      mockTableExists();
      await expect(service.batchImport(1, [])).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('全部导入成功', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce({ affectedRows: 1 }) // INSERT
        .mockResolvedValueOnce({ affectedRows: 1 }); // member_count +1

      const result = await service.batchImport(1, [{ name: '张三', generation: 3 }]);

      expect(result.imported).toBe(1);
      expect(result.total).toBe(1);
      expect(result.errors).toHaveLength(0);
      const insertSql = queryMock.mock.calls[1][0];
      expect(insertSql).toContain('INSERT INTO `family_members_1`');
      expect(queryMock.mock.calls[1][1]).toContain('张三');

      // 导入后 member_count 原子 +imported
      const incSql = queryMock.mock.calls[2][0];
      expect(incSql).toContain('UPDATE `family`');
      expect(incSql).toContain('GREATEST(CAST(member_count AS SIGNED) + ?, 0)');
      expect(queryMock.mock.calls[2][1]).toEqual([1, 1]);
    });

    it('非法行被跳过并记录错误，不影响其他行', async () => {
      mockTableExists();
      queryMock
        .mockResolvedValueOnce({ affectedRows: 1 }) // 第 1 行 INSERT
        .mockResolvedValueOnce({ affectedRows: 1 }); // 第 3 行 INSERT

      const result = await service.batchImport(1, [
        { name: '李四' },
        { name: '', gender: 'male' },
        { name: '王五', gender: 'unknown' },
        { name: '赵六' }
      ]);

      expect(result.imported).toBe(2);
      expect(result.total).toBe(4);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('第 2 行');
      expect(result.errors[1]).toContain('第 3 行');
    });
  });
});
