import { GenerationTableService, GenerationTableData } from './generation-table.service';
import { HttpStatus } from '@nestjs/common';

describe('GenerationTableService', () => {
  let service: GenerationTableService;
  let queryMock: jest.Mock;

  // 合法基准数据
  const validData: GenerationTableData = {
    surname: '王',
    founder: '王诩',
    generationSequence: ['国', '运', '登', '朝', '熙'],
    commonRegions: ['浙江', '江苏']
  };

  const poemData: GenerationTableData = {
    surname: '李',
    founder: '李晟',
    generationSequence: ['文才廷啟', '仁义礼智', '信忠孝悌', '国泰民安', '家和万事兴'],
    commonRegions: ['湖南', '湖北']
  };

  beforeEach(() => {
    queryMock = jest.fn();
    service = new GenerationTableService({ query: queryMock } as unknown as import('typeorm').DataSource);
  });

  describe('validateFields', () => {
    it('合法数据不抛异常', () => {
      expect(() => service.validateFields(validData)).not.toThrow();
    });

    it('诗句型多字辈合法', () => {
      expect(() => service.validateFields(poemData)).not.toThrow();
    });

    it('单字辈 1 代合法', () => {
      expect(() =>
        service.validateFields({ ...validData, generationSequence: ['文'] })
      ).not.toThrow();
    });

    it('姓氏支持单姓', () => {
      expect(() => service.validateFields({ ...validData, surname: '王' })).not.toThrow();
    });

    it('姓氏支持复姓', () => {
      expect(() => service.validateFields({ ...validData, surname: '欧阳' })).not.toThrow();
    });

    it('姓氏超过 20 字符抛 BAD_REQUEST', () => {
      expect(() => service.validateFields({ ...validData, surname: 'a'.repeat(21) })).toThrowError(/姓氏/);
    });

    it('姓氏含空白字符抛 BAD_REQUEST', () => {
      expect(() => service.validateFields({ ...validData, surname: '王 氏' })).toThrowError(/姓氏/);
    });

    it('始祖 0 字抛 BAD_REQUEST', () => {
      expect(() => service.validateFields({ ...validData, founder: '' })).toThrowError(/始祖/);
    });

    it('始祖 21 字抛 BAD_REQUEST', () => {
      expect(() => service.validateFields({ ...validData, founder: '一二三四五六七八九十一二三四五六七八九十一' })).toThrowError(/始祖/);
    });

    it('字辈序列 0 代抛 BAD_REQUEST', () => {
      expect(() =>
        service.validateFields({ ...validData, generationSequence: [] })
      ).toThrowError(/至少1代/);
    });

    it('字辈序列某代非汉字或分隔符抛 BAD_REQUEST', () => {
      expect(() =>
        service.validateFields({ ...validData, generationSequence: ['国', '运', 'abc', '朝', '熙'] })
      ).toThrowError(/第3代字辈/);
    });

    it('字辈序列每代不能超过 20 字', () => {
      expect(() =>
        service.validateFields({ ...validData, generationSequence: ['一二三四五六七八九十一二三四五六七八九十一'] })
      ).toThrowError(/第1代字辈/);
    });

    it('字辈序列某代为空抛 BAD_REQUEST', () => {
      expect(() =>
        service.validateFields({ ...validData, generationSequence: ['国', '运', '', '朝', '熙'] })
      ).toThrowError(/第3代字辈/);
    });

    it('常见区域空数组抛 BAD_REQUEST', () => {
      expect(() => service.validateFields({ ...validData, commonRegions: [] })).toThrowError(/区域/);
    });

    it('常见区域含空字符串抛 BAD_REQUEST', () => {
      expect(() => service.validateFields({ ...validData, commonRegions: ['浙江', ''] })).toThrowError(/区域/);
    });

    it('partial 模式仅校验已提供字段', () => {
      // 仅提供 surname（合法），不校验未提供的 founder/sequence/regions
      expect(() => service.validateFields({ surname: '王' }, { partial: true })).not.toThrow();
      // 仅提供非法 surname
      expect(() => service.validateFields({ surname: '' }, { partial: true })).toThrowError(/姓氏/);
    });
  });

  describe('create', () => {
    it('姓氏与始祖已存在时抛 BAD_REQUEST', async () => {
      queryMock.mockResolvedValueOnce([{ id: 'exists' }]); // 重复检查
      await expect(service.create(validData)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('成功时生成 32 位 hex ID 并 INSERT', async () => {
      queryMock
        .mockResolvedValueOnce([]) // 重复检查通过
        .mockResolvedValueOnce(undefined); // INSERT

      const result = await service.create(validData);

      expect(result.id).toMatch(/^[a-f0-9]{32}$/);
      const insertCall = queryMock.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO `generation_table`');
      // 第一个参数应为生成的 id
      expect(insertCall[1][0]).toBe(result.id);
      // JSON 列应被序列化
      expect(insertCall[1][3]).toBe(JSON.stringify(validData.generationSequence));
      expect(insertCall[1][4]).toBe(JSON.stringify(validData.commonRegions));
      // 默认 status=1
      expect(insertCall[1][6]).toBe(1);
    });

    it('createBy 缺省时写入空字符串', async () => {
      queryMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(undefined);

      await service.create(validData);
      const insertCall = queryMock.mock.calls[1];
      expect(insertCall[1][5]).toBe('');
    });
  });

  describe('update', () => {
    it('字辈表不存在时抛 NOT_FOUND', async () => {
      queryMock.mockResolvedValueOnce([]);
      await expect(service.update('nope', { surname: '王氏' })).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      });
    });

    it('无字段更新时抛 BAD_REQUEST', async () => {
      queryMock.mockResolvedValueOnce([{ id: 'g1', surname: '欧阳', founder: '欧阳诩' }]);
      await expect(service.update('g1', {})).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('姓氏改为他人已占用时抛 BAD_REQUEST', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 'g1', surname: '欧阳', founder: '欧阳诩' }]) // 存在
        .mockResolvedValueOnce([{ id: 'g2' }]); // 重名冲突

      await expect(service.update('g1', { surname: '王氏', founder: '欧阳诩' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('partial 模式：仅更新 generationSequence 时不触发唯一性检查', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 'g1', surname: '欧阳', founder: '欧阳诩' }]) // 存在
        .mockResolvedValueOnce(undefined); // UPDATE

      await service.update('g1', { generationSequence: ['一', '二', '三', '四', '五'] });

      // 只应有 2 次 query：存在检查 + UPDATE（无唯一性检查）
      expect(queryMock).toHaveBeenCalledTimes(2);
      const updateCall = queryMock.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE `generation_table`');
      expect(updateCall[0]).toContain('`generation_sequence` = ?');
      expect(updateCall[1][0]).toBe(JSON.stringify(['一', '二', '三', '四', '五']));
    });

    it('成功更新姓氏与始祖', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 'g1', surname: '欧阳', founder: '欧阳诩' }]) // 存在
        .mockResolvedValueOnce([]) // 重名检查（无冲突）
        .mockResolvedValueOnce(undefined); // UPDATE

      await service.update('g1', { surname: '王氏', founder: '王诩' });

      const updateCall = queryMock.mock.calls[2];
      expect(updateCall[0]).toContain('UPDATE `generation_table`');
      expect(updateCall[0]).toContain('`surname` = ?');
      expect(updateCall[0]).toContain('`founder` = ?');
    });
  });

  describe('delete', () => {
    it('不存在时抛 NOT_FOUND', async () => {
      queryMock.mockResolvedValueOnce([]);
      await expect(service.delete('nope')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      });
    });

    it('存在时执行 DELETE', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 'g1' }])
        .mockResolvedValueOnce(undefined);

      await service.delete('g1');

      const deleteCall = queryMock.mock.calls[1];
      expect(deleteCall[0]).toContain('DELETE FROM `generation_table`');
      expect(deleteCall[1]).toEqual(['g1']);
    });
  });

  describe('toggleStatus', () => {
    it('从 1 切换为 0', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 'g1', status: 1 }])
        .mockResolvedValueOnce(undefined);

      const result = await service.toggleStatus('g1');
      expect(result.status).toBe(0);
    });

    it('从 0 切换为 1', async () => {
      queryMock
        .mockResolvedValueOnce([{ id: 'g1', status: 0 }])
        .mockResolvedValueOnce(undefined);

      const result = await service.toggleStatus('g1');
      expect(result.status).toBe(1);
    });
  });

  describe('batchImport', () => {
    it('空数组抛 BAD_REQUEST', async () => {
      await expect(service.batchImport([])).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('跳过已存在的记录', async () => {
      queryMock.mockResolvedValueOnce([{ id: 'exists' }]); // 已存在

      const result = await service.batchImport([validData]);
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.total).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('收集非法行错误而不中断后续导入', async () => {
      const badItem: GenerationTableData = { ...validData, founder: '' }; // 始祖为空非法
      queryMock
        .mockResolvedValueOnce([]) // 第二条：重复检查通过
        .mockResolvedValueOnce(undefined); // 第二条：INSERT

      const result = await service.batchImport([badItem, validData]);
      expect(result.imported).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('第 1 行');
      expect(result.total).toBe(2);
    });

    it('成功导入合法且不存在的记录', async () => {
      queryMock
        .mockResolvedValueOnce([]) // 重复检查通过
        .mockResolvedValueOnce(undefined); // INSERT

      const result = await service.batchImport([validData]);
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
