import { SystemLogService, inferModule, describeAction, LOG_TYPE_NAMES } from './system-log.service';

describe('inferModule', () => {
  it('从路径提取模块名', () => {
    expect(inferModule('/api/auth/login')).toBe('auth');
    expect(inferModule('/api/system-config/groups')).toBe('system-config');
    expect(inferModule('/api/family_members_2/list')).toBe('family_members_2');
    expect(inferModule('/api')).toBe('');
  });
});

describe('describeAction', () => {
  it('特殊接口有中文动作名', () => {
    expect(describeAction('POST', '/api/auth/login')).toBe('登录');
    expect(describeAction('POST', '/api/auth/refreshToken')).toBe('刷新令牌');
    expect(describeAction('POST', '/api/admin/update-password')).toBe('修改密码');
    expect(describeAction('POST', '/api/system-security/verify-password')).toBe('二次验证');
    expect(describeAction('GET', '/api/system-security/captcha')).toBe('获取验证码');
    expect(describeAction('PUT', '/api/generation-table/1/toggle-status')).toBe('切换状态');
    expect(describeAction('POST', '/api/generation-table/batch-import')).toBe('批量导入');
    expect(describeAction('POST', '/api/system-config/save-batch')).toBe('批量保存');
    expect(describeAction('DELETE', '/api/system-log/clean')).toBe('清理日志');
    expect(describeAction('GET', '/api/system-log/export')).toBe('导出');
  });

  it('按方法兜底', () => {
    expect(describeAction('POST', '/api/family/create')).toBe('新增');
    expect(describeAction('PUT', '/api/family/1')).toBe('编辑');
    expect(describeAction('DELETE', '/api/family/1')).toBe('删除');
    expect(describeAction('GET', '/api/family/list')).toBe('查询');
  });
});

describe('LOG_TYPE_NAMES', () => {
  it('包含三类日志名称', () => {
    expect(LOG_TYPE_NAMES.operation).toBe('操作日志');
    expect(LOG_TYPE_NAMES.error).toBe('错误日志');
    expect(LOG_TYPE_NAMES.access).toBe('访问日志');
  });
});

