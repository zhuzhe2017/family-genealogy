import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type SysConfigRow,
  type SysConfigItem,
  type SysConfigQueryParams,
  type SysConfigUpdateData,
  type SysConfigSaveItem
} from './types/system-config.types';
import { type QueryValues } from '../common/types/common';
import { SystemSecurityService } from '../system-security/system-security.service';

/** 内置配置默认值（用于恢复默认） */
const DEFAULT_VALUES: Record<string, string> = {
  system_name: '数字家谱管理系统',
  system_logo: '',
  default_language: 'zh-CN',
  timezone: 'Asia/Shanghai',
  copyright: '数字家谱 © 2026',
  password_min_length: '6',
  password_require_upper: 'false',
  password_require_lower: 'false',
  password_require_number: 'false',
  password_require_special: 'false',
  password_expire_days: '0',
  login_max_attempts: '5',
  login_lockout_minutes: '15',
  login_captcha_enabled: 'false',
  login_token_expire_days: '7',
  ip_restriction_enabled: 'false',
  ip_restriction_mode: 'blacklist',
  ip_blacklist: '[]',
  ip_whitelist: '[]',
  sensitive_op_verify_enabled: 'true',
  sensitive_op_verify_timeout: '120',
  log_access_enabled: 'true',
  log_retention_days: '30'
};

/** 配置值按 value_type 归一化 */
export function normalizeConfigValue(row: Pick<SysConfigRow, 'config_value' | 'value_type'>): string | number | boolean | unknown {
  const raw = row.config_value ?? '';
  switch (row.value_type) {
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    case 'boolean':
      return raw === 'true' || raw === '1';
    case 'json': {
      try {
        return JSON.parse(String(raw));
      } catch {
        return [];
      }
    }
    default:
      return String(raw);
  }
}

/** 数据库行（snake_case）→ API 输出（camelCase） */
export function toCamelRow(row: SysConfigRow): SysConfigItem {
  return {
    id: row.id,
    configKey: row.config_key,
    configName: row.config_name,
    configValue: normalizeConfigValue(row),
    valueType: row.value_type,
    group: row.group,
    remark: row.remark,
    sortOrder: row.sort_order,
    status: row.status,
    isSystem: row.is_system,
    operator: row.operator,
    createTime: row.create_time,
    updateTime: row.update_time
  };
}

