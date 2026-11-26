import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { LlmService } from '../llm/llm.service';
import type { LlmMessage } from '../llm/types/llm.types';
import { EntitlementService } from '../membership/membership.service';
import { Capability } from '../membership/types/membership.types';

import type {
  ContextType,
  CreateSessionParams,
  SendMessageParams,
  SummarizeParams,
  AnnotateParams,
  CalcRelationParams,
  ChatSessionVO,
  ChatMessageVO
} from './types/ai-assistant.types';

/** 生成 32 位 hex ID（与 cultural-document 口径一致） */
function genId(): string {
  const ts = Date.now().toString(16);
  const rand = Math.random().toString(16).slice(2, 10);
  return (ts + rand + '0000000000000000').slice(0, 32).padStart(32, '0');
}

/** 解析 DB 时间/Date 为 ISO 字符串 */
function fmtTime(v: any): string {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly llm: LlmService,
    private readonly entitlement: EntitlementService
  ) {}

  // =================================================================
  // 会话管理
  // =================================================================

  async createSession(params: CreateSessionParams): Promise<{ sessionId: string }> {
    const id = genId();
    const title = params.title || '';

    await this.dataSource.query(
      `INSERT INTO \`ai_chat_session\` (\`id\`, \`family_id\`, \`user_id\`, \`title\`, \`context_type\`)
       VALUES (?, ?, ?, ?, ?)`,
      [id, params.familyId, params.userId, title, params.contextType || 'general']
    );

    return { sessionId: id };
  }

  async getSessionList(familyId: number, userId: string): Promise<ChatSessionVO[]> {
    const rows = await this.dataSource.query<any[]>(
      `SELECT * FROM \`ai_chat_session\`
       WHERE \`family_id\` = ? AND \`user_id\` = ?
       ORDER BY \`last_message_at\` DESC, \`create_time\` DESC`,
      [familyId, userId]
    );
    return rows.map(r => ({
      id: r.id,
      family_id: r.family_id,
      user_id: r.user_id,
      title: r.title,
      context_type: r.context_type as ContextType,
      message_count: r.message_count,
      last_message_at: fmtTime(r.last_message_at || null) as any,
      create_time: fmtTime(r.create_time),
      isEmpty: r.message_count === 0
    }));
  }

  async getMessageHistory(sessionId: string, familyId: number, userId: string): Promise<ChatMessageVO[]> {
    // 归属校验
    await this.assertSessionBelongs(sessionId, familyId, userId);

    const rows = await this.dataSource.query<any[]>(
      `SELECT * FROM \`ai_chat_message\`
       WHERE \`session_id\` = ?
       ORDER BY \`create_time\` ASC`,
      [sessionId]
    );
    return rows.map(r => ({
      id: r.id,
      role: r.role,
      content: r.content,
      model: r.model || undefined,
      create_time: fmtTime(r.create_time)
    }));
  }

  async deleteSession(sessionId: string, familyId: number, userId: string): Promise<void> {
    await this.assertSessionBelongs(sessionId, familyId, userId);
    // 级联删消息（先删子表）
    await this.dataSource.query('DELETE FROM `ai_chat_message` WHERE `session_id` = ?', [sessionId]);
    await this.dataSource.query(
      'DELETE FROM `ai_chat_session` WHERE `id` = ? AND `family_id` = ? AND `user_id` = ?',
      [sessionId, familyId, userId]
    );
  }

  // =================================================================
  // AI 核心：RAG 对话 + 额度扣减
  // =================================================================

  async sendMessage(params: SendMessageParams): Promise<{ reply: string; sessionTitle: string | null }> {
    const { sessionId, familyId, userId, question, historyRounds } = params;

    if (!question || !question.trim()) {
      throw new HttpException('请输入问题内容', HttpStatus.BAD_REQUEST);
    }

    // 1. 归属校验
    const session = await this.assertSessionBelongs(sessionId, familyId, userId);

    // 2. 额度扣减（AiChat）
    await this.entitlement.consumeQuota(familyId, Capability.AiChat, 1);

    // 3. 意图识别 + 上下文检索
    const intent = this.classifyIntent(question);
    const context = await this.retrieveContext(intent, question, familyId);

    // 4. 取最近 N 轮历史（仅 user + assistant）
    const history = await this.getRecentMessages(sessionId, historyRounds ?? 10);

    // 5. 组装消息
    const messages: LlmMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(intent) },
      ...(context ? [{ role: 'system' as const, content: context }] : []),
      ...history,
      { role: 'user', content: question.trim() }
    ];

    // 6. 调用 LLM
    let result;
    try {
      result = await this.llm.chat(messages, { familyId });
    } catch (err) {
      // 额度已在 consumeQuota 预扣，调用失败不回滚（简化实现）
      this.logger.error('[ai] llm call failed:', err);
      throw new HttpException(
        (err as any)?.response?.data?.message || 'AI 服务暂时不可用，请稍后再试',
        HttpStatus.BAD_GATEWAY
      );
    }

    // 7. 存消息
    await this.saveMessages(sessionId, userId, question, result.content, result.model, result.usage);

    // 8. 更新 session 元数据
    const newTitle = this.maybeGenerateTitle(session, question, result.content);
    await this.dataSource.query(
      `UPDATE \`ai_chat_session\`
       SET \`message_count\` = \`message_count\` + 2,
           \`last_message_at\` = NOW()
           ${newTitle ? ', `title` = ?' : ''}
       WHERE \`id\` = ?`,
      newTitle ? [newTitle, sessionId] : [sessionId]
    );

    return { reply: result.content.trim(), sessionTitle: newTitle };
  }

  // =================================================================
  // AI 辅助：摘要 / 注释 / 实体提取
  // =================================================================

  async summarize(params: SummarizeParams): Promise<{ summary: string }> {
    const { familyId, userId, text, maxWords, documentId } = params;
    if (!text || !text.trim()) {
      throw new HttpException('文本内容不能为空', HttpStatus.BAD_REQUEST);
    }

    await this.entitlement.consumeQuota(familyId, Capability.AiSummary, 1);

    const result = await this.llm.summarize(text, {
      familyId,
      userId,
      maxWords
    });

    // 可选：记录到 session（便于历史回看）
    if (documentId) {
      const { sessionId } = await this.createSession({
        familyId, userId,
        contextType: 'ancient',
        title: 'AI 摘要'
      });
      await this.saveMessages(sessionId, userId, `请为文档 ${documentId} 生成摘要`, result, 'system');
    }

    return { summary: result };
  }

  async annotate(params: AnnotateParams): Promise<{ punctuated: string; notes: any[] }> {
    const { familyId, userId, text } = params;
    if (!text || !text.trim()) {
      throw new HttpException('古文内容不能为空', HttpStatus.BAD_REQUEST);
    }

    await this.entitlement.consumeQuota(familyId, Capability.Annotate, 1);

    const result = await this.llm.annotateClassical(text, { familyId, userId });

    return {
      punctuated: result.punctuated,
      notes: result.notes || []
    };
  }

  async extractEntities(familyId: number, userId: string, text: string) {
    if (!text || !text.trim()) {
      throw new HttpException('文本内容不能为空', HttpStatus.BAD_REQUEST);
    }
    const result = await this.llm.extractEntities(text, { familyId, userId });
    return result;
  }

  // =================================================================
  // 亲属关系推理（家族域核心 AI 能力）
  // =================================================================

  async calcRelation(params: CalcRelationParams): Promise<{ relation: string; explanation: string }> {
    const { familyId, memberIdA, memberIdB } = params;
    if (!memberIdA || !memberIdB || memberIdA === memberIdB) {
      throw new HttpException('请选择两位不同的家族成员', HttpStatus.BAD_REQUEST);
    }

    // 1. 拉取成员基本信息（name + father_id + generation）
    const tableName = `family_members_${familyId}`;
    const rows = await this.dataSource.query<any[]>(
      `SELECT \`id\`, \`name\`, \`generation\`, \`father_id\`
       FROM \`${tableName}\`
       WHERE \`id\` IN (?, ?)`,
      [memberIdA, memberIdB]
    );
    if (rows.length < 2) {
      throw new HttpException('成员不存在或不在当前家族', HttpStatus.NOT_FOUND);
    }
    const a = rows.find(r => String(r.id) === String(memberIdA))!;
    const b = rows.find(r => String(r.id) === String(memberIdB))!;

    // 2. 构建代际链（各自向上遍历到始祖）
    const chainA = await this.buildAncestorChain(tableName, a.id);
    const chainB = await this.buildAncestorChain(tableName, b.id);

    // 3. 找最近公共祖先（LCA）
    const lca = this.findLca(chainA, chainB);

    if (!lca) {
      // 无共同祖先（或家谱数据不全）
      return {
        relation: '暂未找到明确关系',
        explanation: `「${a.name}」和「${b.name}」在当前家族族谱中未发现共同祖先，可能家族谱系数据不完整或关系较远。`
      };
    }

    // 4. 计算相对代差
    const aDepth = chainA.findIndex(c => c.id === lca.id);
    const bDepth = chainB.findIndex(c => c.id === lca.id);

    // 5. 查表定关系
    const { relation, explanation } = this.mapRelation(lca, aDepth, bDepth, a, b);

    return { relation, explanation };
  }

  // =================================================================
  // 内部：会话归属校验 + 消息持久化
  // =================================================================

  private async assertSessionBelongs(sessionId: string, familyId: number, userId: string) {
    const [session] = await this.dataSource.query<any[]>(
      'SELECT * FROM `ai_chat_session` WHERE `id` = ? AND `family_id` = ? AND `user_id` = ? LIMIT 1',
      [sessionId, familyId, userId]
    );
    if (!session) {
      throw new HttpException('会话不存在或无权限访问', HttpStatus.NOT_FOUND);
    }
    return session;
  }

  private async getRecentMessages(sessionId: string, rounds: number): Promise<LlmMessage[]> {
    const rows = await this.dataSource.query<any[]>(
      `SELECT \`role\`, \`content\` FROM \`ai_chat_message\`
       WHERE \`session_id\` = ?
       ORDER BY \`create_time\` DESC
       LIMIT ?`,
      [sessionId, rounds * 2]
    );
    // DESC 取出后 reverse 还原时间顺序
    return rows.reverse().map(r => ({ role: r.role, content: r.content }));
  }

  private async saveMessages(
    sessionId: string,
    userId: string,
    userMsg: string,
    aiMsg: string,
    model: string,
    usage?: { promptTokens: number; completionTokens: number }
  ) {
    await this.dataSource.query(
      `INSERT INTO \`ai_chat_message\` (\`session_id\`, \`role\`, \`content\`, \`model\`, \`prompt_tokens\`, \`completion_tokens\`)
       VALUES (?, 'user', ?, ?, ?, ?)`,
      [sessionId, userMsg, model, usage?.promptTokens ?? 0, 0]
    );
    await this.dataSource.query(
      `INSERT INTO \`ai_chat_message\` (\`session_id\`, \`role\`, \`content\`, \`model\`, \`prompt_tokens\`, \`completion_tokens\`)
       VALUES (?, 'assistant', ?, ?, ?, ?)`,
      [sessionId, aiMsg, model, 0, usage?.completionTokens ?? 0]
    );
  }

  private maybeGenerateTitle(session: any, question: string, reply: string): string | null {
    // 空会话 + 短问题 → 自动生成标题（取问题前 20 字）
    if (!session.title && question.length <= 30) {
      return question.slice(0, 20) + (question.length > 20 ? '...' : '');
    }
    return null;
  }

  // =================================================================
  // 内部：意图识别 + RAG 上下文
  // =================================================================

  private classifyIntent(question: string): ContextType {
    // 家族域关键词（扩充：字辈/始祖/堂号/迁徙/亲属关系/代数等）
    const famKw = [
      '族谱', '家族', '家谱', '辈分', '字辈', '世代', '成员', '祖先', '始祖',
      '迁徙', '堂号', '字辈表', '族规', '家训', '家族简介', '家族历史',
      '爷爷', '奶奶', '父亲', '母亲', '爸爸', '妈妈', '儿子', '女儿',
      '孙子', '孙女', '侄子', '侄女', '外甥', '外孙', '堂', '表',
      '哥哥', '姐姐', '弟弟', '妹妹', '兄弟', '姐妹',
      '几代', '多少代', '代数', '先祖', '高祖', '曾祖', '祖父', '太爷'
    ];
    if (famKw.some(k => question.includes(k))) return 'genealogy';
    // 古籍域关键词
    const ancKw = ['古籍', '古文', '断句', '注释', '百家姓', '三字经', '颜氏家训', '朱子家训', '史记', '典故', '文言'];
    if (ancKw.some(k => question.includes(k))) return 'ancient';
    return 'general';
  }

  private async retrieveContext(intent: ContextType, question: string, familyId: number): Promise<string> {
    try {
      if (intent === 'genealogy') {
        return await this.retrieveFamilyContext(familyId, question);
      }
      if (intent === 'ancient') {
        return await this.retrieveDocContext(question);
      }
    } catch (err) {
      this.logger.warn('[ai] retrieveContext failed:', err);
    }
    return '';
  }

  /**
   * 家族域多源检索：
   *  ① family 表（始祖、堂号、发源地、简介）— 无关键词也能返回
   *  ② generation_table 字辈序列
   *  ③ family_member 成员（人名模糊匹配）
   *  ④ family_event 家族大事
   *  ⑤ 两名人场景 → 族谱推理工具算真实关系链
   */
  private async retrieveFamilyContext(familyId: number, question: string): Promise<string> {
    const snippets: string[] = [];

    // ① 家族基本信息（总是注入，即使没关键词）
    const familyInfo = await this.queryFamilyBasic(familyId);
    if (familyInfo) snippets.push(familyInfo);

    // ② 字辈
    const genInfo = await this.queryGenerationTable(familyId);
    if (genInfo && /字辈|排行|行辈|派|诗|世代/.test(question)) {
      snippets.push(genInfo);
    }

    // ③ 成员 + ⑤ 关系推理（两名人时自动算）
    const memberResult = await this.queryMembers(familyId, question);
    if (memberResult.members.length > 0) snippets.push(memberResult.text);

    // 两名人 → 族谱推理
    if (memberResult.members.length >= 2) {
      const relChain = await this.computeRelationChain(familyId, memberResult.members);
      if (relChain) snippets.push(relChain);
    }

    // ④ 家族事件
    const events = await this.queryFamilyEvents(familyId, question);
    if (events) snippets.push(events);

    return snippets.length > 0 ? `[家族上下文]\n${snippets.join('\n\n')}` : '';
  }

  /** 古籍域：从 cultural_document 检索匹配段落 */
  private async retrieveDocContext(question: string): Promise<string> {
    const keyword = question.slice(0, 10);
    const rows = await this.dataSource.query<any[]>(
      `SELECT \`title\`, LEFT(\`annotated_text\`, 500) AS snippet
       FROM \`cultural_document\`
       WHERE \`audit_status\` = 1 AND \`status\` = 1
         AND (\`title\` LIKE ? OR \`annotated_text\` LIKE ? OR \`summary\` LIKE ?)
       LIMIT 3`,
      [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
    );
    if (rows.length === 0) return '';
    const lines = rows.map(r => `【${r.title}】\n${r.snippet || ''}`);
    return `[古籍上下文]\n${lines.join('\n\n')}`;
  }

  /** 查询家族基本信息（始祖/堂号/发源地/简介/代数/成员数） */
  private async queryFamilyBasic(familyId: number): Promise<string> {
    const [row] = await this.dataSource.query<any[]>(
      `SELECT \`name\`, \`founder\`, \`hall_name\`, \`origin\`, \`description\`, \`member_count\`, \`gen_count\`
       FROM \`family\` WHERE \`id\` = ? AND \`status\` = 1 LIMIT 1`,
      [familyId]
    );
    if (!row) return '';
    const parts: string[] = [`家族名称：${row.name}`];
    if (row.founder) parts.push(`始祖：${row.founder}`);
    if (row.hall_name) parts.push(`堂号：${row.hall_name}`);
    if (row.origin) parts.push(`发源地：${row.origin}`);
    if (row.member_count) parts.push(`成员数：${row.member_count} 人`);
    if (row.gen_count) parts.push(`传承：${row.gen_count} 代`);
    if (row.description) parts.push(`简介：${String(row.description).slice(0, 300)}`);
    return parts.join('\n');
  }

  /** 查询字辈表（generation_sequence JSON → 诗句字符串） */
  private async queryGenerationTable(familyId: number): Promise<string> {
    const [fam] = await this.dataSource.query<any[]>(
      `SELECT \`generation_table_id\` FROM \`family\` WHERE \`id\` = ? LIMIT 1`,
      [familyId]
    );
    if (!fam?.generation_table_id) return '';

    const [gt] = await this.dataSource.query<any[]>(
      `SELECT \`surname\`, \`founder\`, \`generation_sequence\`
       FROM \`generation_table\` WHERE \`id\` = ? AND \`status\` = 1 LIMIT 1`,
      [fam.generation_table_id]
    );
    if (!gt) return '';

    let seq: string[] = [];
    try {
      const parsed = typeof gt.generation_sequence === 'string'
        ? JSON.parse(gt.generation_sequence)
        : gt.generation_sequence;
      if (Array.isArray(parsed)) seq = parsed;
    } catch { /* noop */ }

    const lines = seq.map((chars: any, i: number) => {
      // generation_sequence 可以是字符串数组（每代为一字）或二维数组（每代多字）
      const charsStr = Array.isArray(chars) ? chars.join(' / ') : String(chars);
      return `  第${i + 1}代：${charsStr}`;
    });

    return `字辈表（${gt.surname}氏 · ${gt.founder}支系）：\n${lines.join('\n')}`;
  }

  /** 成员模糊搜索：分表 family_members_{familyId} */
  private async queryMembers(familyId: number, question: string): Promise<{ members: any[]; text: string }> {
    const names = this.extractChineseNames(question).slice(0, 5);
    if (names.length === 0) return { members: [], text: '' };

    const tableName = `family_members_${familyId}`;
    const conditions = names.map(() => '`name` LIKE ?').join(' OR ');
    const values = names.map(n => `%${n}%`);

    const rows = await this.dataSource.query<any[]>(
      `SELECT \`id\`, \`name\`, \`gender\`, \`generation\`, \`generation_name\`, \`father_id\`, \`birth_date\`, \`death_date\`, \`is_alive\`, LEFT(\`bio\`, 200) AS bio
       FROM \`${tableName}\`
       WHERE \`status\` = 1
         AND (${conditions})
       ORDER BY \`generation\` ASC, \`sort_order\` ASC
       LIMIT 15`,
      values
    );
    if (rows.length === 0) return { members: [], text: '' };

    const lines = rows.map(r => {
      const gen = r.generation ? `第${r.generation}代` : '';
      const zi = r.generation_name ? `（字辈 "${r.generation_name}"）` : '';
      const alive = r.is_alive ? '在世' : '已故';
      const bio = r.bio ? `，${String(r.bio).slice(0, 80)}` : '';
      return `- ${r.name} ${gen}${zi} ${alive}${bio}`;
    });
    const text = `本家族中相关成员（${rows.length}人）：\n${lines.join('\n')}`;
    return { members: rows, text };
  }

  /** 两名人 → 族谱推理：算真实关系链注入 prompt */
  private async computeRelationChain(familyId: number, members: any[]): Promise<string> {
    if (members.length < 2) return '';
    // 取前两个有 father_id 的成员算关系
    const a = members[0];
    const b = members[1];
    if (!a?.father_id || !b?.father_id) return '';

    try {
      // 改为分表 family_members_{familyId}
      const tableName = `family_members_${familyId}`;
      const chainA = await this.buildAncestorChain(tableName, a.id);
      const chainB = await this.buildAncestorChain(tableName, b.id);
      if (chainA.length < 2 || chainB.length < 2) return '';

      const lca = this.findLca(chainA, chainB);
      if (!lca) return '';

      const aDepth = chainA.findIndex((c: any) => String(c.id) === String(lca.id));
      const bDepth = chainB.findIndex((c: any) => String(c.id) === String(lca.id));
      if (aDepth < 0 || bDepth < 0) return '';

      // 祖先链文本
      const chainAText = chainA.map((c: any) => c.name).join(' → ');
      const chainBText = chainB.map((c: any) => c.name).join(' → ');

      const rel = this.mapRelation(lca, aDepth, bDepth, a, b);
      return `[族谱关系链]\n「${a.name}」祖先链：${chainAText}\n「${b.name}」祖先链：${chainBText}\n${rel.explanation}`;
    } catch (err) {
      this.logger.warn('[ai] computeRelationChain failed:', err);
      return '';
    }
  }

  /** 查询家族事件（迁徙/修谱/重大活动） */
  private async queryFamilyEvents(familyId: number, question: string): Promise<string> {
    const keyword = question.slice(0, 8);
    const rows = await this.dataSource.query<any[]>(
      `SELECT \`title\`, \`event_date\`, LEFT(\`description\`, 200) AS desc_text
       FROM \`family_event\`
       WHERE \`family_id\` = ? AND \`status\` = 1
         AND (\`title\` LIKE ? OR \`description\` LIKE ?)
       ORDER BY \`event_date\` DESC LIMIT 5`,
      [familyId, `%${keyword}%`, `%${keyword}%`]
    );
    if (rows.length === 0) return '';
    const lines = rows.map(r => `- [${r.event_date || '?'}] ${r.title}：${r.desc_text || ''}`);
    return `家族相关大事：\n${lines.join('\n')}`;
  }

  /** 极简中文人名提取（2-4 字中文，扩展字辈/世系识别） */
  private extractChineseNames(text: string): string[] {
    const matches = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
    // 过滤掉太像功能词的项
    const stopwords = new Set(['什么', '怎么', '如何', '为什么', '知道', '我们', '你们', '他们', '这个', '那个']);
    return [...new Set(matches)].filter(n => !stopwords.has(n));
  }

  private buildSystemPrompt(intent: ContextType): string {
    const base =
      '你是数字家谱平台的 AI 助手，擅长：① 家族谱系梳理与亲属关系推理 ' +
      '② 古籍阅读、断句、注释与白话翻译 ③ 字辈/堂号/家谱术语解读。';
    const rules =
      '回答要准确、严谨、有据可查；涉及家族成员时基于用户提供的上下文；' +
      '涉及古籍时标注书名和原文；不确定时坦诚说明，不要臆造。';

    if (intent === 'genealogy') {
      return base + '\n当前问题属于【家族谱系域】，请优先结合用户家族数据回答。\n' + rules;
    }
    if (intent === 'ancient') {
      return base + '\n当前问题属于【古籍文化域】，请以古籍原文和传统注释为依据。\n' + rules;
    }
    return base + '\n' + rules;
  }

  // =================================================================
  // 内部：亲属关系推理工具
  // =================================================================

  /** 从某成员向上遍历到始祖，返回 [始祖, ..., 自己] 代际链 */
  private async buildAncestorChain(tableName: string, startId: string): Promise<any[]> {
    const chain: any[] = [];
    const visited = new Set<string>();
    let curId: string | null = String(startId);
    let guard = 50;

    while (curId && guard-- > 0) {
      if (visited.has(curId)) break;
      visited.add(curId);

      const [row] = await this.dataSource.query<any[]>(
        `SELECT \`id\`, \`name\`, \`father_id\`, \`generation\` FROM \`${tableName}\` WHERE \`id\` = ? LIMIT 1`,
        [curId]
      );
      if (!row) break;
      chain.push({ id: row.id, name: row.name, generation: row.generation });
      curId = row.father_id ? String(row.father_id) : null;
    }
    return chain; // 从始祖到自己
  }

  /** 找两条链的最近公共祖先 */
  private findLca(chainA: any[], chainB: any[]): any | null {
    // chainA[0] = 始祖，chainA[last] = A 自己
    // 从后往前找 A 的祖先中出现在 B 链的第一个
    const bMap = new Map(chainB.map(c => [String(c.id), c]));
    for (let i = chainA.length - 1; i >= 0; i--) {
      const node = chainA[i];
      if (bMap.has(String(node.id))) {
        return node;
      }
    }
    return null;
  }

  /**
   * 根据公共祖先深度差 + 性别 → 自然语言关系
   * aDepth / bDepth：各自到 LCA 的代数（代差 = |aDepth - bDepth|）
   */
  private mapRelation(lca: any, aDepth: number, bDepth: number, a: any, b: any): { relation: string; explanation: string } {
    const diff = Math.abs(aDepth - bDepth);
    const aIsDescendantOfLca = aDepth > 0;
    const bIsDescendantOfLca = bDepth > 0;

    let relation = '';
    let explanation = '';

    if (diff === 0) {
      // 同代：兄弟姐妹/堂表
      if (aDepth === 0 && bDepth === 0) {
        relation = '同一人（始祖本人）';
      } else if (aDepth === 1 && bDepth === 1) {
        relation = '亲兄弟/姐妹';
      } else {
        const prefix = aDepth === 2 ? '堂/表' : '再' + (aDepth - 2 > 1 ? (aDepth - 2) + '次' : '') + '堂/表';
        relation = `${prefix}兄弟姐妹（同${aDepth}代）`;
      }
    } else if (diff === 1) {
      relation = aDepth > bDepth ? '叔侄/姑侄' : '侄叔/甥舅';
    } else if (diff === 2) {
      relation = aDepth > bDepth ? '祖孙（伯/叔祖父）' : '曾孙（侄孙）';
    } else {
      const elder = aDepth > bDepth ? `${a.name}` : `${b.name}`;
      const younger = aDepth > bDepth ? `${b.name}` : `${a.name}`;
      relation = `${younger}是${elder}的${diff}代后人，${elder}是${younger}的${diff}代祖先`;
    }

    explanation = `「${a.name}」和「${b.name}」的最近共同祖先是「${lca.name}」。` +
      `${a.name}距共同祖先${aDepth}代，${b.name}距共同祖先${bDepth}代，代差${diff}代。` +
      `因此关系为：${relation}。`;

    return { relation, explanation };
  }
}
