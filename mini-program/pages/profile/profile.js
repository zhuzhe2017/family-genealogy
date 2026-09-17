const app = getApp();
const { auth, subscription } = require('../../utils/api');
const { clearToken, getToken, upload } = require('../../utils/request');
const { USE_MOCK } = require('../../utils/config');
const { resolveImageUrl, normalizeFamily } = require('../../utils/format');

Page({
  data: {
    userInfo: {},
    editVisible: false,
    isOnline: false,
    // 我的家族关联:{ familyId, familyName, memberName, memberId, shareCode, bound }
    familyInfo: { familyId: '', familyName: '', memberName: '', memberId: '', shareCode: '', bound: false },
    // 绑定家族成员ID表单
    bindForm: { memberId: '', submitting: false },
    bindError: '',
    editForm: {
      nickName: '',
      gender: 0,
      avatarTempPath: ''
    },
    vipStatus: { isVip: false, text: '开通会员' }
  },

  onLoad() {
    this.setData({ isOnline: !!app.globalData.isOnline });
    this.loadProfile();
  },

  onShow() {
    this.setData({ isOnline: !!app.globalData.isOnline });
    this.loadProfile();
    this.loadFamilyInfo();
    this.loadVipStatus();
  },

  /** 加载会员状态角标（当前家族套餐），无家族/离线时保持默认 */
  loadVipStatus() {
    const family = app.globalData.currentFamily;
    if (USE_MOCK || !getToken() || !family) return;
    subscription.getCurrent(Number(family.id))
      .then((data) => {
        if (!data) return;
        const isVip = data.planCode && data.planCode !== 'free';
        this.setData({
          vipStatus: {
            isVip: !!isVip,
            text: isVip ? (data.planName || 'VIP') : '开通会员'
          }
        });
      })
      .catch(() => {
        // 加载失败保持默认角标
      });
  },

  /** 加载用户信息:优先走后端 API,失败回退 globalData */
  loadProfile() {
    if (!USE_MOCK && app.globalData.isOnline && getToken()) {
      auth.getProfile()
        .then((data) => {
          // 回写全局，保持 globalData.userInfo 与最新资料一致
          app.globalData.userInfo = Object.assign(app.globalData.userInfo || {}, data || {});
          this.setData({ userInfo: this.attachAvatarFull(data) });
        })
        .catch((err) => {
          console.error('用户信息加载失败,使用缓存', err);
          this.setData({ userInfo: this.attachAvatarFull(app.globalData.userInfo || {}) });
        });
    } else {
      this.setData({ userInfo: this.attachAvatarFull(app.globalData.userInfo || {}) });
    }
  },

  /** 补充 avatarFull:后端返回的相对路径(/uploads/xxx)拼上域名,供页面 image 直接使用 */
  attachAvatarFull(info) {
    const phone = info.phone || '';
    return Object.assign({}, info, {
      avatarFull: resolveImageUrl(info.avatarUrl),
      phoneMasked: phone ? phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : ''
    });
  },

  /** 加载我的家族关联信息（支系/成员/分享码） */
  loadFamilyInfo() {
    const my = app.globalData.myFamily || {};
    const info = app.globalData.userInfo || {};
    const familyName = (my.family && my.family.name) || '';
    const memberName = (my.member && my.member.name) || '';
    const memberId = my.memberId || info.memberId || '';
    const shareCode = my.shareCode || info.shareCode || '';
    this.setData({
      familyInfo: {
        familyId: my.familyId || info.familyId || '',
        familyName: familyName,
        memberName: memberName,
        memberId: memberId,
        shareCode: shareCode,
        // 已关联家族（family 存在即视为已绑定支系）
        bound: !!(my.familyId || info.familyId) && !!familyName
      }
    });
  },

  /** 输入绑定ID */
  onBindIdInput(e) {
    this.setData({ 'bindForm.memberId': e.detail.value, bindError: '' });
  },

  /** 从剪贴板粘贴ID */
  pasteBindId() {
    wx.getClipboardData({
      success: (res) => {
        const text = (res.data || '').trim();
        if (text) {
          this.setData({ 'bindForm.memberId': text, bindError: '' });
        } else {
          wx.showToast({ title: '剪贴板为空', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '读取剪贴板失败', icon: 'none' });
      }
    });
  },

  /** 校验ID格式：纯数字，长度1-10位 */
  validateBindId(id) {
    return /^\d{1,10}$/.test(String(id || '').trim());
  },

  /** 提交绑定：校验 → 确认 → 调用后端 */
  submitBindId() {
    if (this.data.bindForm.submitting) return;
    // 唯一性校验：已绑定则不允许再次绑定
    if (this.data.familyInfo.memberId) {
      this.setData({ bindError: '每个账号仅可绑定一个家族成员ID' });
      return;
    }
    const id = String(this.data.bindForm.memberId || '').trim();
    if (!id) {
      this.setData({ bindError: '请输入成员ID' });
      return;
    }
    if (!this.validateBindId(id)) {
      this.setData({ bindError: 'ID格式不正确，应为1-10位数字' });
      return;
    }
    // 绑定前确认环节
    wx.showModal({
      title: '确认绑定',
      content: `请核实：将把成员ID「${id}」绑定为您的家族成员。每个账号仅可绑定一个，绑定后可编辑该成员资料。确认绑定？`,
      confirmText: '确认绑定',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) return;
        this.doBindMember(id);
      }
    });
  },

  /** 调用后端绑定 */
  doBindMember(id) {
    this.setData({ 'bindForm.submitting': true });
    auth.bindMember(id)
      .then((userInfo) => {
        // 回写全局绑定态并刷新家族关联
        app.globalData.userInfo = Object.assign(app.globalData.userInfo || {}, userInfo || {});
        if (app.loadMyFamily) app.loadMyFamily();
        this.setData({
          'bindForm.memberId': '',
          'bindForm.submitting': false,
          bindError: ''
        });
        this.loadFamilyInfo();
        wx.showToast({ title: '绑定成功', icon: 'success' });
      })
      .catch((err) => {
        this.setData({
          'bindForm.submitting': false,
          bindError: (err && err.message) || '绑定失败，请稍后重试'
        });
      });
  },

  /** 加入家族支系入口:输入分享码 */
  joinFamilyEntry() {
    if (!this.data.isOnline) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '加入家族支系',
      editable: true,
      placeholderText: '请输入分享码（如 ABC12345）',
      confirmText: '加入',
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (!res.confirm) return;
        const input = (res.content || '').trim();
        if (!input) {
          wx.showToast({ title: '请输入分享码', icon: 'none' });
          return;
        }
        this.doJoin(input);
      }
    });
  },

  /** 提交加入:仅支持分享码 */
  doJoin(input) {
    wx.showLoading({ title: '加入中' });
    auth.joinFamily({ shareCode: input.toUpperCase() })
      .then((data) => {
        wx.hideLoading();
        const userInfo = data.userInfo || {};
        // 更新全局关联信息
        app.globalData.myFamily = {
          familyId: userInfo.familyId,
          family: data.family || null,
          memberId: userInfo.memberId,
          member: data.member || null,
          shareCode: data.shareCode
        };
        app.globalData.userInfo = Object.assign({}, app.globalData.userInfo || {}, userInfo);
        // 切换当前家族为刚加入的支系
        if (data.family && data.family.id) {
          const fam = normalizeFamily(data.family);
          app.globalData.families = [
            fam,
            ...(app.globalData.families || []).filter(f => String(f.id) !== String(data.family.id))
          ];
          app.globalData.currentFamily = fam;
        }
        this.loadFamilyInfo();
        wx.showToast({ title: '加入成功', icon: 'success' });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '加入失败', icon: 'none' });
      });
  },

  /** 复制分享码到剪贴板 */
  copyShareCode() {
    const code = this.data.familyInfo.shareCode;
    if (!code) {
      wx.showToast({ title: '暂无可分享的家族分享码', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '分享码已复制', icon: 'success' });
      }
    });
  },

  /** 未登录时跳转登录页 */
  loginEntry() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  /** 绑定手机号入口(多端统一锚点) */
  bindPhoneEntry() {
    if (!this.data.isOnline) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/login/login?mode=bind' });
  },

  /** 打开编辑资料弹窗,回填当前资料 */
  editProfile() {
    const info = this.data.userInfo || {};
    this.setData({
      editVisible: true,
      editForm: {
        nickName: info.nickName || '',
        gender: info.gender || 0,
        avatarTempPath: info.avatarUrl || ''
      }
    });
  },

  closeEdit() {
    this.setData({ editVisible: false });
  },

  noop() {},

  /** 选择微信头像(临时路径) */
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    if (!avatarUrl) return;
    this.setData({ 'editForm.avatarTempPath': avatarUrl });
  },

  onNickInput(e) {
    this.setData({ 'editForm.nickName': e.detail.value });
  },

  onGenderChange(e) {
    this.setData({ 'editForm.gender': Number(e.currentTarget.dataset.gender) });
  },

  /** 上传头像到后端,返回可访问的 URL(归 member_avatar 分类) */
  uploadAvatar(filePath) {
    return upload({ url: '/common/upload', filePath, formData: { bizType: 'member_avatar' } }).then(data => data.url);
  },

  /** 保存资料:头像为新选择的临时路径时先上传,再调用更新接口 */
  saveProfile() {
    const form = this.data.editForm;
    const nickName = (form.nickName || '').trim();
    if (!nickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    const isNewAvatar = form.avatarTempPath && form.avatarTempPath !== (this.data.userInfo.avatarUrl || '');
    const save = (avatarUrl) => {
      const payload = { nickName, gender: Number(form.gender) };
      if (avatarUrl) payload.avatarUrl = avatarUrl;

      if (!USE_MOCK && getToken()) {
        wx.showLoading({ title: '保存中' });
        auth.updateProfile(payload)
          .then((data) => {
            wx.hideLoading();
            const next = this.attachAvatarFull(data);
            this.setData({ userInfo: next, editVisible: false });
            app.globalData.userInfo = next;
            wx.showToast({ title: '保存成功', icon: 'success' });
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
          });
      } else {
        // 体验模式:本地更新
        this.setData({ 'userInfo.nickName': nickName, 'userInfo.gender': Number(form.gender), editVisible: false });
        app.globalData.userInfo = this.data.userInfo;
        wx.showToast({ title: '保存成功', icon: 'success' });
      }
    };

    // 头像为新选择的临时路径(wxfile:// 或 http://tmp)时需上传;
    // 未换头像时 avatarTempPath 等于后端相对路径(/uploads/...),走普通保存
    if (!USE_MOCK && getToken() && isNewAvatar) {
      wx.showLoading({ title: '上传中' });
      this.uploadAvatar(form.avatarTempPath)
        .then((url) => {
          wx.hideLoading();
          save(url);
        })
        .catch((err) => {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '头像上传失败', icon: 'none' });
        });
    } else {
      save(isNewAvatar ? form.avatarTempPath : '');
    }
  },

  navigateTo(e) {
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({ url });
  },

  showAbout() {
    wx.showModal({
      title: '关于数字家谱',
      content: '数字家谱是一款致力于传承家族记忆、延续血脉亲情的数字化家谱管理工具。版本 1.0.0',
      showCancel: false
    });
  },

  contactUs() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：400-888-8888\n工作时间：9:00-18:00',
      showCancel: false
    });
  },

  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除本地 token 和用户态缓存
          clearToken();
          app.clearCachedUserInfo();
          app.globalData.isOnline = false;
          wx.showToast({ title: '已退出登录', icon: 'success' });
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/index/index' });
          }, 1500);
        }
      }
    });
  },

  /** 注销账号：二次确认 + 说明后果 */
  deleteAccount() {
    wx.showModal({
      title: '注销账号',
      content: '注销后您的账号将被删除，您发布的动态、照片、文档将被匿名化（显示为"已注销用户"），家族共享数据保留。此操作不可恢复，确定继续吗？',
      confirmText: '继续注销',
      confirmColor: '#E64340',
      success: (res) => {
        if (!res.confirm) return;
        wx.showModal({
          title: '再次确认',
          content: '请再次确认注销，此操作不可撤销。',
          confirmText: '确认注销',
          confirmColor: '#E64340',
          success: (res2) => {
            if (!res2.confirm) return;
            this.doDeleteAccount();
          }
        });
      }
    });
  },

  doDeleteAccount() {
    if (!USE_MOCK && getToken()) {
      wx.showLoading({ title: '注销中...' });
      auth.deleteAccount()
        .then(() => {
          wx.hideLoading();
          clearToken();
          app.clearCachedUserInfo();
          app.globalData.isOnline = false;
          wx.showToast({ title: '账号已注销', icon: 'success' });
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/index/index' });
          }, 1500);
        })
        .catch((err) => {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '注销失败', icon: 'none' });
        });
    } else {
      wx.showModal({
        title: '提示',
        content: '当前为体验模式，注销功能需连接后端服务后使用。',
        showCancel: false
      });
    }
  }
});
