import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type DataRow, type QueryValues } from '../common/types/common';

export type ConsentDocType = 'privacy' | 'agreement' | 'member_notice';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/**
 * 用户同意记录服务（隐私政策/用户协议/成员信息告知 的告知-同意留存）
 * 满足《个人信息保护法》告知-同意与撤回留痕要求
 * doc_type + doc_version 唯一约束：同一用户同一版本仅记录一次，重复上报幂等
 */
@Injectable()
export class ConsentService {
  constructor(private readonly dataSource: DataSource) {}

  /** 记录一次同意/拒绝 */
  async record(userId: string, docType: ConsentDocType, docVersion: string, consent: boolean, meta?: RequestMeta) {
    // ON DUPLICATE KEY UPDATE：同一版本重复上报时更新时间戳与上下文，不产生重复记录
    await this.dataSource.query(
      `INSERT INTO \`user_consent\` (\`user_id\`, \`doc_type\`, \`doc_version\`, \`consent\`, \`ip\`, \`user_agent\`)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE \`consent\` = VALUES(\`consent\`), \`ip\` = VALUES(\`ip\`), \`user_agent\` = VALUES(\`user_agent\`)`,
      [userId, docType, docVersion, consent ? 1 : 0, meta?.ip || '', meta?.userAgent || ''] as QueryValues
    );
    return { success: true };
  }

  /** 查询某用户已同意的文档版本（小程序端启动时判断是否需要弹窗） */
  async list(userId: string) {
    const rows = await this.dataSource.query<DataRow[]>(
      'SELECT `doc_type`, `doc_version`, `consent`, `create_time` FROM `user_consent` WHERE `user_id` = ? ORDER BY `id` DESC',
      [userId] as QueryValues
    );
    return rows.map((r) => ({
      docType: typeof r.doc_type === 'string' ? r.doc_type : '',
      docVersion: typeof r.doc_version === 'string' ? r.doc_version : '',
      consent: Number(r.consent) === 1,
      createTime: r.create_time
    }));
  }

  /** 当前生效的隐私政策/用户协议版本（与小程序端 consentVersion 常量保持一致） */
  currentVersion(): string {
    return 'v1.0';
  }
}
