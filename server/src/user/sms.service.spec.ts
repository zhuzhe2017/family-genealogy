import { SmsService } from './sms.service';
import { HttpStatus } from '@nestjs/common';

describe('SmsService', () => {
  let service: SmsService;
  let queryMock: jest.Mock;

  beforeEach(() => {
    queryMock = jest.fn();
    const configMock = { get: jest.fn((_key: string, def: unknown) => def) };
    service = new SmsService(
      configMock as unknown as import('@nestjs/config').ConfigService,
      { query: queryMock } as unknown as import('typeorm').DataSource
    );
  });

  const mockSendFlow = () => {
    // 最近一条(无) → 当天计数(0) → 作废旧码 → 插入新码
    queryMock
      .mockResolvedValueOnce([]) // recent
      .mockResolvedValueOnce([{ cnt: 0 }]) // daily count
      .mockResolvedValueOnce({ affectedRows: 1 }) // invalidate old
      .mockResolvedValueOnce({ affectedRows: 1 }); // insert
  };

  describe('sendCode', () => {
    it('开发模式生成 6 位验证码并返回(devCode)', async () => {
      mockSendFlow();
      const devCode = await service.sendCode('13800138000', 'login');
      expect(devCode).toMatch(/^\d{6}$/);
      // 插入语句：验证码以 SHA-256 哈希入库
      const insertCall = queryMock.mock.calls.find((c) => c[0].startsWith('INSERT'));
      expect(insertCall).toBeTruthy();
      expect(insertCall[1][2]).toMatch(/^[a-f0-9]{64}$/);
    });

    it('60 秒内重发返回 429', async () => {
      queryMock.mockResolvedValueOnce([{ create_time: new Date() }]);
      await expect(service.sendCode('13800138000', 'login')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS
      });
    });

    it('超过每日上限返回 429', async () => {
      queryMock
        .mockResolvedValueOnce([]) // recent: 无
        .mockResolvedValueOnce([{ cnt: 10 }]); // daily: 已满
      await expect(service.sendCode('13800138000', 'login')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS
      });
    });
  });

  describe('verifyCode', () => {
    const row = (overrides: Record<string, unknown> = {}) => ({
      id: 1,
      phone: '13800138000',
      scene: 'login',
      code_hash: require('crypto').createHash('sha256').update('13800138000:123456').digest('hex'),
      expires_at: new Date(Date.now() + 60_000),
      attempts: 0,
      used: 0,
      ...overrides
    });

    it('校验通过并一次性消费', async () => {
      queryMock.mockResolvedValueOnce([row()]).mockResolvedValueOnce({ affectedRows: 1 });
      await expect(service.verifyCode('13800138000', 'login', '123456')).resolves.toBe(true);
      const consumeCall = queryMock.mock.calls.find((c) => c[0].includes('SET `used` = 1'));
      expect(consumeCall).toBeTruthy();
    });

    it('无有效记录返回 400', async () => {
      queryMock.mockResolvedValueOnce([]);
      await expect(service.verifyCode('13800138000', 'login', '123456')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('过期验证码返回 400', async () => {
      queryMock.mockResolvedValueOnce([row({ expires_at: new Date(Date.now() - 1000) })]);
      await expect(service.verifyCode('13800138000', 'login', '123456')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
    });

    it('错误验证码累计次数,达到上限后作废', async () => {
      queryMock.mockResolvedValueOnce([row({ attempts: 4 })]);
      queryMock.mockResolvedValueOnce({ affectedRows: 1 });
      await expect(service.verifyCode('13800138000', 'login', '000000')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      });
      // 第 5 次错误 → 作废(used=1)
      const invalidateCall = queryMock.mock.calls.find((c) => c[0].includes('SET `used` = 1'));
      expect(invalidateCall).toBeTruthy();
    });
  });
});
