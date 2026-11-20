/**
 * AI 助手模块类型定义
 * 对应表：ai_chat_session / ai_chat_message
 */

/** 会话上下文类型 */
export type ContextType = 'general' | 'genealogy' | 'ancient';

/** 创建会话参数 */
export interface CreateSessionParams {
  familyId: number;
  userId: string;
  contextType?: ContextType; // 默认 general
  title?: string; // 可选，不传则由 AI 自动生成
}

/** 发送消息参数 */
export interface SendMessageParams {
  sessionId: string;
  familyId: number;
  userId: string;
  question: string;
  /** 最大历史轮数，默认 10 */
  historyRounds?: number;
}

/** 摘要参数 */
export interface SummarizeParams {
  familyId: number;
  userId: string;
  text: string;
  maxWords?: number;
  /** 可选：关联文档 ID（记录到 session.title 方便回看） */
  documentId?: string;
}

/** 古文注释参数 */
export interface AnnotateParams {
  familyId: number;
  userId: string;
  text: string;
}

/** 亲属关系推理参数 */
export interface CalcRelationParams {
  familyId: number;
  memberIdA: string;
  memberIdB: string;
}

/** 会话记录（返回给前端） */
export interface ChatSessionVO {
  id: string;
  family_id: number;
  user_id: string;
  title: string;
  context_type: ContextType;
  message_count: number;
  last_message_at: string | null;
  create_time: string;
  /** 摘要标识：空会话 = true（可提示"开始对话"） */
  isEmpty?: boolean;
}

/** 消息记录（返回给前端） */
export interface ChatMessageVO {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  create_time: string;
}
