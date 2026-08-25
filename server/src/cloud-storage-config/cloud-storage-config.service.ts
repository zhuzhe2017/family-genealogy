import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync
} from 'crypto';
import type {
  CloudStorageFullConfig,
  CloudStorageProvider,
  CloudStorageConfigChange,
  TencentCosConfig,
  AliyunOssConfig,
  QiniuKodoConfig
} from './types/cloud-storage-config.types';
import { SystemLogService } from '../system-log/system-log.service';

/** 敏感字段集合（存储前加密，返回时脱敏） */
const SENSITIVE_FIELDS: Record<CloudStorageProvider, string[]> = {
  tencent: ['secretKey'],
  aliyun: ['accessKeySecret'],
  qiniu: ['secretKey']
};

/** 配置键映射 */
const CONFIG_KEYS: Record<CloudStorageProvider, string> = {
  tencent: 'cloud_storage_tencent',
  aliyun: 'cloud_storage_aliyun',
  qiniu: 'cloud_storage_qiniu'
};

const ACTIVE_PROVIDER_KEY = 'cloud_storage_provider';
const CONFIG_GROUP = 'cloud_storage';

/** 默认配置 */
const DEFAULT_PROVIDER: CloudStorageProvider = 'tencent';
const DEFAULT_CONFIGS: CloudStorageFullConfig = {
  provider: DEFAULT_PROVIDER,
  tencent: {
    enabled: false,
    secretId: '',
    secretKey: '',
    bucket: '',
    region: '',
    appId: '',
    domain: ''
  },
  aliyun: {
    enabled: false,
    accessKeyId: '',
    accessKeySecret: '',
    bucket: '',
    region: '',
    endpoint: '',
    domain: ''
  },
  qiniu: {
    enabled: false,
    accessKey: '',
    secretKey: '',
    bucket: '',
    region: '',
    domain: ''
  }
};

