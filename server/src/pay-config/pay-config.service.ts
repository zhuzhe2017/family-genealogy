import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createSign, randomBytes } from 'crypto';
import type {
  PayProvider,
  WxPayConfig,
  AlipayConfig,
  PayFullConfig,
  PayConfigChange,
  PayTestResult
} from './types/pay-config.types';
import { SystemLogService } from '../system-log/system-log.service';
import { ConfigCryptoService } from '../common/crypto/config-crypto.service';

/** 将 unknown 值安全转换为字符串（null/undefined → ''，字符串原样返回，其余 JSON 序列化） */
function toStr(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return JSON.stringify(value) ?? '';
}

/** 微信支付 API v3 基础地址 */
const WXPAY_BASE = 'https://api.mch.weixin.qq.com';

/** 敏感字段集合（存储前加密，返回时脱敏） */
const SENSITIVE_FIELDS: Record<PayProvider, string[]> = {
  wxpay: ['privateKey', 'apiV3Key', 'platformPublicKey'],
  alipay: ['privateKey', 'alipayPublicKey']
};

/** 配置键映射 */
const CONFIG_KEYS: Record<PayProvider, string> = {
  wxpay: 'pay_wxpay',
  alipay: 'pay_alipay'
};

const ACTIVE_PROVIDER_KEY = 'pay_provider';
const CONFIG_GROUP = 'pay';

/** 默认配置 */
const DEFAULT_PROVIDER: PayProvider = 'wxpay';
const DEFAULT_CONFIGS: PayFullConfig = {
  provider: DEFAULT_PROVIDER,
  wxpay: {
    enabled: false,
    appId: '',
    mchId: '',
    mchSerialNo: '',
    privateKey: '',
    apiV3Key: '',
    notifyUrl: '',
    platformPublicKey: '',
    statusNotifyUrl: ''
  },
  alipay: {
    enabled: false,
    appId: '',
    privateKey: '',
    alipayPublicKey: '',
    notifyUrl: '',
    statusNotifyUrl: ''
  }
};

@Injectable()
export class PayConfigService {
  private readonly logger = new Logger(PayConfigService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly systemLogService: SystemLogService,
    private readonly configCrypto: ConfigCryptoService
  ) {}

  /** 读取配置项原始 JSON 字符串 */
  private async getRawConfig(key: string): Promise<string | null> {
    const [row] = await this.dataSource.query<{ config_value: string | null }[]>(
      'SELECT `config_value` FROM `sys_config` WHERE `config_key` = ? AND `status` = 1',
      [key]
    );
    return row?.config_value ?? null;
  }

