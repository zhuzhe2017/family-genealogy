const { auth, family } = require('./utils/api');
const { setToken, getToken } = require('./utils/request');
const { USE_MOCK } = require('./utils/config');
const { normalizeFamily } = require('./utils/format');

App({
  globalData: {
    userInfo: null,
    currentFamily: null,
    families: [],
    // 我的家族关联信息:{ familyId, family, memberId, member, shareCode }
    myFamily: null,
    // 从家谱树页返回时置位,家族列表页据此避免无限自动跳转
    skipAutoEnter: false,
    // 从成员列表页返回时置位,"族成员" tab 入口页据此避免无限自动跳转
    skipMemberNav: false,
    // 首页金刚区/查看更多显式进入动态列表时置位,动态页据此跳过"族成员" tab 劫持
    dynamicFromHome: false,
    systemInfo: null,
    // 是否已连接真实后端(API 不可用时降级到 mock 数据)
    isOnline: false
  },

  onLaunch() {
    // 获取系统信息(使用新 API 替代已废弃的 wx.getSystemInfo)
    this.initSystemInfo();

    // 从本地缓存恢复上次进入的家族,避免冷启动空白等待
    this.restoreLastFamily();

    // 登录:优先走真实 API,失败时回退 mock
    this.login();

    // 初始化家族数据
    this.initFamilyData();
  },

  /**
   * 系统信息:wx.getSystemInfo 已废弃,
   * 拆分为 getDeviceInfo + getWindowInfo + getAppBaseInfo + getSystemSetting
   * 合并到 systemInfo 字段以保持向后兼容
   */
  initSystemInfo() {
    try {
      const deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : {};
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
      const appBaseInfo = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
      const systemSetting = wx.getSystemSetting ? wx.getSystemSetting() : {};

      this.globalData.systemInfo = Object.assign({}, deviceInfo, windowInfo, appBaseInfo, systemSetting);
    } catch (e) {
      console.error('系统信息获取失败', e);
      // 降级:用旧 API 兜底(部分旧版基础库仍需)
      if (wx.getSystemInfoSync) {
        this.globalData.systemInfo = wx.getSystemInfoSync();
      }
    }
  },

  /** 登录流程:wx.login 获取 code → 后端换 token,失败回退 mock */
  login() {
    if (!USE_MOCK && !getToken()) {
      // 生产模式且无缓存 token:走真实登录
      this.doWxLogin();
    } else if (getToken()) {
      // 已有 token:标记为在线,并主动恢复用户态（含绑定状态）
      this.globalData.isOnline = true;
      this.restoreUserInfo();
    } else {
      // 开发模式无 token:使用 mock 用户
      this.mockLogin();
    }
  },

  /**
   * 从本地缓存恢复用户信息和绑定状态（冷启动即时展示）
   * 同时触发异步校正，确保与后端数据一致
   */
  restoreUserInfo() {
    try {
      const cachedInfo = wx.getStorageSync('userInfo');
      const cachedMyFamily = wx.getStorageSync('myFamily');
      
      if (cachedInfo && cachedInfo.id) {
        this.globalData.userInfo = cachedInfo;
        console.log('[App] 从缓存恢复 userInfo:', cachedInfo.familyId ? `familyId=${cachedInfo.familyId}` : '未绑定家族');
      }
      if (cachedMyFamily && cachedMyFamily.familyId) {
        this.globalData.myFamily = cachedMyFamily;
        console.log('[App] 从缓存恢复 myFamily:', cachedMyFamily.familyId);
      }
      
      // 触发异步校正：拉取最新数据，确保与后端一致
      this.refreshUserInfo();
    } catch (e) {
      console.error('[App] 恢复缓存用户态失败:', e);
      // 缓存损坏，尝试从后端恢复
      this.refreshUserInfo();
    }
  },

  /**
   * 异步拉取最新用户信息和绑定状态
   * 成功后更新缓存，失败时保留现有状态
   */
  refreshUserInfo() {
    if (!USE_MOCK && getToken()) {
      auth.getProfile()
        .then((info) => {
          this.globalData.userInfo = info;
          this.persistUserInfo();
          console.log('[App] 用户态已校正:', info.familyId ? `familyId=${info.familyId}` : '未绑定家族');
        })
        .catch((err) => {
          console.warn('[App] 拉取用户信息失败（可能 token 过期）:', err.message || err);
          // 失败时不清除缓存，等待 token 过期处理或下次启动
        });
      
      // 同时拉取绑定状态
      this.loadMyFamily();
    }
  },

  /**
   * 持久化用户信息和绑定状态到本地缓存
   * 在登录成功、绑定家族、更新资料时调用
   */
  persistUserInfo() {
    try {
      if (this.globalData.userInfo) {
        wx.setStorageSync('userInfo', this.globalData.userInfo);
      }
      if (this.globalData.myFamily) {
        wx.setStorageSync('myFamily', this.globalData.myFamily);
      }
    } catch (e) {
      console.error('[App] 持久化用户态失败:', e);
    }
  },

  /**
   * 清除本地缓存的用户态（退出登录、注销账号、token 过期时调用）
   */
  clearCachedUserInfo() {
    try {
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('myFamily');
      wx.removeStorageSync('current_family');
      console.log('[App] 已清除本地用户态缓存');
    } catch (e) {
      console.error('[App] 清除缓存失败:', e);
    }
    this.globalData.userInfo = null;
    this.globalData.myFamily = null;
    this.globalData.currentFamily = null;
  },

  /**
   * 微信登录(可 Promise 化,供登录页复用)
   * @returns {Promise<{token, userInfo}>} 登录成功数据;失败 reject
   */
  loginByWechat() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (!res.code) {
            reject(new Error('wx.login 未返回 code'));
            return;
          }
          auth.wxLogin(res.code)
            .then((data) => {
              this.applyLogin(data);
              resolve(data);
            })
            .catch(reject);
        },
        fail: (err) => {
          reject(new Error((err && err.errMsg) || 'wx.login 失败'));
        }
      });
    });
  },

  /** 手机号验证码登录(供登录页复用) */
  loginByPhone(phone, code) {
    return auth.phoneLogin(phone, code).then((data) => {
      this.applyLogin(data);
      return data;
    });
  },

  /** 登录成功统一处理:存 token + 更新用户态 + 拉取家族数据 */
  applyLogin(data) {
    if (data && data.token) {
      setToken(data.token);
    }
    this.globalData.userInfo = data.userInfo;
    this.globalData.isOnline = true;
    // 登录成功后持久化用户态，供冷启动恢复
    this.persistUserInfo();
    // 登录成功后再拉取真实家族,修复冷启动竞态
    // (onLaunch 时 initFamilyData 可能因 token 未就绪已走 mock)
    this.initFamilyData();
  },

  /** 静默微信登录:调用 wx.login + 后端 /user/wx-login 换取 token,失败回退 mock */
  doWxLogin() {
    this.loginByWechat().catch((err) => {
      console.error('后端登录失败,回退 mock', err);
      this.mockLogin();
    });
  },

  /** Mock 用户(开发期或后端不可用时) */
  mockLogin() {
    this.globalData.userInfo = {
      id: 'user001',
      nickName: '朱家族人',
      avatarUrl: '',
      role: 'admin'
    };
  },

  /**
   * token 过期处理:清除本地用户状态并重新走微信登录
   * 3 秒内防抖,避免多个并发请求 401 时重复触发 wx.login
   */
  onTokenExpired() {
    const now = Date.now();
    if (this._reloginAt && now - this._reloginAt < 3000) {
      return;
    }
    this._reloginAt = now;
    // 清除本地缓存的用户态，避免旧数据干扰
    this.clearCachedUserInfo();
    this.globalData.isOnline = false;
    if (!USE_MOCK) {
      this.doWxLogin();
    }
  },

  /**
   * 权益受限统一拦截（request.js 检测到 4xxx 业务码时回调）：
   * - 3 秒内防抖,避免并发请求重复弹窗
   * - 4001/4002/4003/4004 弹出付费引导,确认后跳转会员中心
   * - 4000/4005 等仅 toast 提示
   */
  onEntitlementError(code, msg) {
    const now = Date.now();
    if (this._entitlementAt && now - this._entitlementAt < 3000) {
      return;
    }
    this._entitlementAt = now;

    const text = msg || '该功能为会员专属权益';
    const guides = {
      '4001': { title: '功能未解锁', content: text + '\n开通会员即可使用该功能。', confirm: '去开通' },
      '4002': { title: '存储空间不足', content: text + '\n升级套餐可扩大存储容量。', confirm: '去升级' },
      '4003': { title: '额度已用尽', content: text + '\n升级套餐可获取更多额度。', confirm: '去升级' },
      '4004': { title: '订阅已过期', content: text + '\n续费后即可继续使用全部功能。', confirm: '去续费' }
    };
    const guide = guides[code];

    if (!guide) {
      wx.showToast({ title: text, icon: 'none', duration: 2500 });
      return;
    }
    wx.showModal({
      title: guide.title,
      content: guide.content,
      confirmText: guide.confirm,
      cancelText: '暂不',
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (res.confirm) {
          this.goMemberCenter();
        }
      }
    });
  },

  /** 跳转会员中心（已在会员中心页则不重复跳转） */
  goMemberCenter() {
    const pages = getCurrentPages();
    const current = pages[pages.length - 1];
    if (current && current.route === 'pages/member-center/member-center') {
      return;
    }
    wx.navigateTo({ url: '/pages/member-center/member-center' });
  },

  /** 初始化家族数据:优先从后端加载,失败回退 mock */
  initFamilyData() {
    if (!USE_MOCK && getToken()) {
      family.getList({ page: 1, pageSize: 50 })
        .then((res) => {
          this.globalData.families = (res.list || []).map(normalizeFamily);
          this.enterAssociatedFamily();
          this.globalData.isOnline = true;
          this.loadMyFamily();
        })
        .catch((err) => {
          console.error('家族数据加载失败,回退 mock', err);
          this.initMockData();
          // 即使家族列表加载失败，也要尝试恢复绑定状态
          this.loadMyFamily();
        });
    } else {
      this.initMockData();
    }
  },

  /**
   * 从本地缓存恢复上次进入的家族支系(冷启动即时展示,
   * 后端数据返回后由 enterAssociatedFamily/loadMyFamily 校正为已加入家族)
   */
  restoreLastFamily() {
    try {
      const saved = wx.getStorageSync('current_family');
      if (saved && saved.id) {
        this.globalData.currentFamily = saved;
      }
    } catch (e) {
      // 缓存读取失败忽略
    }
  },

  /**
   * 登录后自动检测并进入已关联的家族支系：
   * 若当前用户已绑定 familyId（登录响应/资料接口携带），优先将其作为当前家族；
   * 未在列表中(分页截断)时单独拉取详情。
   */
  enterAssociatedFamily() {
    const familyId = (this.globalData.userInfo || {}).familyId;
    if (!familyId) return;
    const matched = this.globalData.families.find(f => String(f.id) === String(familyId));
    if (matched) {
      this.switchFamily(familyId);
      return;
    }
    // 列表未命中:按 ID 拉取详情
    family.getById(familyId)
      .then((row) => {
        if (!row) return;
        const fam = normalizeFamily(row);
        this.globalData.families = [fam, ...this.globalData.families];
        this.switchFamily(familyId);
      })
      .catch(() => {
        // 关联家族不可用(已停用/删除),保持默认当前家族
      });
  },

  /** 加载我的家族关联信息（family/member/shareCode），供个人中心展示 */
  loadMyFamily() {
    if (!USE_MOCK && getToken()) {
      auth.getMyFamily()
        .then((data) => {
          this.globalData.myFamily = data || null;
          if (data) {
            this.globalData.userInfo = Object.assign({}, this.globalData.userInfo || {}, {
              familyId: data.familyId,
              memberId: data.memberId,
              shareCode: data.shareCode
            });
            // 已加入家族:登录后自动进入,无需每次手动选择
            this.enterAssociatedFamily();
            // 持久化绑定状态，供冷启动恢复
            this.persistUserInfo();
            console.log('[App] 绑定状态已加载:', data.familyId, data.family && data.family.name);
          } else {
            // 后端返回无绑定，清除可能过期的缓存
            this.globalData.myFamily = null;
            if (this.globalData.userInfo) {
              this.globalData.userInfo.familyId = null;
              this.globalData.userInfo.memberId = null;
              this.globalData.userInfo.shareCode = null;
            }
            this.persistUserInfo();
            console.log('[App] 用户未绑定家族，已清除本地绑定状态');
          }
        })
        .catch((err) => {
          console.error('[App] 绑定状态加载失败:', err.message || err);
          // 失败时不清除缓存，保留现有状态等待下次重试
        });
    }
  },

  /** Mock 家族数据 */
  initMockData() {
    this.globalData.families = [
      {
        id: 'fam001',
        name: '朱氏家族',
        logo: '',
        memberCount: 126,
        generationCount: 8,
        generationNames: '文、德、永、世、兴、明、道、广',
        // 按代字辈序列:同代可有多字辈,首页只显首字带+角标
        generationSequence: { 1: ['文'], 2: ['德', '得'], 3: ['永'], 4: ['世', '士'], 5: ['兴'], 6: ['明'], 7: ['道'], 8: ['广'] },
        founder: '朱太公',
        origin: '山东济南',
        hallName: '颍川堂',
        createTime: '2024-01-15',
        isAdmin: true
      },
      {
        id: 'fam002',
        name: '朱氏宗族',
        logo: '',
        memberCount: 89,
        generationCount: 6,
        generationNames: '宗、邦、维、振、家、声',
        founder: '朱老太',
        origin: '河南开封',
        createTime: '2024-03-20',
        isAdmin: false
      }
    ];
    this.globalData.currentFamily = this.globalData.families[0];
  },

  // 全局方法:切换家族(兼容数字 id 与字符串 id)
  switchFamily(familyId) {
    const fam = this.globalData.families.find(f => String(f.id) === String(familyId));
    if (fam) {
      this.globalData.currentFamily = fam;
      // 记住当前进入的家族,下次启动自动恢复进入
      try {
        wx.setStorageSync('current_family', fam);
      } catch (e) {
        // 缓存写入失败忽略
      }
      return fam;
    }
    return null;
  },

  // 全局提示
  showToast(title, icon) {
    wx.showToast({ title, icon: icon || 'none', duration: 2000 });
  },

  // 全局确认框
  showConfirm(title, content) {
    return new Promise((resolve) => {
      wx.showModal({
        title,
        content,
        success: (res) => {
          resolve(res.confirm);
        }
      });
    });
  }
});
