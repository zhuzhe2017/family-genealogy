import { Injectable, Logger } from '@nestjs/common';
import COS from 'cos-nodejs-sdk-v5';
import { CloudStorageConfigService } from './cloud-storage-config.service';
import type {
  CloudStorageProvider,
  TencentCosConfig
} from './types/cloud-storage-config.types';
import { buildStoredFileName } from '../common/upload/upload.service';

/** 云存储上传结果 */
export interface CloudUploadResult {
  /** 可公开访问的 URL（http/https 完整地址） */
  url: string;
  /** 对象键（文件名） */
  filename: string;
}

/**
 * 云存储上传服务：读取当前启用的服务商配置，将图片上传到云存储。
 * 当前仅接入腾讯云 COS（阿里云 OSS / 七牛 Kodo 后续接入）。
 * 未启用云存储或上传失败时返回 null，由调用方回退本地磁盘存储。
 */
@Injectable()
export class CloudStorageUploadService {
  private readonly logger = new Logger(CloudStorageUploadService.name);

  constructor(private readonly configService: CloudStorageConfigService) {}

  /**
   * 上传图片到当前启用的云存储服务商。
   * @returns 上传成功返回 { url, filename }；未启用云存储、服务商未接入或上传失败返回 null
   */
  async uploadImage(buffer: Buffer, mimetype: string): Promise<CloudUploadResult | null> {
    let active: { provider: CloudStorageProvider; config: Record<string, unknown> } | null;
    try {
      active = await this.configService.getActiveConfig();
    } catch (error) {
      this.logger.warn(`读取云存储配置失败: ${(error as Error).message}，回退本地存储`);
      return null;
    }
    if (!active) return null;

    if (active.provider !== 'tencent') {
      this.logger.warn(`云存储服务商(${active.provider})暂未接入，回退本地存储`);
      return null;
    }

    const filename = buildStoredFileName(mimetype);
    try {
      const url = await this.uploadToTencent(active.config as TencentCosConfig, filename, buffer, mimetype);
      this.logger.log(`云存储上传成功(tencent): ${filename}`);
      return { url, filename };
    } catch (error) {
      this.logger.warn(`云存储上传失败(tencent): ${(error as Error).message}，回退本地存储`);
      return null;
    }
  }

  /** 腾讯云 COS 上传 */
  private async uploadToTencent(
    config: TencentCosConfig,
    key: string,
    buffer: Buffer,
    contentType: string
  ): Promise<string> {
    const bucketName = String(config.bucket || '').trim();
    const appId = String(config.appId || '').trim();
    // COS 存储桶完整名称为 {名称}-{APPID}，兼容用户直接填完整桶名的情况
    const bucket = appId && !bucketName.endsWith(`-${appId}`) ? `${bucketName}-${appId}` : bucketName;
    const region = String(config.region || '').trim();

    const cos = new COS({ SecretId: config.secretId, SecretKey: config.secretKey });
    await new Promise<void>((resolve, reject) => {
      cos.putObject(
        { Bucket: bucket, Region: region, Key: key, Body: buffer, ContentType: contentType },
        err => {
          if (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          } else {
            resolve();
          }
        }
      );
    });
    return this.buildPublicUrl(config.domain, `https://${bucket}.cos.${region}.myqcloud.com`, key);
  }

  /** 拼接公开访问 URL：优先使用自定义 CDN 域名，否则用默认域名 */
  private buildPublicUrl(domain: string, fallbackBase: string, key: string): string {
    const host =
      String(domain || '')
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '') ||
      fallbackBase
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '');
    return `https://${host}/${key}`;
  }
}