  /** 解密单个服务商配置 */
  private decryptProviderConfig<T extends Record<string, unknown>>(
    provider: PayProvider,
    encryptedConfig: Partial<T>
  ): T {
    const defaults = DEFAULT_CONFIGS[provider] as unknown as Record<string, unknown>;
    const sensitive = SENSITIVE_FIELDS[provider];
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(defaults)) {
      const value = (encryptedConfig as Record<string, unknown>)[key];
      if (value === undefined || value === null || value === '') {
        result[key] = defaults[key];
      } else if (sensitive.includes(key)) {
        try {
          result[key] = this.configCrypto.decrypt(toStr(value));
        } catch {
          // 兼容旧明文数据或异常数据，直接保留原字符串，避免完全丢失
          result[key] = toStr(value);
        }
      } else {
        result[key] = value;
      }
    }
    return result as unknown as T;
  }

  /** 加密单个服务商配置（掩码值表示未修改，跳过不加密） */
  private encryptProviderConfig<T extends Record<string, unknown>>(
    provider: PayProvider,
    config: Partial<T>
  ): Record<string, unknown> {
    const sensitive = SENSITIVE_FIELDS[provider];
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(config)) {
      const value = (config as Record<string, unknown>)[key];
      if (sensitive.includes(key) && typeof value === 'string' && value.length > 0 && !this.isMasked(value)) {
        result[key] = this.configCrypto.encrypt(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /** 对敏感字段进行脱敏 */
  private maskSensitive(provider: PayProvider, config: Record<string, unknown>): Record<string, unknown> {
    const sensitive = SENSITIVE_FIELDS[provider];
    const masked: Record<string, unknown> = { ...config };
    for (const key of sensitive) {
      const value = toStr(masked[key]);
      if (value.length === 0) {
        masked[key] = '';
      } else if (value.length <= 4) {
        masked[key] = '*'.repeat(value.length);
      } else {
        masked[key] = value.slice(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2);
      }
    }
    return masked;
  }

  /** 判断值是否为掩码串（含 *** 即为掩码，表示用户未修改） */
  private isMasked(value: string): boolean {
    return typeof value === 'string' && value.includes('*');
  }

  /** 获取完整配置（返回时敏感字段脱敏） */
  async getConfig(): Promise<PayFullConfig> {
    const provider = ((await this.getRawConfig(ACTIVE_PROVIDER_KEY)) as PayProvider) || DEFAULT_PROVIDER;
    const result: PayFullConfig = {
      provider,
      wxpay: { ...DEFAULT_CONFIGS.wxpay },
      alipay: { ...DEFAULT_CONFIGS.alipay }
    };

    for (const p of Object.keys(CONFIG_KEYS) as PayProvider[]) {
      const raw = await this.getRawConfig(CONFIG_KEYS[p]);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const decrypted = this.decryptProviderConfig(p, parsed);
          const masked = this.maskSensitive(p, decrypted);
          if (p === 'wxpay') {
            result.wxpay = masked as unknown as WxPayConfig;
          } else {
            result.alipay = masked as unknown as AlipayConfig;
          }
        } catch {
          // 解析失败保留默认值
        }
      }
    }

    return result;
  }

  /** 获取当前生效的微信支付配置（解密后的真实值，供 WxPayService 使用） */
  async getActiveWxPayConfig(): Promise<WxPayConfig | null> {
    const raw = await this.getRawConfig(CONFIG_KEYS.wxpay);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const config = this.decryptProviderConfig('wxpay', parsed);
      if (!config.enabled) return null;
      return config as unknown as WxPayConfig;
    } catch {
      return null;
    }
  }

  /** 计算配置变更 */
  private diffChanges(
    provider: PayProvider,
    oldConfig: Record<string, unknown>,
    newConfig: Record<string, unknown>
  ): PayConfigChange[] {
    const changes: PayConfigChange[] = [];
    const keys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);
    const sensitive = SENSITIVE_FIELDS[provider];
    for (const key of keys) {
      const oldVal = oldConfig[key];
      const newVal = newConfig[key];
      if (toStr(oldVal) !== toStr(newVal)) {
        const maskValue = (value: unknown) => {
          const str = toStr(value);
          if (!str || !sensitive.includes(key)) return str;
          if (str.length <= 4) return '*'.repeat(str.length);
          return `${str.slice(0, 2)}***${str.slice(-2)}`;
        };
        changes.push({
          provider,
          field: key,
          oldValue: maskValue(oldVal),
          newValue: maskValue(newVal)
        });
      }
    }
    return changes;
  }

  /** 保存完整配置 */
  async saveConfig(
    config: PayFullConfig,
    operator?: string,
    req?: { ip?: string; userAgent?: string; adminId?: number }
  ): Promise<{ success: boolean }> {
    const providers: PayProvider[] = ['wxpay', 'alipay'];
    const changes: PayConfigChange[] = [];

    await this.dataSource.transaction(async manager => {
      for (const p of providers) {
        const providerConfig = config[p] as unknown as Record<string, unknown>;
        this.validateProviderConfig(p, providerConfig);

        // 读取旧配置（解密后）用于 diff
        const oldEncrypted = await this.getRawConfig(CONFIG_KEYS[p]);
        let oldDecrypted: Record<string, unknown> = {};
        if (oldEncrypted) {
          try {
            oldDecrypted = this.decryptProviderConfig(
              p,
              JSON.parse(oldEncrypted) as Record<string, unknown>
            );
          } catch {
            oldDecrypted = {};
          }
        }

        // 处理掩码语义：敏感字段若仍是掩码串，保留库中原值
        const mergedConfig: Record<string, unknown> = { ...providerConfig };
        const sensitive = SENSITIVE_FIELDS[p];
        for (const key of sensitive) {
          const value = toStr(mergedConfig[key]);
          if (this.isMasked(value)) {
            mergedConfig[key] = oldDecrypted[key] || '';
          }
        }
        changes.push(...this.diffChanges(p, oldDecrypted, mergedConfig));

        const encrypted = this.encryptProviderConfig(p, mergedConfig);
        await manager.query(
          `INSERT INTO \`sys_config\` (\`config_key\`, \`config_name\`, \`config_value\`, \`value_type\`, \`group\`, \`remark\`, \`sort_order\`, \`is_system\`, \`operator\`)
           VALUES (?, ?, ?, 'json', ?, '', ?, 1, ?)
           ON DUPLICATE KEY UPDATE
             \`config_value\` = VALUES(\`config_value\`),
             \`config_name\` = VALUES(\`config_name\`),
             \`operator\` = VALUES(\`operator\`),
             \`update_time\` = CURRENT_TIMESTAMP`,
          [CONFIG_KEYS[p], this.getProviderName(p), JSON.stringify(encrypted), CONFIG_GROUP, providers.indexOf(p) + 1, operator || '']
        );
      }

      // 保存当前启用的支付服务商
      if (!providers.includes(config.provider)) {
        throw new HttpException('无效的支付服务商', HttpStatus.BAD_REQUEST);
      }
      await manager.query(
        `INSERT INTO \`sys_config\` (\`config_key\`, \`config_name\`, \`config_value\`, \`value_type\`, \`group\`, \`remark\`, \`sort_order\`, \`is_system\`, \`operator\`)
         VALUES (?, ?, ?, 'string', ?, '当前启用的支付服务商', 0, 1, ?)
         ON DUPLICATE KEY UPDATE
           \`config_value\` = VALUES(\`config_value\`),
           \`operator\` = VALUES(\`operator\`),
           \`update_time\` = CURRENT_TIMESTAMP`,
        [ACTIVE_PROVIDER_KEY, '当前支付服务商', config.provider, CONFIG_GROUP, operator || '']
      );
    });

    // 记录操作日志
    if (changes.length > 0) {
      this.systemLogService.writeAsync({
        logType: 'operation',
        module: 'pay-config',
        action: '编辑支付配置',
        method: 'POST',
        path: '/api/pay-config/save',
        operator: operator || 'anonymous',
        operatorId: req?.adminId ?? null,
        ip: req?.ip || '',
        userAgent: req?.userAgent || '',
        status: 200,
        success: true,
        detail: JSON.stringify({
          provider: config.provider,
          changes
        })
      });
    }

    return { success: true };
  }

  /** 测试支付连通性 */
  async testConnection(
    provider: PayProvider,
    operator?: string,
    req?: { ip?: string; userAgent?: string; adminId?: number }
  ): Promise<PayTestResult> {
    const checkedAt = new Date().toISOString();
    let result: PayTestResult;

    if (provider === 'wxpay') {
      result = await this.testWxPayConnection();
    } else if (provider === 'alipay') {
      result = await this.testAlipayConnection();
    } else {
      result = { success: false, message: '无效的支付服务商', checkedAt };
    }

    // 记录测试操作日志
    this.systemLogService.writeAsync({
      logType: 'operation',
      module: 'pay-config',
      action: '测试支付连通性',
      method: 'POST',
      path: '/api/pay-config/test',
      operator: operator || 'anonymous',
      operatorId: req?.adminId ?? null,
      ip: req?.ip || '',
      userAgent: req?.userAgent || '',
      status: 200,
      success: result.success,
      detail: JSON.stringify({ provider, message: result.message, checkedAt })
    });

    return result;
  }

  /** 微信支付连通性测试：调 v3 证书接口 */
  private async testWxPayConnection(): Promise<PayTestResult> {
    const config = await this.getActiveWxPayConfig();
    if (!config || !config.enabled) {
      return {
        success: false,
        message: '微信支付未启用或未配置，请先保存并启用微信支付配置',
        checkedAt: new Date().toISOString()
      };
    }

    const missing: string[] = [];
    if (!config.appId) missing.push('AppId');
    if (!config.mchId) missing.push('商户号');
    if (!config.mchSerialNo) missing.push('证书序列号');
    if (!config.privateKey) missing.push('API 私钥');
    if (!config.apiV3Key) missing.push('API v3 密钥');
    if (missing.length > 0) {
      return {
        success: false,
        message: `微信支付配置不完整，缺少：${missing.join('、')}`,
        checkedAt: new Date().toISOString()
      };
    }

    try {
      // 用商户私钥对 GET /v3/certificates 做签名请求
      const timestamp = String(Math.floor(Date.now() / 1000));
      const nonce = randomBytes(16).toString('hex');
      const message = `GET\n/v3/certificates\n${timestamp}\n${nonce}\n\n`;
      const signer = createSign('RSA-SHA256');
      signer.update(message);
      signer.end();
      const signature = signer.sign(config.privateKey, 'base64');

      const authorization =
        `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",` +
        `nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.mchSerialNo}"`;

      const resp = await fetch(`${WXPAY_BASE}/v3/certificates`, {
        method: 'GET',
        headers: {
          Authorization: authorization,
          Accept: 'application/json',
          'User-Agent': 'family-genealogy-pay-config-test'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (resp.status === 200) {
        return {
          success: true,
          message: '微信支付连通正常：证书接口返回 200，商户签名与网络均可用',
          checkedAt: new Date().toISOString()
        };
      }
      if (resp.status === 401) {
        const text = await resp.text();
        this.logger.warn(`微信支付证书接口返回 401: ${text}`);
        return {
          success: false,
          message: `微信支付接口返回 401（签名或商户号未被接受），请检查商户号、证书序列号和私钥是否匹配`,
          checkedAt: new Date().toISOString()
        };
      }
      const text = await resp.text();
      this.logger.warn(`微信支付证书接口返回 ${resp.status}: ${text}`);
      return {
        success: false,
        message: `微信支付接口返回 ${resp.status}，请稍后重试或检查商户配置`,
        checkedAt: new Date().toISOString()
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`微信支付连通性测试异常: ${msg}`);
      return {
        success: false,
        message: `微信支付连通性测试失败：${msg}`,
        checkedAt: new Date().toISOString()
      };
    }
  }

  /** 支付宝连通性测试：校验配置完整性与格式 */
  private async testAlipayConnection(): Promise<PayTestResult> {
    const raw = await this.getRawConfig(CONFIG_KEYS.alipay);
    if (!raw) {
      return {
        success: false,
        message: '支付宝未配置，请先保存支付宝配置',
        checkedAt: new Date().toISOString()
      };
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { success: false, message: '支付宝配置格式异常', checkedAt: new Date().toISOString() };
    }

    const config = this.decryptProviderConfig('alipay', parsed) as unknown as AlipayConfig;
    if (!config.enabled) {
      return {
        success: false,
        message: '支付宝未启用，请先启用支付宝配置',
        checkedAt: new Date().toISOString()
      };
    }

    const missing: string[] = [];
    if (!config.appId) missing.push('AppId');
    if (!config.privateKey) missing.push('应用私钥');
    if (!config.alipayPublicKey) missing.push('支付宝公钥');
    if (missing.length > 0) {
      return {
        success: false,
        message: `支付宝配置不完整，缺少：${missing.join('、')}`,
        checkedAt: new Date().toISOString()
      };
    }

    // 基础格式校验
    if (!/^[a-zA-Z0-9]+$/.test(config.appId)) {
      return {
        success: false,
        message: '支付宝 AppId 格式不正确（应为纯字母数字）',
        checkedAt: new Date().toISOString()
      };
    }

    return {
      success: true,
      message: '支付宝配置校验通过：AppId、应用私钥、支付宝公钥均已配置且格式正确',
      checkedAt: new Date().toISOString()
    };
  }

  /** 验证单个服务商配置 */
  private validateProviderConfig(provider: PayProvider, config: Record<string, unknown>): void {
    const requiredFields: Record<PayProvider, string[]> = {
      wxpay: ['appId', 'mchId', 'mchSerialNo', 'privateKey', 'apiV3Key', 'notifyUrl'],
      alipay: ['appId', 'privateKey', 'alipayPublicKey', 'notifyUrl']
    };

    if (config.enabled === true) {
      for (const field of requiredFields[provider]) {
        const value = toStr(config[field]).trim();
        if (value === '') {
          throw new HttpException(
            `${this.getProviderName(provider)} 启用时 ${field} 不能为空`,
            HttpStatus.BAD_REQUEST
          );
        }
      }
      // 生产环境回调 URL 强制 https
      const notifyUrl = toStr(config.notifyUrl);
      if (notifyUrl && !notifyUrl.startsWith('https://') && process.env.NODE_ENV === 'production') {
        throw new HttpException(
          `${this.getProviderName(provider)} 回调通知 URL 在生产环境必须使用 https`,
          HttpStatus.BAD_REQUEST
        );
      }
    }

    // 基础长度校验
    if (config.appId && toStr(config.appId).length > 64) {
      throw new HttpException(`${this.getProviderName(provider)} AppId 长度不能超过 64 字符`, HttpStatus.BAD_REQUEST);
    }
    if (config.mchId && toStr(config.mchId).length > 32) {
      throw new HttpException(`${this.getProviderName(provider)} 商户号长度不能超过 32 字符`, HttpStatus.BAD_REQUEST);
    }
    if (config.notifyUrl && toStr(config.notifyUrl).length > 300) {
      throw new HttpException(`${this.getProviderName(provider)} 回调通知 URL 长度不能超过 300 字符`, HttpStatus.BAD_REQUEST);
    }
  }

  private getProviderName(provider: PayProvider): string {
    const map: Record<PayProvider, string> = {
      wxpay: '微信支付配置',
      alipay: '支付宝配置'
    };
    return map[provider];
  }
}
