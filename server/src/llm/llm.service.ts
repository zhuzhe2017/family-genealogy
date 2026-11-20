import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as https from 'https';
import { URL } from 'url';
import { ConfigCryptoService } from '../common/crypto/config-crypto.service';
import {
  type LlmMessage,
  type LlmChatOptions,
  type LlmChatResult,
  type LlmSummarizeOptions,
  type AnnotateResult,
  type EntitiesResult,
  type LlmProvider,
  type LlmProviderConfig,
  LLM_PROVIDER_DEFAULTS
} from './types/llm.types';

/**
 * LLM 统一服务
 * - 多 Provider 切换（豆包/DeepSeek/通义千问）
 * - API Key 通过 sys_config 存储 + ConfigCryptoService 解密
 * - 零新依赖：用 Node.js 原生 https 发 HTTP 请求
 * - 统一接口：chat / summarize / annotateClassical / extractEntities
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  /** Provider 配置缓存（进程内，变更需重启） */
  private configCache: LlmProviderConfig | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly cryptoService: ConfigCryptoService
  ) {}

  // =================================================================
  // 公共 API
  // =================================================================

  /**
   * 通用对话（非流式）
   */
  async chat(messages: LlmMessage[], opts: LlmChatOptions = {}): Promise<LlmChatResult> {
    const config = await this.getConfig();
    const finalModel = opts.model || config.defaultModel;
    const temperature = opts.temperature ?? 0.3;
    const maxTokens = opts.maxTokens ?? 2048;

    // 如果没传 system prompt，注入族谱专家人设
    const hasSystem = messages.some(m => m.role === 'system');
    const finalMessages: LlmMessage[] = hasSystem
      ? messages
      : [{ role: 'system' as const, content: this.getDefaultSystemPrompt() }, ...messages];

    const result = await this.doRequest(config, finalModel, finalMessages, temperature, maxTokens);

    // 简单日志（后续可接入 AI 对话消息表）
    this.logger.debug(
      `[LLM chat] provider=${config.provider} model=${finalModel} ` +
      `prompt=${result.usage.promptTokens} completion=${result.usage.completionTokens}`
    );

    return result;
  }

  /**
   * 文本摘要
   */
  async summarize(text: string, opts: LlmSummarizeOptions = {}): Promise<string> {
    const maxWords = opts.maxWords ?? 300;
    const messages: LlmMessage[] = [
      { role: 'system', content: this.getSummarizePrompt(maxWords) },
      { role: 'user', content: text }
    ];
    const result = await this.chat(messages, opts);
    return result.content.trim();
  }

  /**
   * 古文断句 + 注释
   * 返回结构化：punctuated（断句后的原文）+ notes（注释数组）
   */
  async annotateClassical(text: string, opts: LlmChatOptions = {}): Promise<AnnotateResult> {
    const messages: LlmMessage[] = [
      { role: 'system', content: this.getAnnotatePrompt() },
      { role: 'user', content: text }
    ];
    const result = await this.chat(messages, { ...opts, temperature: 0.1 });

    // 尝试从 AI 回复中解析 JSON 结构
    try {
      const parsed = this.tryParseJson<AnnotateResult>(result.content);
      if (parsed && parsed.punctuated) return parsed;
    } catch {
      // JSON 解析失败，退而求其次：整个回复当作断句文本
    }

    return {
      punctuated: result.content.trim(),
      notes: []
    };
  }

  /**
   * 实体提取（人名/地名/年号/朝代）
   */
  async extractEntities(text: string, opts: LlmChatOptions = {}): Promise<EntitiesResult> {
    const messages: LlmMessage[] = [
      { role: 'system', content: this.getExtractPrompt() },
      { role: 'user', content: text }
    ];
    const result = await this.chat(messages, { ...opts, temperature: 0.1 });

    const empty: EntitiesResult = { names: [], places: [], dates: [], dynasty: [] };
    try {
      const parsed = this.tryParseJson<EntitiesResult>(result.content);
      if (parsed) return { ...empty, ...parsed };
    } catch {
      // 解析失败
    }
    return empty;
  }

  // =================================================================
  // 配置读取
  // =================================================================

  /**
   * 从 sys_config 读取 LLM 配置并解密 API Key
   * 缓存进程内，重启后重新读取
   */
  async getConfig(): Promise<LlmProviderConfig> {
    if (this.configCache) return this.configCache;

    const rows = await this.dataSource.query<{ config_key: string; config_value: string }[]>(
      `SELECT \`config_key\`, \`config_value\` FROM \`sys_config\`
       WHERE \`status\` = 1 AND \`config_key\` IN ('llm_provider', 'llm_api_key', 'llm_model')`
    );

    const map = new Map(rows.map(r => [r.config_key, String(r.config_value || '')]));

    const provider = (map.get('llm_provider') || 'doubao') as LlmProvider;
    const encryptedKey = map.get('llm_api_key') || '';
    const configuredModel = map.get('llm_model') || '';

    if (!encryptedKey) {
      throw new HttpException(
        '系统未配置 LLM API Key（llm_api_key），请在系统设置中配置',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    // 解密 API Key
    let apiKey: string;
    try {
      apiKey = this.cryptoService.decrypt(encryptedKey);
    } catch {
      // 兼容未加密的明文 key（开发态）
      apiKey = encryptedKey;
      this.logger.warn('[LLM] API Key 解密失败，按明文使用（生产环境请加密存储）');
    }

    const defaults = LLM_PROVIDER_DEFAULTS[provider];

    this.configCache = {
      provider,
      apiKey,
      baseUrl: defaults.baseUrl,
      defaultModel: configuredModel || defaults.defaultModel
    };

    return this.configCache;
  }

  /** 清除配置缓存（管理端修改后调用） */
  invalidateCache(): void {
    this.configCache = null;
  }

  // =================================================================
  // 底层 HTTP 请求
  // =================================================================

  private async doRequest(
    config: LlmProviderConfig,
    model: string,
    messages: LlmMessage[],
    temperature: number,
    maxTokens: number
  ): Promise<LlmChatResult> {
    const endpoint = LLM_PROVIDER_DEFAULTS[config.provider].endpoint;
    const fullUrl = `${config.baseUrl}${endpoint}`;

    const body = JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    });

    const result = await this.httpsPostJson<{
      choices: Array<{
        message: { role: string; content: string };
      }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    }>(fullUrl, {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    }, body, 30_000);

    const content = result?.choices?.[0]?.message?.content ?? '';
    const usage = result?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
      content,
      model,
      provider: config.provider,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens
      }
    };
  }

  /** Node.js 原生 https POST JSON */
  private httpsPostJson<T>(url: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const req = https.request(
        {
          method: 'POST',
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          port: parsed.port || 443,
          headers: {
            ...headers,
            'Content-Length': Buffer.byteLength(body)
          },
          timeout: timeoutMs
        },
        res => {
          // 非 2xx 状态码收集完整响应体后抛错
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
              const bodyText = Buffer.concat(chunks).toString('utf8');
              reject(
                new HttpException(
                  `LLM API 调用失败 [${res.statusCode}]: ${bodyText.slice(0, 300)}`,
                  HttpStatus.BAD_GATEWAY
                )
              );
            });
            return;
          }
          // 正常收集
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            try {
              resolve(JSON.parse(text) as T);
            } catch {
              reject(new HttpException('LLM API 返回非 JSON 响应', HttpStatus.BAD_GATEWAY));
            }
          });
        }
      );

      req.on('error', (err: Error) => {
        reject(new HttpException(`LLM API 网络错误: ${err.message}`, HttpStatus.BAD_GATEWAY));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new HttpException('LLM API 调用超时', HttpStatus.GATEWAY_TIMEOUT));
      });

      req.write(body);
      req.end();
    });
  }

  // =================================================================
  // Prompt 模板
  // =================================================================

  private getDefaultSystemPrompt(): string {
    return (
      '你是一位精通中国传统文化的数字家谱 AI 助手。' +
      '你擅长：① 家族谱系梳理与亲属关系推理 ② 古籍阅读、断句、注释与白话翻译 ' +
      '③ 字辈/堂号/家谱术语解读 ④ 家族迁徙路线分析。' +
      '回答要准确、严谨、有据可查；涉及 OCR 识别文本时注意校正常见错字。'
    );
  }

  private getSummarizePrompt(maxWords: number): string {
    return (
      `你是古籍/族谱内容摘要专家。请为以下内容生成约 ${maxWords} 字的摘要。` +
      '要求：① 保留核心人物、年代、事件 ② 用现代白话 ③ 结构清晰 ④ 不臆造信息'
    );
  }

  private getAnnotatePrompt(): string {
    return (
      '你是古文整理专家。以下是一段未断句的古文（可能来自老族谱 OCR 识别），' +
      '请执行：\n' +
      '1) 原文完整断句（保留所有原字符，仅添加「。」「，」「；」「：」「（）」等标点）\n' +
      '2) 识别其中的生僻字/典故/官职名/地名，生成注释\n' +
      '请严格按以下 JSON 格式输出，不要输出 JSON 以外的内容：\n' +
      '{"punctuated":"断句后的完整文本","notes":[{"position":"位置标记（如"第三行"或上下文）","original":"需要注释的原文","annotation":"注释说明"}]}'
    );
  }

  private getExtractPrompt(): string {
    return (
      '你是古籍实体识别专家。请从以下文本中提取：\n' +
      '- names：人名（含字号、谥号，去掉敬称如"公/母/氏/府君"）\n' +
      '- places：地名（古今地名皆可保留）\n' +
      '- dates：年代/年号（如"洪武三年""庚子年"）\n' +
      '- dynasty：朝代名\n' +
      '严格按 JSON 数组格式输出，不要输出 JSON 以外的内容：\n' +
      '{"names":[],"places":[],"dates":[],"dynasty":[]}'
    );
  }

  // =================================================================
  // 工具方法
  // =================================================================

  /** 从 LLM 回复中安全提取 JSON（可能被 ```json ``` 包裹） */
  private tryParseJson<T>(text: string): T | null {
    // 去掉 markdown 代码块包裹
    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenceMatch) cleaned = fenceMatch[1].trim();
    // 从第一个 { 到最后一个 } 截取
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      return null;
    }
  }
}