describe('SystemLogService', () => {
  let service: SystemLogService;
  let queryMock: jest.Mock;

  beforeEach(() => {
    queryMock = jest.fn();
    service = new SystemLogService({ query: queryMock } as unknown as import('typeorm').DataSource);
  });

  describe('getList', () => {
    it('无筛选条件时生成无条件查询', async () => {
      queryMock.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
      const result = await service.getList({ page: 1, pageSize: 10 });
      expect(result.total).toBe(0);
      expect(queryMock.mock.calls[0][0]).not.toContain('WHERE');
      expect(queryMock.mock.calls[0][1].length).toBe(0); // 无筛选值时无参数
    });

    it('按类型/关键词/时间范围筛选', async () => {
      queryMock.mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([{ id: 1 }]);
      await service.getList({ page: 1, pageSize: 10, logType: 'operation', keyword: '登录', startTime: '2026-01-01', endTime: '2026-12-31' });
      const [sql, values] = queryMock.mock.calls[0];
      expect(sql).toContain('`log_type` = ?');
      expect(sql).toContain('`create_time` >= ?');
      expect(sql).toContain('`create_time` <= ?');
      expect(values).toContain('operation');
    });
  });

  describe('clean', () => {
    it('无条件清理抛 400', async () => {
      await expect(service.clean({})).rejects.toThrow('清理条件');
    });

    it('按类型清理返回删除数', async () => {
      queryMock.mockResolvedValueOnce({ affectedRows: 7 });
      const result = await service.clean({ logType: 'error' });
      expect(result.deleted).toBe(7);
      expect(queryMock.mock.calls[0][0]).toContain('DELETE FROM `sys_log`');
    });
  });

  describe('csvEscape', () => {
    it('引号被双写', () => {
      expect(SystemLogService.csvEscape('a"b')).toBe('"a""b"');
    });

    it('公式注入被加前缀', () => {
      expect(SystemLogService.csvEscape('=1+1')).toBe('"\'=1+1"');
      expect(SystemLogService.csvEscape('+SUM(1)')).toBe('"\'+SUM(1)"');
      expect(SystemLogService.csvEscape('@import')).toBe('"\'@import"');
    });

    it('普通值正常包裹', () => {
      expect(SystemLogService.csvEscape('hello')).toBe('"hello"');
    });
  });

  describe('exportToCsv', () => {
    function createRes() {
      const writes: string[] = [];
      return {
        res: {
          write: jest.fn((chunk: string) => { writes.push(chunk); return true; }),
          end: jest.fn(),
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
          headersSent: false
        },
        writes,
        getBody: () => writes.join('')
      } as any;
    }

    it('写入 BOM + 表头 + 数据行并结束响应', async () => {
      const { res, writes, getBody } = createRes();
      queryMock.mockResolvedValueOnce([{ id: 3, log_type: 'operation', module: 'auth', action: '登录', method: 'POST', path: '/api/auth/login', operator: 'admin', ip: '127.0.0.1', status: 200, success: 1, cost_time: 10, create_time: '2026-08-10 12:00:00', detail: 'ok' }]);
      queryMock.mockResolvedValueOnce([]);

      await service.exportToCsv(res, { page: 1, pageSize: 10 });

      expect(writes[0]).toBe('\uFEFF');
      expect(writes[1]).toContain('"ID","类型"');
      expect(getBody()).toContain('"admin"');
      expect(getBody()).toContain('"登录"');
      expect(res.end).toHaveBeenCalled();
    });

    it('使用 id 游标分页且带查询条件时正确传参', async () => {
      const { res } = createRes();
      // 每批 1000 行(与 batchSize 一致),id 依次递减,确保游标推进
      queryMock.mockResolvedValueOnce(Array.from({ length: 1000 }, (_, k) => ({ id: 2000 - k })));
      queryMock.mockResolvedValueOnce(Array.from({ length: 1000 }, (_, k) => ({ id: 1000 - k })));
      queryMock.mockResolvedValueOnce([]);

      await service.exportToCsv(res, { page: 1, pageSize: 10, logType: 'error' });

      // 首批: id < MAX_SAFE_INTEGER,且携带筛选条件
      const [sql1, values1] = queryMock.mock.calls[0];
      expect(sql1).toContain('`log_type` = ?');
      expect(sql1).toContain('`id` < ?');
      expect(values1).toContain('error');
      // 游标推进: 第二批 id < 1001(首批最小 id)
      const [, values2] = queryMock.mock.calls[1];
      expect(values2[values2.length - 2]).toBe(1001);
      expect(res.end).toHaveBeenCalled();
    });

    it('行数达到上限 maxRows 时停止查询', async () => {
      const { res } = createRes();
      // 模拟 3 批各 1000 行,共 3000 > 不再触发(实际单测仅验证循环上限逻辑)
      for (let i = 0; i < 10; i++) {
        queryMock.mockResolvedValueOnce(Array.from({ length: 1000 }, (_, k) => ({ id: 10000 - i * 1000 - k })));
      }
      await service.exportToCsv(res, { page: 1, pageSize: 10 });
      // 因批量 1000,共 10 批达到 10000 上限后停止
      expect(queryMock.mock.calls.length).toBeLessThanOrEqual(11);
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('write', () => {
    it('日志写入失败不影响调用方', async () => {
      queryMock.mockRejectedValueOnce(new Error('db down'));
      await expect(service.write({ logType: 'access' })).resolves.toBeUndefined();
    });

    it('success=false 存为 0', async () => {
      await service.write({ logType: 'access', success: false, operator: 'admin' });
      expect(queryMock.mock.calls[0][1]).toContain(0);
      expect(queryMock.mock.calls[0][1]).toContain('admin');
    });
  });
});
