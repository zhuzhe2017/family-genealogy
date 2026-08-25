/** 支持的对象存储服务商 */
export type CloudStorageProvider = 'tencent' | 'aliyun' | 'qiniu';

/** 云存储服务商通用字段 */
export interface CloudStorageProviderConfig {
  enabled: boolean;
  bucket: string;
  region: string;
  domain: string;
  [key: string]: unknown;
}

/** 腾讯云 COS 配置 */
export interface TencentCosConfig extends CloudStorageProviderConfig {
  secretId: string;
  secretKey: string;
  appId: string;
}

/** 阿里云 OSS 配置 */
export interface AliyunOssConfig extends CloudStorageProviderConfig {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
}

/** 七牛云 Kodo 配置 */
export interface QiniuKodoConfig extends CloudStorageProviderConfig {
  accessKey: string;
  secretKey: string;
}

/** 完整云存储配置（后端聚合后返回） */
export interface CloudStorageFullConfig {
  provider: CloudStorageProvider;
  tencent: TencentCosConfig;
  aliyun: AliyunOssConfig;
  qiniu: QiniuKodoConfig;
}

/** 配置变更项（用于日志记录） */
export interface CloudStorageConfigChange {
  provider: CloudStorageProvider;
  field: string;
  oldValue: string;
  newValue: string;
}
