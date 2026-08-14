import { SystemSecurityService } from './system-security.service';
import type { PasswordPolicy } from './system-security.service';

describe('SystemSecurityService (纯逻辑)', () => {
  describe('checkPasswordAgainstPolicy', () => {
    const base: PasswordPolicy = {
      minLength: 6,
      requireUpper: false,
      requireLower: false,
      requireNumber: false,
      requireSpecial: false,
      expireDays: 0
    };

    it('满足最小长度返回空串', () => {
      expect(SystemSecurityService.checkPasswordAgainstPolicy('abcdef', base)).toBe('');
    });

    it('短于最小长度返回长度错误', () => {
      expect(SystemSecurityService.checkPasswordAgainstPolicy('abc', base)).toContain('6');
    });

    it('空密码返回长度错误', () => {
      expect(SystemSecurityService.checkPasswordAgainstPolicy('', base)).toContain('6');
    });

    it('要求大写时不满足返回错误', () => {
      const p = { ...base, requireUpper: true };
      expect(SystemSecurityService.checkPasswordAgainstPolicy('abcdef1', p)).toContain('大写');
      expect(SystemSecurityService.checkPasswordAgainstPolicy('Abcdef1', p)).toBe('');
    });

    it('要求小写时不满足返回错误', () => {
      const p = { ...base, requireLower: true };
      expect(SystemSecurityService.checkPasswordAgainstPolicy('ABCDEF1', p)).toContain('小写');
      expect(SystemSecurityService.checkPasswordAgainstPolicy('ABCDEf1', p)).toBe('');
    });

    it('要求数字时不满足返回错误', () => {
      const p = { ...base, requireNumber: true };
      expect(SystemSecurityService.checkPasswordAgainstPolicy('abcdefG', p)).toContain('数字');
      expect(SystemSecurityService.checkPasswordAgainstPolicy('abcdef1', p)).toBe('');
    });

    it('要求特殊字符时不满足返回错误', () => {
      const p = { ...base, requireSpecial: true };
      expect(SystemSecurityService.checkPasswordAgainstPolicy('abcdef1', p)).toContain('特殊');
      expect(SystemSecurityService.checkPasswordAgainstPolicy('abcdef@', p)).toBe('');
    });

    it('全策略开启时弱密码被拒绝', () => {
      const p = { ...base, requireUpper: true, requireLower: true, requireNumber: true, requireSpecial: true };
      expect(SystemSecurityService.checkPasswordAgainstPolicy('123456', p)).not.toBe('');
      expect(SystemSecurityService.checkPasswordAgainstPolicy('Abcdef1@', p)).toBe('');
    });

    it('minLength=1 时单字符可通过（未开启复杂度）', () => {
      const p = { ...base, minLength: 1 };
      expect(SystemSecurityService.checkPasswordAgainstPolicy('a', p)).toBe('');
    });
  });

  describe('parseIpList', () => {
    it('解析 JSON 数组', () => {
      expect(SystemSecurityService.parseIpList('["192.168.1.1","10.0.0.0/8"]')).toEqual([
        '192.168.1.1',
        '10.0.0.0/8'
      ]);
    });

    it('非 JSON 时按逗号拆分', () => {
      expect(SystemSecurityService.parseIpList('192.168.1.1, 10.0.0.5')).toEqual(['192.168.1.1', '10.0.0.5']);
    });

    it('空输入返回空数组', () => {
      expect(SystemSecurityService.parseIpList('')).toEqual([]);
      expect(SystemSecurityService.parseIpList('[]')).toEqual([]);
    });
  });

  describe('matchIp', () => {
    it('精确匹配', () => {
      expect(SystemSecurityService.matchIp(['192.168.1.1'], '192.168.1.1')).toBe(true);
      expect(SystemSecurityService.matchIp(['192.168.1.1'], '192.168.1.2')).toBe(false);
    });

    it('空规则列表不匹配', () => {
      expect(SystemSecurityService.matchIp([], '1.2.3.4')).toBe(false);
      expect(SystemSecurityService.matchIp([], '')).toBe(false);
    });

    it('通配符 * 匹配', () => {
      expect(SystemSecurityService.matchIp(['192.168.1.*'], '192.168.1.99')).toBe(true);
      expect(SystemSecurityService.matchIp(['192.168.1.*'], '192.168.2.1')).toBe(false);
    });

    it('CIDR 匹配', () => {
      expect(SystemSecurityService.matchIp(['10.0.0.0/8'], '10.1.2.3')).toBe(true);
      expect(SystemSecurityService.matchIp(['10.0.0.0/8'], '11.0.0.1')).toBe(false);
      expect(SystemSecurityService.matchIp(['192.168.1.0/24'], '192.168.1.200')).toBe(true);
      expect(SystemSecurityService.matchIp(['192.168.1.0/24'], '192.168.2.1')).toBe(false);
    });

    it('非法 IP 不匹配', () => {
      expect(SystemSecurityService.matchIp(['10.0.0.0/8'], 'abc')).toBe(false);
    });
  });
});
