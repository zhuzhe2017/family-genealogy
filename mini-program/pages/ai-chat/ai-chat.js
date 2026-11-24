/**
 * AI 家族助手 · 对话页
 *
 * 核心交互：
 *  1. 首次进入自动创建新会话（contextType=general）
 *  2. 左侧会话抽屉：历史会话列表，点击切换/删除
 *  3. 对话气泡：用户消息 / AI 回复（支持简易 Markdown：加粗/列表/换行）
 *  4. 底部输入框：文字输入 + 快捷短语按钮
 *  5. 会员权益不足提示：捕获 4004/4003 错误码
 *
 * 后端对接：utils/api.js 中 aiAssistant 域（9 函数）
 * 会话缓存：本地 storage 存 familyId → currentSessionId 映射
 */
const api = require('../../utils/api.js');

// storage key
const SESSION_MAP_KEY = 'ai_current_session_map'; // { [familyId]: sessionId }

Page({
  // ============================================================
  // 数据模型
  // ============================================================
  data: {
    familyId: null,
    // 当前会话
    sessionId: '',
    sessionTitle: '',
    // 会话抽屉
    showDrawer: false,
    sessionList: [],
    sessionsLoading: false,
    // 消息列表
    messages: [],            // [{ id, role, content, isLoading }]
    inputText: '',
    sending: false,
    scrollIntoView: '',

    // 快捷短语（4 个场景）
    quickPrompts: [
      { label: '梳理族谱', emoji: '🌳', q: '帮我梳理一下本家族的世系结构，从始祖到现今的主要分支' },
      { label: '关系推理', emoji: '🔗', q: '张三和我是什么关系？间隔几代？' },
      { label: '古籍问答', emoji: '📜', q: '《百家姓》为什么以赵钱孙李开头？' },
      { label: '古文断句', emoji: '✏️', q: '帮我给这段古文断句并加注释：昔先王之制自天子达于庶人' }
    ],

    // 会员权益状态
    quotaInfo: null,          // { remaining, dailyLimit }
    quotaPopupVisible: false  // 额度不足弹窗
  },

  // ============================================================
  // 生命周期
  // ============================================================
  onLoad: function () {
    const familyId = this.getCurrentFamilyId();
    this.setData({ familyId });

    if (!familyId) {
      wx.showModal({
        title: '提示',
        content: '请先绑定家族成员账号，再使用 AI 助手',
        showCancel: false,
        success: () => wx.navigateBack()
      });
      return;
    }

    // 恢复当前会话（或创建新的）
    this.initSession();
  },

  // ============================================================
  // 会话初始化
  // ============================================================
  initSession: function () {
    const familyId = this.data.familyId;
    let cachedSessionId = null;
    try {
      const map = wx.getStorageSync(SESSION_MAP_KEY) || {};
      cachedSessionId = map[String(familyId)] || null;
    } catch {}

    if (cachedSessionId) {
      // 恢复旧会话 → 拉历史消息
      this.setData({ sessionId: cachedSessionId });
      this.loadHistory(cachedSessionId);
    } else {
      // 新建会话
      this.createNewSession();
    }

    // 顺便加载会话列表（抽屉用）
    this.loadSessionList();
  },

  createNewSession: function (contextType) {
    const familyId = this.data.familyId;
    api.aiAssistant.createSession(familyId, {
      contextType: contextType || 'general'
    }).then(res => {
      const sessionId = res.data.sessionId;
      this.setData({ sessionId, sessionTitle: '', messages: [] });
      this.persistSessionId(sessionId);

      // 欢迎语（前端生成，不走 AI）
      const welcome = this.buildWelcomeMessage();
      this.setData({ messages: [welcome] });
    }).catch(err => {
      wx.showToast({ title: err.msg || '创建会话失败', icon: 'none' });
    });
  },

  persistSessionId: function (sessionId) {
    try {
      const map = wx.getStorageSync(SESSION_MAP_KEY) || {};
      map[String(this.data.familyId)] = sessionId;
      wx.setStorageSync(SESSION_MAP_KEY, map);
    } catch {}
  },

  loadHistory: function (sessionId) {
    const familyId = this.data.familyId;
    api.aiAssistant.getSessionHistory(familyId, sessionId).then(res => {
      const list = res.data || [];
      // 只保留最后 20 条消息（避免首次加载过慢）
      const recent = list.slice(-20).map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        isLoading: false
      }));

      if (recent.length === 0) {
        // 空会话 → 加欢迎语
        this.setData({ messages: [this.buildWelcomeMessage()] });
      } else {
        this.setData({ messages: recent });
        this.scrollToBottom();
      }
    }).catch(() => {
      // 拉取失败则新建
      this.createNewSession();
    });
  },

  loadSessionList: function () {
    const familyId = this.data.familyId;
    this.setData({ sessionsLoading: true });
    api.aiAssistant.getSessionList(familyId).then(res => {
      const list = res.data || [];
      // 标记当前会话
      list.forEach(s => {
        s.isCurrent = s.id === this.data.sessionId;
        s.contextLabel = this.contextTypeLabel(s.context_type);
      });
      this.setData({ sessionList: list, sessionsLoading: false });
    }).catch(() => {
      this.setData({ sessionsLoading: false });
    });
  },

  contextTypeLabel: function (t) {
    return { general: '通用', genealogy: '族谱', ancient: '古籍' }[t] || t;
  },

  buildWelcomeMessage: function () {
    return {
      id: 'welcome_' + Date.now(),
      role: 'assistant',
      content: '您好！我是家族 AI 助手 🤖\n\n我可以帮您：\n• 🌳 梳理族谱世系\n• 🔗 分析亲属关系\n• 📜 解答古籍问题\n• ✏️ 古文断句注释\n\n请问有什么可以帮您？',
      isLoading: false,
      isWelcome: true
    };
  },

  // ============================================================
  // 发送消息
  // ============================================================
  onInput: function (e) {
    this.setData({ inputText: e.detail.value });
  },

  onQuickPrompt: function (e) {
    const q = e.currentTarget.dataset.q;
    this.setData({ inputText: q });
  },

  sendMessage: function () {
    const question = (this.data.inputText || '').trim();
    if (!question || this.data.sending) return;
    if (!this.data.sessionId) {
      wx.showToast({ title: '会话未就绪', icon: 'none' });
      return;
    }

    const familyId = this.data.familyId;
    const sessionId = this.data.sessionId;

    // 1. 本地先加用户气泡 + AI 加载气泡
    const userMsg = {
      id: 'u_' + Date.now(),
      role: 'user',
      content: question,
      isLoading: false
    };
    const loadingMsg = {
      id: 'ai_loading',
      role: 'assistant',
      content: '',
      isLoading: true
    };
    const newMessages = this.data.messages.concat([userMsg, loadingMsg]);
    this.setData({ messages: newMessages, inputText: '', sending: true });
    this.scrollToBottom();

    // 2. 调后端
    api.aiAssistant.chat(familyId, {
      sessionId,
      question,
      historyRounds: 10
    }).then(res => {
      const reply = res.data.reply || '（AI 返回为空）';
      const title = res.data.sessionTitle;

      // 替换 loading 气泡
      const replaced = newMessages.map(m =>
        m.id === 'ai_loading'
          ? { id: 'ai_' + Date.now(), role: 'assistant', content: reply, isLoading: false }
          : m
      );
      this.setData({ messages: replaced, sending: false });

      // 会话标题更新
      if (title && title !== this.data.sessionTitle) {
        this.setData({ sessionTitle: title });
        wx.setNavigationBarTitle({ title: 'AI · ' + title.slice(0, 10) });
      }
      this.scrollToBottom();
    }).catch(err => {
      // 额度不足 → 弹窗提示
      const code = err && err.code;
      const msg = err && err.msg;

      if (code === 4003 || code === 4004 || (msg && (msg.includes('额度') || msg.includes('会员') || msg.includes('订阅')))) {
        this.showQuotaError(err);
      } else {
        wx.showToast({ title: msg || '发送失败，请稍后重试', icon: 'none' });
      }

      // 移除 loading 气泡
      const fallback = newMessages.filter(m => m.id !== 'ai_loading');
      this.setData({ messages: fallback, sending: false });
    });
  },

  showQuotaError: function (err) {
    const msg = err && err.msg ? err.msg : '今日 AI 对话额度已用完';
    wx.showModal({
      title: '会员权益',
      content: msg + '\n\n家族版会员可享 200 次/天 AI 对话额度，专业版无限使用。',
      confirmText: '查看套餐',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm) {
          // 跳到订阅页（复用现有 subscription 页面）
          wx.navigateTo({ url: '/pages/subscription/subscription' });
        }
      }
    });
  },

  // ============================================================
  // 会话抽屉
  // ============================================================
  toggleDrawer: function () {
    if (this.data.showDrawer) {
      this.setData({ showDrawer: false });
    } else {
      this.loadSessionList();
      this.setData({ showDrawer: true });
    }
  },

  onSelectSession: function (e) {
    const sessionId = e.currentTarget.dataset.id;
    if (sessionId === this.data.sessionId) {
      this.setData({ showDrawer: false });
      return;
    }
    this.setData({
      showDrawer: false,
      sessionId,
      sessionTitle: '',
      messages: []
    });
    this.persistSessionId(sessionId);
    this.loadHistory(sessionId);
  },

  onNewSession: function () {
    this.setData({ showDrawer: false });
    this.createNewSession();
  },

  onDeleteSession: function (e) {
    const sessionId = e.currentTarget.dataset.id;
    if (!sessionId) return;
    wx.showModal({
      title: '删除会话',
      content: '删除后消息记录不可恢复，确定继续？',
      success: (res) => {
        if (!res.confirm) return;
        api.aiAssistant.deleteSession(this.data.familyId, sessionId).then(() => {
          wx.showToast({ title: '已删除', icon: 'success' });

          // 如果删的是当前会话 → 新建
          if (sessionId === this.data.sessionId) {
            this.setData({ showDrawer: false });
            this.createNewSession();
          } else {
            this.loadSessionList();
          }
        }).catch(err => {
          wx.showToast({ title: err.msg || '删除失败', icon: 'none' });
        });
      }
    });
  },

  // ============================================================
  // 工具
  // ============================================================
  getCurrentFamilyId: function () {
    try {
      const info = wx.getStorageSync('current_family');
      return info ? Number(info.id) : null;
    } catch { return null; }
  },

  scrollToBottom: function () {
    // 小程序 view 组件 scroll-into-view 只能带一个 id，用末尾 id 触发
    const lastId = this.data.messages.length > 0
      ? 'msg_' + this.data.messages[this.data.messages.length - 1].id
      : '';
    this.setData({ scrollIntoView: lastId });
  }
});
