import { FamilyService } from './family.service';
import { HttpStatus } from '@nestjs/common';

describe('FamilyService', () => {
  let service: FamilyService;
  let queryMock: jest.Mock;
  let transactionMock: jest.Mock;

  beforeEach(() => {
    queryMock = jest.fn();
    transactionMock = jest.fn(async (cb: (manager: { query: jest.Mock }) => Promise<unknown>) => {
      const manager = { query: queryMock };
      return cb(manager);
    });
    service = new FamilyService({ query: queryMock, transaction: transactionMock } as unknown as import('typeorm').DataSource);
  });

  describe('getList', () => {
    it('默认带 status=1 过滤并按 create_time 倒序', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 1 }]) // count
        .mockResolvedValueOnce([{ id: 1, name: '张氏家族', status: 1, generation_sequence: '[]' }]) // list
        .mockResolvedValueOnce([]) // memberCount
        .mockResolvedValueOnce([]) // eventCount
        .mockResolvedValueOnce([]) // photoCount
        .mockResolvedValueOnce([]) // documentCount
        .mockResolvedValueOnce([]) // dynamicCount
        .mockResolvedValueOnce([]); // adminCount

      const result = await service.getList({ page: 1, pageSize: 10 });

      const firstCall = queryMock.mock.calls[0];
      expect(firstCall[0]).toContain('COUNT(*)');
      expect(firstCall[0]).toContain('`status` = ?');
      expect(firstCall[1]).toContain(1);
      expect(result.total).toBe(1);
      expect(result.list).toHaveLength(1);
      expect(result.list[0].realMemberCount).toBe(0);
    });

    it('keyword 触发字辈相关列模糊查询', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getList({ page: 1, pageSize: 10, keyword: '张' });

      const sql = queryMock.mock.calls[0][0];
      expect(sql).toContain('`gt`.`surname` LIKE ?');
      expect(sql).toContain('`gt`.`founder` LIKE ?');
    });

    it('isPublic 过滤生效', async () => {
      queryMock
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getList({ page: 1, pageSize: 10, isPublic: 0 });

      const sql = queryMock.mock.calls[0][0];
      expect(sql).toContain('`is_public` = ?');
    });
  });

  describe('getAll', () => {
    it('返回数据含字辈信息', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1, name: '张氏', generation_sequence: '[]' }]);
      const result = await service.getAll({});
      expect(result).toHaveLength(1);
      expect(result[0].generation_sequence).toEqual([]);
    });
  });

  describe('getById', () => {
    it('找不到时抛出 NOT_FOUND', async () => {
      queryMock.mockResolvedValueOnce([]);
      await expect(service.getById(999)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      });
    });

    it('返回时附带关联统计与字辈序列', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1, name: '张氏', status: 1, generation_sequence: '["文","武"]' }]) // 主查询
        .mockResolvedValueOnce([{ family_id: 1, cnt: 5 }]) // member
        .mockResolvedValueOnce([]) // event
        .mockResolvedValueOnce([{ family_id: 1, cnt: 2 }]) // photo
        .mockResolvedValueOnce([]) // doc
        .mockResolvedValueOnce([]) // dynamic
        .mockResolvedValueOnce([{ family_id: 1, cnt: 1 }]); // admin

      const result = await service.getById(1);
      expect(result.name).toBe('张氏');
      expect(result.generation_sequence).toEqual(['文', '武']);
      expect(result.memberCount).toBe(5);
      expect(result.photoCount).toBe(2);
      expect(result.adminCount).toBe(1);

      // 成员数必须基于家族分表统计，而非遗留基表 family_member
      const memberSql = queryMock.mock.calls[1][0];
      expect(memberSql).toContain('family_members_1');
      expect(memberSql).toContain('`status` = 1');
    });
  });

  describe('create', () => {
    it('名称为空时抛出 BAD_REQUEST', async () => {
      await expect(service.create({ name: '   ' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('名称重复时抛出 BAD_REQUEST', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1 }]);
      await expect(service.create({ name: '张氏家族' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('成功时创建家族并在事务内创建分表', async () => {
      queryMock
        .mockResolvedValueOnce([]) // 重复检查通过
        .mockResolvedValueOnce({ insertId: 5 }) // INSERT family
        .mockResolvedValueOnce([]); // CREATE TABLE family_members_5

      const result = await service.create({ name: '新家族', isPublic: 1 });

      expect(result.id).toBe(5);
      expect(transactionMock).toHaveBeenCalled();
      const insertCall = queryMock.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO `family`');
      const createCall = queryMock.mock.calls[2];
      expect(createCall[0]).toContain('CREATE TABLE IF NOT EXISTS `family_members_5`');
    });

    it('姓氏ID无效时抛出 BAD_REQUEST', async () => {
      queryMock.mockResolvedValueOnce([]); // 重复检查通过
      queryMock.mockResolvedValueOnce([]); // surname 不存在
      await expect(service.create({ name: '家族', surnameId: 999 })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('无效字辈表ID时抛出 BAD_REQUEST', async () => {
      queryMock.mockResolvedValueOnce([]); // 重复检查通过
      queryMock.mockResolvedValueOnce([]); // 字辈表不存在
      await expect(service.create({ name: '家族', generationTableId: 'badid' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('禁用字辈表ID时抛出 BAD_REQUEST', async () => {
      queryMock.mockResolvedValueOnce([]); // 重复检查通过
      queryMock.mockResolvedValueOnce([{ id: 'g1', status: 0, generation_sequence: '["文"]' }]); // 字辈表已禁用
      await expect(service.create({ name: '家族', generationTableId: 'g1' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('有效字辈表ID时保存关联', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 'g1', status: 1, generation_sequence: '["文","武"]' }]) // 字辈表有效
        .mockResolvedValueOnce([]) // 重复检查通过
        .mockResolvedValueOnce({ insertId: 7 }) // INSERT family
        .mockResolvedValueOnce([]); // CREATE TABLE

      const result = await service.create({ name: '家族', generationTableId: 'g1' });
      expect(result.id).toBe(7);
      const insertCall = queryMock.mock.calls[2];
      expect(insertCall[0]).toContain('`generation_table_id`');
      expect(insertCall[1]).toContain('g1');
    });
  });

  describe('update', () => {
    it('家族不存在时抛出 NOT_FOUND', async () => {
      queryMock.mockResolvedValueOnce([]);
      await expect(service.update(999, { name: 'x' })).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      });
    });

    it('名称改为他人已占用名称时抛出 BAD_REQUEST', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1, name: '旧名', generation_table_id: null }]) // 存在
        .mockResolvedValueOnce([{ id: 2 }]); // 重名冲突

      await expect(service.update(1, { name: '占用名' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('无字段更新时抛出 BAD_REQUEST', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1, name: '旧名', generation_table_id: null }]);
      await expect(service.update(1, {})).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('成功时执行 UPDATE', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1, name: '旧名', generation_table_id: null }]) // 存在检查
        .mockResolvedValueOnce([]) // 重名检查（无冲突）
        .mockResolvedValueOnce({ success: true }); // UPDATE

      await service.update(1, { name: '新名', isPublic: 0 });

      const updateCall = queryMock.mock.calls[2];
      expect(updateCall[0]).toContain('UPDATE `family`');
      expect(updateCall[0]).toContain('`name` = ?');
      expect(updateCall[0]).toContain('`is_public` = ?');
    });

    it('更新字辈表ID时校验有效性', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1, name: '旧名', generation_table_id: 'old' }]) // 存在
        .mockResolvedValueOnce([{ id: 'g2', status: 1, generation_sequence: '["文"]' }]) // 新字辈表有效
        .mockResolvedValueOnce({ success: true }); // UPDATE

      await service.update(1, { generationTableId: 'g2' });
      const updateCall = queryMock.mock.calls[2];
      expect(updateCall[0]).toContain('`generation_table_id` = ?');
      expect(updateCall[1]).toContain('g2');
    });
  });

  describe('delete', () => {
    it('软删除将 status 置为 0', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1, status: 1 }])
        .mockResolvedValueOnce({ success: true });

      await service.delete(1);

      const updateCall = queryMock.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE `family` SET `status` = 0');
      expect(updateCall[1]).toEqual([1]);
    });

    it('家族不存在时抛出 NOT_FOUND', async () => {
      queryMock.mockResolvedValueOnce([]);
      await expect(service.delete(999)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      });
    });
  });

  describe('togglePublic', () => {
    it('从 1 切换为 0', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1, is_public: 1 }])
        .mockResolvedValueOnce({ success: true });

      const result = await service.togglePublic(1);
      expect(result.isPublic).toBe(0);
    });

    it('从 0 切换为 1', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 1, is_public: 0 }])
        .mockResolvedValueOnce({ success: true });

      const result = await service.togglePublic(1);
      expect(result.isPublic).toBe(1);
    });
  });
});
