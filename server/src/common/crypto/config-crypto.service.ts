import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * 系统敏感配置（云存储/支付等）公共加解密服务。
 * 复用 CLOUD_STORAGE_ENCRYPT_SECRET 环境变量派生 AES-256-GCM 密钥（salt 'cloud-storage-salt'），
 * 密文格式 base64(iv[12]:authTag[16]:ct)，与存量密文完全兼容。
 */
@Injectable()
export class ConfigCryptoService {
  /** 缓存加解密密钥（避免每次派生） */
  private encryptionKey: Buffer | null = null;

  constructor(private readonly configService: ConfigService) {}

  /** 获取 AES-256-GCM 加密密钥（从环境变量派生） */
  getEncryptionKey(): Buffer {
    if (this.encryptionKey) return this.encryptionKey;
    const secret = this.configService.get<string>('CLOUD_STORAGE_ENCRYPT_SECRET');
    if (!secret || secret.length < 16) {
      throw new HttpException(
        '服务器未配置安全的配置加密密钥(CLOUD_STORAGE_ENCRYPT_SECRET)，无法保存敏感配置',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
    this.encryptionKey = scryptSync(secret, 'cloud-storage-salt', 32);
    return this.encryptionKey;
  }

  /** AES-256-GCM 加密 */
  encrypt(plaintext: string): string {
    const key = this.getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // 存储格式：base64(iv:authTag:ciphertext)
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  /** AES-256-GCM 解密 */
  decrypt(ciphertext: string): string {
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
}
