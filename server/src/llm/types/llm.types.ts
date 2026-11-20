/**
 * LLM 服务类型定义
 * 统一封装多 Provider（豆包/DeepSeek/通义千问）
 */

/** 支持的 LLM Provider */
export type LlmProvider = 'doubao' | 'deepseek' | 'qwen';

/** 聊天消息（OpenAI 兼容格式） */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** chat() 调用选项 */
export interface LlmChatOptions {
  /** 关联家族 ID（用于日志/额度扣减时定位） */
  familyId?: number;
  /** 关联用户 ID（用于日志） */
  userId?: string;
  /** 模型名覆盖（默认用 sys_config 配置的默认模型） */
  model?: string;
  /** 温度 0-2，默认 0.3（族谱/古籍场景偏好保守） */
  temperature?: number;
  /** 最大 token 输出，默认 2048 */
  maxTokens?: number;
  /** 系统提示词覆盖（默认用内置族谱专家人设） */
  systemPrompt?: string;
}

/** chat() 返回结果 */
export interface LlmChatResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  provider: LlmProvider;
}

/** summarize() 选项 */
export interface LlmSummarizeOptions extends LlmChatOptions {
  /** 目标字数，默认 300 */
  maxWords?: number;
}

/** annotateClassical() 返回：断句文本 + 注释 */
export interface AnnotateResult {
  /** 断句后的文本（保留原文，仅加标点） */
  punctuated: string;
  /** 注释条目 [{位置, 原文, 注释}] */
  notes: AnnotateNote[];
}

export interface AnnotateNote {
  position: string;
  original: string;
  annotation: string;
}

/** extractEntities() 返回 */
export interface EntitiesResult {
  names: string[];
  places: string[];
  dates: string[];
  dynasty: string[];
}

/** Provider 配置（从 sys_config 读取后归一化） */
export interface LlmProviderConfig {
  provider: LlmProvider;
  apiKey: string;           // 已解密
  baseUrl: string;
  defaultModel: string;
}

/** Provider 映射表：provider → 默认 endpoint + 默认模型 */
export const LLM_PROVIDER_DEFAULTS: Record<LlmProvider, { baseUrl: string; defaultModel: string; endpoint: string }> = {
  doubao: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-pro-32k',
    endpoint: '/chat/completions'
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    endpoint: '/chat/completions'
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    endpoint: '/chat/completions'
  }
};
