import { SystemConfigService, normalizeConfigValue } from './system-config.service';
import type { SysConfigRow } from './types/system-config.types';

function makeRow(partial: Partial<SysConfigRow> & { config_value: string | null; value_type: string }): SysConfigRow {
  return {
    id: 1,
    config_key: 'k',
    config_name: 'n',
    remark: '',
    sort_order: 0,
    status: 1,
    is_system: 1,
    operator: '',
    create_time: '',
    update_time: '',
    ...partial
  } as SysConfigRow;
}

describe('normalizeConfigValue', () => {
  it('string 类型原样返回', () => {
    expect(normalizeConfigValue(makeRow({ config_value: 'abc', value_type: 'string' }))).toBe('abc');
  });

  it('number 类型转为数字', () => {
    expect(normalizeConfigValue(makeRow({ config_value: '6', value_type: 'number' }))).toBe(6);
    expect(normalizeConfigValue(makeRow({ config_value: 'abc', value_type: 'number' }))).toBe(0);
  });

  it('boolean 类型转为布尔', () => {
    expect(normalizeConfigValue(makeRow({ config_value: 'true', value_type: 'boolean' }))).toBe(true);
    expect(normalizeConfigValue(makeRow({ config_value: 'false', value_type: 'boolean' }))).toBe(false);
    expect(normalizeConfigValue(makeRow({ config_value: '1', value_type: 'boolean' }))).toBe(true);
  });

  it('json 类型解析为对象', () => {
    expect(normalizeConfigValue(makeRow({ config_value: '["1.1.1.1"]', value_type: 'json' }))).toEqual(['1.1.1.1']);
  });

  it('非法 json 返回空数组', () => {
    expect(normalizeConfigValue(makeRow({ config_value: 'not-json', value_type: 'json' }))).toEqual([]);
  });

  it('null 值按类型兜底', () => {
    expect(normalizeConfigValue(makeRow({ config_value: null, value_type: 'string' }))).toBe('');
    expect(normalizeConfigValue(makeRow({ config_value: null, value_type: 'number' }))).toBe(0);
    expect(normalizeConfigValue(makeRow({ config_value: null, value_type: 'boolean' }))).toBe(false);
  });
});

describe('SystemConfigService', () => {
  let service: SystemConfigService;
  let queryMock: jest.Mock;
  let invalidateMock: jest.Mock;
  let transactionMock: jest.Mock;

  beforeEach(() => {
    queryMock = jest.fn();
    invalidateMock = jest.fn();
    transactionMock = jest.fn(async (cb: (m: { query: jest.Mock }) => Promise<void>) => cb({ query: queryMock }));

    service = new SystemConfigService(
      { query: queryMock, transaction: transactionMock } as unknown as import('typeorm').DataSource,
      { invalidateConfigCache: invalidateMock } as unknown as never
    );
  });

  describe('getGroups', () => {
    it('按 group 分组并归一化值', async () => {
      queryMock.mockResolvedValueOnce([
        makeRow({ id: 1, config_key: 'system_name', config_value: '测试系统', value_type: 'string', group: 'basic' }),
        makeRow({ id: 2, config_key: 'login_max_attempts', config_value: '5', value_type: 'number', group: 'security' }),
        makeRow({ id: 3, config_key: 'log_access_enabled', config_value: 'true', value_type: 'boolean', group: 'log' })
      ]);

      const result = await service.getGroups();
      expect(result.basic[0].configValue).toBe('测试系统');
      expect(result.security[0].configValue).toBe(5);
      expect(result.log[0].configValue).toBe(true);
      expect(result.basic[0].configKey).toBe('system_name');
    });
  });

  describe('update', () => {
    it('配置不存在时抛 404', async () => {
      queryMock.mockResolvedValueOnce([]);
      await expect(service.update(99, { configValue: 'x' })).rejects.toThrow('配置不存在');
    });

    it('更新成功并失效缓存', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1 }]);
      await service.update(1, { configValue: '新值' }, 'admin');
      expect(queryMock).toHaveBeenCalledTimes(2);
      expect(queryMock.mock.calls[1][0]).toContain('UPDATE `sys_config`');
      expect(invalidateMock).toHaveBeenCalled();
    });

    it('无更新字段时抛 400', async () => {
      queryMock.mockResolvedValueOnce([{ id: 1 }]);
      await expect(service.update(1, {}, 'admin')).rejects.toThrow('没有需要更新的字段');
    });
  });

  describe('saveBatch', () => {
    it('空列表抛 400', async () => {
      await expect(service.saveBatch([], 'admin')).rejects.toThrow('保存内容为空');
    });

    it('缺少 id 或值抛 400', async () => {
      await expect(service.saveBatch([{ id: 0, configValue: 'x' }], 'admin')).rejects.toThrow('缺少 id');
    });

    it('批量保存成功并失效缓存', async () => {
      const result = await service.saveBatch(
        [
          { id: 1, configValue: 'a' },
          { id: 2, configValue: 5 }
        ],
        'admin'
      );
      expect(result.updated).toBe(2);
      expect(queryMock).toHaveBeenCalledTimes(2);
      expect(transactionMock).toHaveBeenCalled();
      expect(invalidateMock).toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('配置不存在时抛 404', async () => {
      queryMock.mockResolvedValueOnce([]);
      await expect(service.reset(99, 'admin')).rejects.toThrow('配置不存在');
    });

    it('非系统内置配置抛 400', async () => {
      queryMock.mockResolvedValueOnce([{ config_key: 'custom', is_system: 0 }]);
      await expect(service.reset(1, 'admin')).rejects.toThrow('仅系统内置配置');
    });

    it('内置配置恢复默认值', async () => {
      queryMock.mockResolvedValueOnce([{ config_key: 'system_name', is_system: 1 }]);
      await service.reset(1, 'admin');
      expect(queryMock.mock.calls[1][0]).toContain('UPDATE');
      expect(queryMock.mock.calls[1][1][0]).toBe('数字家谱管理系统');
    });
  });
});