@Injectable()
export class SystemConfigService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly securityService: SystemSecurityService
  ) {}

  /** 分页列表 */
  async getList(params: SysConfigQueryParams) {
    const { page, pageSize, keyword, group, status } = params;
    const offset = (page - 1) * pageSize;
    const where: string[] = [];
    const values: QueryValues = [];

    if (keyword) {
      where.push('(`config_key` LIKE ? OR `config_name` LIKE ? OR `remark` LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (group) {
      where.push('`group` = ?');
      values.push(group);
    }
    if (status !== undefined && status !== null) {
      where.push('`status` = ?');
      values.push(status);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [countResult] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM \`sys_config\` ${whereClause}`,
      values
    );
    const total = countResult?.total ?? 0;

    const list = await this.dataSource.query<SysConfigRow[]>(
      `SELECT \`id\`, \`config_key\`, \`config_name\`, \`config_value\`, \`value_type\`, \`group\`, \`remark\`, \`sort_order\`, \`status\`, \`is_system\`, \`operator\`, \`create_time\`, \`update_time\`
       FROM \`sys_config\` ${whereClause}
       ORDER BY \`group\` ASC, \`sort_order\` ASC, \`id\` ASC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return {
      list: list.map(row => ({ ...row, config_value: normalizeConfigValue(row) })),
      total,
      page,
      pageSize
    };
  }

  /** 按分组获取全部配置（基础配置/安全设置/日志配置），值为归一化类型 */
  async getGroups() {
    const rows = await this.dataSource.query<SysConfigRow[]>(
      `SELECT \`id\`, \`config_key\`, \`config_name\`, \`config_value\`, \`value_type\`, \`group\`, \`remark\`, \`sort_order\`, \`status\`, \`is_system\`, \`operator\`, \`create_time\`, \`update_time\`
       FROM \`sys_config\` WHERE \`status\` = 1
       ORDER BY \`group\` ASC, \`sort_order\` ASC, \`id\` ASC`
    );

    const result: Record<string, SysConfigItem[]> = {
      basic: [],
      security: [],
      log: []
    };
    for (const row of rows) {
      if (!result[row.group]) result[row.group] = [];
      result[row.group].push(toCamelRow(row));
    }
    return result;
  }

  /** 获取单条配置 */
  async getByKey(key: string) {
    const [row] = await this.dataSource.query<SysConfigRow[]>(
      'SELECT * FROM `sys_config` WHERE `config_key` = ?',
      [key]
    );
    if (!row) {
      throw new HttpException('配置不存在', HttpStatus.NOT_FOUND);
    }
    return { ...row, config_value: normalizeConfigValue(row) };
  }

  /** 站点基础配置（公开）：系统名称/LOGO/版权信息 */
  async getSiteConfig(): Promise<{ systemName: string; systemLogo: string; copyright: string }> {
    const keys = ['system_name', 'system_logo', 'copyright'];
    const rows = await this.dataSource.query<SysConfigRow[]>(
      `SELECT \`config_key\`, \`config_value\`, \`value_type\` FROM \`sys_config\`
       WHERE \`status\` = 1 AND \`config_key\` IN (?, ?, ?)`,
      keys
    );
    const map = new Map(rows.map(r => [r.config_key, String(r.config_value || '')]));
    return {
      systemName: map.get('system_name') || DEFAULT_VALUES.system_name,
      systemLogo: map.get('system_logo') || DEFAULT_VALUES.system_logo,
      copyright: map.get('copyright') || DEFAULT_VALUES.copyright
    };
  }

  /** 更新配置 */
  async update(id: number, data: SysConfigUpdateData, operator?: string) {
    const [row] = await this.dataSource.query<Pick<SysConfigRow, 'id'>[]>(
      'SELECT `id` FROM `sys_config` WHERE `id` = ?',
      [id]
    );
    if (!row) {
      throw new HttpException('配置不存在', HttpStatus.NOT_FOUND);
    }

    const fields: string[] = [];
    const values: QueryValues = [];

    if (data.configValue !== undefined) { fields.push('`config_value` = ?'); values.push(String(data.configValue)); }
    if (data.configName !== undefined) { fields.push('`config_name` = ?'); values.push(data.configName); }
    if (data.remark !== undefined) { fields.push('`remark` = ?'); values.push(data.remark); }
    if (data.sortOrder !== undefined) { fields.push('`sort_order` = ?'); values.push(data.sortOrder); }
    if (data.status !== undefined) { fields.push('`status` = ?'); values.push(data.status); }

    if (fields.length === 0) {
      throw new HttpException('没有需要更新的字段', HttpStatus.BAD_REQUEST);
    }

    fields.push('`operator` = ?');
    values.push(operator || '');

    values.push(id);
    await this.dataSource.query(
      `UPDATE \`sys_config\` SET ${fields.join(', ')} WHERE \`id\` = ?`,
      values
    );

    // 使安全配置缓存失效，让新配置立即生效
    this.securityService.invalidateConfigCache();

    return { success: true };
  }

  /** 批量保存（基础配置表单一键保存） */
  async saveBatch(items: SysConfigSaveItem[], operator?: string) {
    if (!items || items.length === 0) {
      throw new HttpException('保存内容为空', HttpStatus.BAD_REQUEST);
    }

    await this.dataSource.transaction(async manager => {
      for (const item of items) {
        if (!item.id || item.configValue === undefined || item.configValue === null) {
          throw new HttpException('保存条目缺少 id 或 configValue', HttpStatus.BAD_REQUEST);
        }
        await manager.query(
          'UPDATE `sys_config` SET `config_value` = ?, `operator` = ? WHERE `id` = ?',
          [String(item.configValue), operator || '', item.id]
        );
      }
    });

    this.securityService.invalidateConfigCache();
    return { success: true, updated: items.length };
  }

  /** 恢复默认值（仅系统内置配置支持） */
  async reset(id: number, operator?: string) {
    const [row] = await this.dataSource.query<SysConfigRow[]>(
      'SELECT `config_key`, `is_system` FROM `sys_config` WHERE `id` = ?',
      [id]
    );
    if (!row) {
      throw new HttpException('配置不存在', HttpStatus.NOT_FOUND);
    }
    if (row.is_system !== 1) {
      throw new HttpException('仅系统内置配置支持恢复默认值', HttpStatus.BAD_REQUEST);
    }

    const defaultVal = DEFAULT_VALUES[row.config_key];
    if (defaultVal === undefined) {
      throw new HttpException('该配置没有默认值', HttpStatus.BAD_REQUEST);
    }

    await this.dataSource.query(
      'UPDATE `sys_config` SET `config_value` = ?, `operator` = ? WHERE `id` = ?',
      [defaultVal, operator || '', id]
    );

    this.securityService.invalidateConfigCache();
    return { success: true };
  }
}