@Injectable()
export class CloudStorageConfigService {
  /** 缓存加解密密钥（避免每次派生） */
  private encryptionKey: Buffer | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly systemLogService: SystemLogService,
    private readonly configService: ConfigService
  ) {}

  /** 获取 AES-256-GCM 加密密钥（从环境变量派生） */
  private getEncryptionKey(): Buffer {
    if (this.encryptionKey) return this.encryptionKey;
    const secret = this.configService.get<string>('CLOUD_STORAGE_ENCRYPT_SECRET');
    if (!secret || secret.length < 16) {
      throw new HttpException(
        '服务器未配置安全的云存储加密密钥(CLOUD_STORAGE_ENCRYPT_SECRET)，无法保存敏感配置',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
    this.encryptionKey = scryptSync(secret, 'cloud-storage-salt', 32);
    return this.encryptionKey;
  }

  /** AES-256-GCM 加密 */
  private encrypt(plaintext: string): string {
    const key = this.getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // 存储格式：base64(iv:authTag:ciphertext)
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  /** AES-256-GCM 解密 */
  private decrypt(ciphertext: string): string {
    const key = this.getEncryptionKey();
    const buf = Buffer.from(ciphertext, 'base64');
    if (buf.length < 29) throw new Error('密文格式不正确');
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  /** 读取配置项原始 JSON 字符串 */
  private async getRawConfig(key: string): Promise<string | null> {
    const [row] = await this.dataSource.query<{ config_value: string | null }[]>(
      'SELECT `config_value` FROM `sys_config` WHERE `config_key` = ? AND `status` = 1',
      [key]
    );
    return row?.config_value ?? null;
  }

  /** 保存/更新配置项原始 JSON 字符串 */
  private async setRawConfig(
    key: string,
    name: string,
    value: string,
    operator?: string,
    sortOrder = 0
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO \`sys_config\` (\`config_key\`, \`config_name\`, \`config_value\`, \`value_type\`, \`group\`, \`remark\`, \`sort_order\`, \`is_system\`, \`operator\`)
       VALUES (?, ?, ?, 'json', ?, '', ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         \`config_value\` = VALUES(\`config_value\`),
         \`config_name\` = VALUES(\`config_name\`),
         \`operator\` = VALUES(\`operator\`),
         \`update_time\` = CURRENT_TIMESTAMP`,
      [key, name, value, CONFIG_GROUP, sortOrder, operator || '']
    );
  }

  /** 解密单个服务商配置 */
  private decryptProviderConfig(
    provider: CloudStorageProvider,
    encryptedConfig: Partial<CloudStorageFullConfig[CloudStorageProvider]>
  ): CloudStorageFullConfig[CloudStorageProvider] {
    const defaults = DEFAULT_CONFIGS[provider];
    const sensitive = SENSITIVE_FIELDS[provider];
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(defaults)) {
      const value = (encryptedConfig as Record<string, unknown>)[key];
      if (value === undefined || value === null || value === '') {
        result[key] = defaults[key as keyof typeof defaults];
      } else if (sensitive.includes(key)) {
        try {
          result[key] = this.decrypt(String(value));
        } catch {
          // 兼容旧明文数据或异常数据，直接保留原字符串，避免完全丢失
          result[key] = String(value);
        }
      } else {
        result[key] = value;
      }
    }
    return result as CloudStorageFullConfig[CloudStorageProvider];
  }

  /** 加密单个服务商配置 */
  private encryptProviderConfig(
    provider: CloudStorageProvider,
    config: Partial<CloudStorageFullConfig[CloudStorageProvider]>
  ): Record<string, unknown> {
    const sensitive = SENSITIVE_FIELDS[provider];
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(config)) {
      const value = (config as Record<string, unknown>)[key];
      if (sensitive.includes(key) && typeof value === 'string' && value.length > 0) {
        result[key] = this.encrypt(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /** 对敏感字段进行脱敏 */
  private maskSensitive(provider: CloudStorageProvider, config: Record<string, unknown>): Record<string, unknown> {
    const sensitive = SENSITIVE_FIELDS[provider];
    const masked: Record<string, unknown> = { ...config };
    for (const key of sensitive) {
      const value = String(masked[key] || '');
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

  /** 获取完整配置（返回时敏感字段脱敏） */
  async getConfig(): Promise<CloudStorageFullConfig> {
    const provider = ((await this.getRawConfig(ACTIVE_PROVIDER_KEY)) as CloudStorageProvider) || DEFAULT_CONFIGS.provider;
    const result: CloudStorageFullConfig = {
      provider,
      tencent: DEFAULT_CONFIGS.tencent,
      aliyun: DEFAULT_CONFIGS.aliyun,
      qiniu: DEFAULT_CONFIGS.qiniu
    };

    for (const p of Object.keys(CONFIG_KEYS) as CloudStorageProvider[]) {
      const raw = await this.getRawConfig(CONFIG_KEYS[p]);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<CloudStorageFullConfig[CloudStorageProvider]>;
          this.setProviderConfig(result, p, this.maskSensitive(p, this.decryptProviderConfig(p, parsed) as Record<string, unknown>));
        } catch {
          this.setProviderConfig(result, p, DEFAULT_CONFIGS[p] as Record<string, unknown>);
        }
      }
    }

    return result;
  }

  /** 将脱敏后的配置写回完整配置（按服务商类型安全赋值） */
  private setProviderConfig(
    result: CloudStorageFullConfig,
    provider: CloudStorageProvider,
    config: Record<string, unknown>
  ): void {
    switch (provider) {
      case 'tencent':
        result.tencent = config as TencentCosConfig;
        break;
      case 'aliyun':
        result.aliyun = config as AliyunOssConfig;
        break;
      case 'qiniu':
        result.qiniu = config as QiniuKodoConfig;
        break;
    }
  }

  /** 获取当前生效配置（用于后端上传服务，返回解密后的真实值） */
  async getActiveConfig(): Promise<{ provider: CloudStorageProvider; config: Record<string, unknown> } | null> {
    const provider = ((await this.getRawConfig(ACTIVE_PROVIDER_KEY)) as CloudStorageProvider) || DEFAULT_CONFIGS.provider;
    const raw = await this.getRawConfig(CONFIG_KEYS[provider]);
    if (!raw) return null;

    let parsed: Partial<CloudStorageFullConfig[CloudStorageProvider]> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const config = this.decryptProviderConfig(provider, parsed) as Record<string, unknown>;
    if (!config.enabled) return null;
    return { provider, config };
  }

  /** 计算配置变更 */
  private diffChanges(
    provider: CloudStorageProvider,
    oldConfig: Record<string, unknown>,
    newConfig: Record<string, unknown>
  ): CloudStorageConfigChange[] {
    const changes: CloudStorageConfigChange[] = [];
    const keys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);
    const sensitive = SENSITIVE_FIELDS[provider];
    for (const key of keys) {
      const oldVal = oldConfig[key];
      const newVal = newConfig[key];
      if (String(oldVal || '') !== String(newVal || '')) {
        const maskValue = (value: unknown) => {
          const str = String(value || '');
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
    config: CloudStorageFullConfig,
    operator?: string,
    req?: { ip?: string; userAgent?: string; adminId?: number }
  ): Promise<{ success: boolean }> {
    const providers: CloudStorageProvider[] = ['tencent', 'aliyun', 'qiniu'];
    const oldFull = await this.getConfig();
    const changes: CloudStorageConfigChange[] = [];

    await this.dataSource.transaction(async manager => {
      // 验证并保存各服务商配置
      for (const p of providers) {
        const providerConfig = config[p];
        this.validateProviderConfig(p, providerConfig);
        const encrypted = this.encryptProviderConfig(p, providerConfig);
        const oldEncrypted = await this.getRawConfig(CONFIG_KEYS[p]);
        let oldDecrypted: Record<string, unknown> = {};
        if (oldEncrypted) {
          try {
            oldDecrypted = this.decryptProviderConfig(
              p,
              JSON.parse(oldEncrypted) as Partial<CloudStorageFullConfig[CloudStorageProvider]>
            ) as Record<string, unknown>;
          } catch {
            oldDecrypted = {};
          }
        }
        changes.push(...this.diffChanges(p, oldDecrypted, providerConfig as Record<string, unknown>));

        await manager.query(
          `INSERT INTO \`sys_config\` (\`config_key\`, \`config_name\`, \`config_value\`, \`value_type\`, \`group\`, \`remark\`, \`sort_order\`, \`is_system\`, \`operator\`)
           VALUES (?, ?, ?, 'json', ?, '', ?, 1, ?)
           ON DUPLICATE KEY UPDATE
             \`config_value\` = VALUES(\`config_value\`),
             \`config_name\` = VALUES(\`config_name\`),
             \`operator\` = VALUES(\`operator\`),
             \`update_time\` = CURRENT_TIMESTAMP`,
          [
            CONFIG_KEYS[p],
            this.getProviderName(p),
            JSON.stringify(encrypted),
            CONFIG_GROUP,
            providers.indexOf(p) + 1,
            operator || ''
          ]
        );
      }

      // 保存当前启用服务商
      if (!providers.includes(config.provider)) {
        throw new HttpException('无效的云存储服务商', HttpStatus.BAD_REQUEST);
      }
      await manager.query(
        `INSERT INTO \`sys_config\` (\`config_key\`, \`config_name\`, \`config_value\`, \`value_type\`, \`group\`, \`remark\`, \`sort_order\`, \`is_system\`, \`operator\`)
         VALUES (?, ?, ?, 'string', ?, '当前启用的云存储服务商', 0, 1, ?)
         ON DUPLICATE KEY UPDATE
           \`config_value\` = VALUES(\`config_value\`),
           \`operator\` = VALUES(\`operator\`),
           \`update_time\` = CURRENT_TIMESTAMP`,
        [ACTIVE_PROVIDER_KEY, '当前云存储服务商', config.provider, CONFIG_GROUP, operator || '']
      );
    });

    // 记录操作日志
    if (changes.length > 0) {
      this.systemLogService.writeAsync({
        logType: 'operation',
        module: 'cloud-storage-config',
        action: '编辑云存储配置',
        method: 'POST',
        path: '/api/cloud-storage-config/save',
        operator: operator || 'anonymous',
        operatorId: req?.adminId ?? null,
        ip: req?.ip || '',
        userAgent: req?.userAgent || '',
        status: 200,
        success: true,
        detail: JSON.stringify({
          provider: config.provider,
          changes,
          previousProvider: oldFull.provider
        })
      });
    }

    return { success: true };
  }

  /** 验证单个服务商配置 */
  private validateProviderConfig(
    provider: CloudStorageProvider,
    config: Partial<CloudStorageFullConfig[CloudStorageProvider]>
  ): void {
    const record = config as Record<string, unknown>;
    const requiredFields: Record<CloudStorageProvider, string[]> = {
      tencent: ['secretId', 'secretKey', 'bucket', 'region'],
      aliyun: ['accessKeyId', 'accessKeySecret', 'bucket', 'region'],
      qiniu: ['accessKey', 'secretKey', 'bucket']
    };

    if (record.enabled === true) {
      for (const field of requiredFields[provider]) {
        if (!record[field] || String(record[field]).trim() === '') {
          throw new HttpException(
            `${this.getProviderName(provider)} 启用时 ${field} 不能为空`,
            HttpStatus.BAD_REQUEST
          );
        }
      }
    }

    // 基础格式校验
    if (record.bucket && String(record.bucket).length > 63) {
      throw new HttpException(`${this.getProviderName(provider)} 存储桶名称长度不能超过 63 字符`, HttpStatus.BAD_REQUEST);
    }
    if (record.region && String(record.region).length > 50) {
      throw new HttpException(`${this.getProviderName(provider)} 地域长度不能超过 50 字符`, HttpStatus.BAD_REQUEST);
    }
    if (record.domain && String(record.domain).length > 200) {
      throw new HttpException(`${this.getProviderName(provider)} 域名长度不能超过 200 字符`, HttpStatus.BAD_REQUEST);
    }
  }

  private getProviderName(provider: CloudStorageProvider): string {
    const map: Record<CloudStorageProvider, string> = {
      tencent: '腾讯云COS配置',
      aliyun: '阿里云OSS配置',
      qiniu: '七牛云Kodo配置'
    };
    return map[provider];
  }
}
