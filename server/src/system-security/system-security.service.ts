import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomBytes, randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { SystemLogService } from '../system-log/system-log.service';
import type { SysConfigRow } from '../system-config/types/system-config.types';

/** 密码策略 */
export interface PasswordPolicy {
  minLength: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  expireDays: number;
}

const CONFIG_CACHE_TTL = 5_000; // 配置缓存有效期(毫秒)
const CAPTCHA_TTL = 10 * 60 * 1000; // 验证码有效期(毫秒)

@Injectable()
export class SystemSecurityService {
  private readonly configCache = new Map<string, { value: string; expires: number }>();
  private readonly captchaStore = new Map<string, { code: string; expires: number }>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly systemLogService: SystemLogService
  ) {}

  // ==================== 配置读取（5s 缓存） ====================

  /** 读取单条配置值（带缓存，调用方不应感知缓存） */
  async getConfig(key: string, defaultVal = ''): Promise<string> {
    const cached = this.configCache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }

    const [row] = await this.dataSource.query<SysConfigRow[]>(
      'SELECT `config_value` FROM `sys_config` WHERE `config_key` = ? AND `status` = 1',
      [key]
    );
    const value = row ? String(row.config_value ?? defaultVal) : defaultVal;
    this.configCache.set(key, { value, expires: Date.now() + CONFIG_CACHE_TTL });
    return value;
  }

  /** 批量读取配置（同一缓存 TTL） */
  async getConfigs(keys: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    await Promise.all(keys.map(async k => { result[k] = await this.getConfig(k); }));
    return result;
  }

  /** 使配置缓存失效（配置被修改后调用，保证即时生效） */
  invalidateConfigCache() {
    this.configCache.clear();
  }

  // ==================== 密码策略 ====================

  /** 获取当前生效的密码策略 */
  async getPasswordPolicy(): Promise<PasswordPolicy> {
    const c = await this.getConfigs([
      'password_min_length',
      'password_require_upper',
      'password_require_lower',
      'password_require_number',
      'password_require_special',
      'password_expire_days'
    ]);
    return {
      minLength: Math.max(1, Number(c.password_min_length) || 6),
      requireUpper: c.password_require_upper === 'true',
      requireLower: c.password_require_lower === 'true',
      requireNumber: c.password_require_number === 'true',
      requireSpecial: c.password_require_special === 'true',
      expireDays: Number(c.password_expire_days) || 0
    };
  }

  /** 校验密码是否满足策略，返回错误信息（满足时返回空串） */
  async validatePassword(password: string): Promise<string> {
    const policy = await this.getPasswordPolicy();
    return SystemSecurityService.checkPasswordAgainstPolicy(password, policy);
  }

  /** 纯函数校验（供单元测试直接调用） */
  static checkPasswordAgainstPolicy(password: string, policy: PasswordPolicy): string {
    if (!password || password.length < policy.minLength) {
      return `密码长度不能少于 ${policy.minLength} 位`;
    }
    if (/[\x00-\x1F\x7F]/.test(password)) {
      return '密码包含不允许的控制字符';
    }
    if (policy.requireUpper && !/[A-Z]/.test(password)) {
      return '密码必须包含至少 1 个大写字母';
    }
    if (policy.requireLower && !/[a-z]/.test(password)) {
      return '密码必须包含至少 1 个小写字母';
    }
    if (policy.requireNumber && !/[0-9]/.test(password)) {
      return '密码必须包含至少 1 个数字';
    }
    if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
      return '密码必须包含至少 1 个特殊字符';
    }
    return '';
  }

  // ==================== IP 访问限制 ====================

  /** 校验请求 IP 是否被允许（不满足时抛 403） */
  async checkIpRestriction(ip: string) {
    const enabled = (await this.getConfig('ip_restriction_enabled', 'false')) === 'true';
    if (!enabled) return;

    const mode = await this.getConfig('ip_restriction_mode', 'blacklist');
    const rawList = (await this.getConfig('ip_blacklist', '[]')) + '|' + (await this.getConfig('ip_whitelist', '[]'));
    const list = SystemSecurityService.parseIpList(rawList === '' ? '' : rawList, '|');
    const match = SystemSecurityService.matchIp(list, ip);

    if (mode === 'whitelist' && !match) {
      throw new HttpException('当前 IP 不在白名单内，禁止访问', HttpStatus.FORBIDDEN);
    }
    if (mode === 'blacklist' && match) {
      throw new HttpException('当前 IP 已被列入黑名单，禁止访问', HttpStatus.FORBIDDEN);
    }
  }

  /** 解析 IP 列表（支持 CIDR 与通配符，如 192.168.1.*、10.0.0.0/8） */
  static parseIpList(input: string, sep = '|'): string[] {
    const list: string[] = [];
    for (const chunk of input.split(sep)) {
      try {
        const arr = JSON.parse(chunk);
        if (Array.isArray(arr)) list.push(...arr.map(String).filter(Boolean));
      } catch {
        // 非 JSON 时按逗号拆分
        chunk.split(',').map(s => s.trim()).filter(Boolean).forEach(s => list.push(s));
      }
    }
    return list;
  }

  /** 判断 IP 是否命中规则列表 */
  static matchIp(rules: string[], ip: string): boolean {
    if (!ip || rules.length === 0) return false;
    for (const rule of rules) {
      const r = rule.trim();
      if (!r) continue;
      if (r === ip) return true;
      // 通配符 * 匹配
      if (r.includes('*')) {
        const regex = new RegExp('^' + r.replace(/\./g, '\\.').replace(/\*/g, '[0-9]+') + '$');
        if (regex.test(ip)) return true;
        continue;
      }
      // CIDR 匹配
      if (r.includes('/')) {
        const [base, maskStr] = r.split('/');
        const mask = Number(maskStr);
        if (Number.isInteger(mask) && mask >= 0 && mask <= 32) {
          const ipInt = SystemSecurityService.ipToInt(ip);
          const baseInt = SystemSecurityService.ipToInt(base);
          if (ipInt !== null && baseInt !== null) {
            const m = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;
            if ((ipInt & m) === (baseInt & m)) return true;
          }
        }
      }
    }
    return false;
  }

  private static ipToInt(ip: string): number | null {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return null;
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }

  // ==================== 登录失败锁定 ====================

  /** 检查账号是否处于锁定状态，抛出错误时附带剩余分钟 */
  async checkLoginLocked(username: string) {
    const maxAttempts = Math.max(1, Number(await this.getConfig('login_max_attempts', '5')) || 5);
    const lockMinutes = Math.max(1, Number(await this.getConfig('login_lockout_minutes', '15')) || 15);

    const [row] = await this.dataSource.query<{ cnt: number }[]>(
      `SELECT COUNT(*) AS cnt FROM \`sys_log\`
       WHERE \`log_type\` = 'access' AND \`operator\` = ? AND \`success\` = 0
         AND \`create_time\` >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [username, lockMinutes]
    );
    const failedCount = row?.cnt ?? 0;
    if (failedCount >= maxAttempts) {
      throw new HttpException(
        `登录失败次数过多，账号已锁定，请 ${lockMinutes} 分钟后再试`,
        HttpStatus.FORBIDDEN
      );
    }
  }

  // ==================== 图形验证码 ====================

  /** 生成图形验证码（返回 token 与 SVG），token 在服务端缓存校验 */
  async generateCaptcha(): Promise<{ token: string; svg: string }> {
    const code = SystemSecurityService.randomCode(4);
    const token = randomBytes(16).toString('hex');
    this.captchaStore.set(token, { code, expires: Date.now() + CAPTCHA_TTL });
    // 清理过期 token，防止内存膨胀
    if (this.captchaStore.size > 100) {
      for (const [k, v] of this.captchaStore) {
        if (v.expires < Date.now()) this.captchaStore.delete(k);
      }
    }
    return { token, svg: this.buildCaptchaSvg(code) };
  }

  /** 校验验证码（一次性，校验后立即失效） */
  async verifyCaptcha(token: string, code: string): Promise<boolean> {
    if (!token || !code) return false;
    const record = this.captchaStore.get(token);
    if (!record || record.expires < Date.now()) return false;
    this.captchaStore.delete(token);
    return record.code.toLowerCase() === String(code).trim().toLowerCase();
  }

  /** 登录前置校验：IP 限制 + 账号锁定 + 验证码（按需启用） */
  async checkLoginAllowed(username: string, ip: string, captcha?: { token?: string; code?: string }) {
    await this.checkIpRestriction(ip);
    await this.checkLoginLocked(username);

    const captchaEnabled = (await this.getConfig('login_captcha_enabled', 'false')) === 'true';
    if (captchaEnabled) {
      const ok = await this.verifyCaptcha(captcha?.token || '', captcha?.code || '');
      if (!ok) {
        throw new HttpException('验证码错误或已过期', HttpStatus.BAD_REQUEST);
      }
    }
  }

  private static randomCode(len: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符
    let code = '';
    for (let i = 0; i < len; i++) {
      code += chars[randomInt(chars.length)];
    }
    return code;
  }

  /** 生成简单 SVG 验证码图（无第三方依赖） */
  private buildCaptchaSvg(code: string): string {
    const width = 120;
    const height = 40;
    const chars = code.split('').map((ch, i) => {
      const x = 18 + i * 24;
      const y = 24 + randomInt(8);
      const rotate = randomInt(-25, 25);
      const color = `hsl(${randomInt(360)}, 70%, 40%)`;
      return `<text x="${x}" y="${y}" font-size="${22 + randomInt(6)}" font-family="Arial, sans-serif" font-weight="bold" fill="${color}" transform="rotate(${rotate} ${x} ${y})">${ch}</text>`;
    });
    const noise = Array.from({ length: 6 })
      .map(() => {
        const x1 = randomInt(width);
        const y1 = randomInt(height);
        return `<line x1="${x1}" y1="${y1}" x2="${x1 + randomInt(14)}" y2="${y1 + randomInt(14)}" stroke="#999" stroke-width="1"/>`;
      })
      .join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f5f6f8"/>${noise}${chars.join('')}</svg>`;
  }

  // ==================== 敏感操作二次验证 ====================

  /** 校验当前管理员的登录密码（用于敏感操作二次验证） */
  async verifyPassword(adminId: number, password: string): Promise<boolean> {
    if (!adminId || !password) return false;
    const [admin] = await this.dataSource.query<{ id: number; password: string }[]>(
      'SELECT `id`, `password` FROM `sys_admin` WHERE `id` = ?',
      [adminId]
    );
    if (!admin) return false;
    try {
      return await bcrypt.compare(password, admin.password);
    } catch {
      return false;
    }
  }

  /** 查询敏感操作二次验证配置 */
  async getSensitiveOpVerifyConfig() {
    const enabled = (await this.getConfig('sensitive_op_verify_enabled', 'true')) === 'true';
    const timeout = Math.max(0, Number(await this.getConfig('sensitive_op_verify_timeout', '120')) || 120);
    return { enabled, timeout };
  }

  // ==================== 公共 ====================

  /** 供日志系统使用的模块名辅助 */
  getModuleName(): string {
    return 'system-security';
  }
}
