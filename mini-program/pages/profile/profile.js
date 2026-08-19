const app = getApp();
const { auth, subscription } = require('../../utils/api');
const { clearToken, getToken } = require('../../utils/request');
const { API_BASE_URL, USE_MOCK } = require('../../utils/config');
const { resolveImageUrl, normalizeFamily } = require('../../utils/format');

Page({
  data: {
    userInfo: {},
    editVisible: false,
    isOnline: false,
    // 我的家族关联:{ familyId, familyName, memberName, shareCode, bound }
    familyInfo: { familyId: '', familyName: '', memberName: '', shareCode: '', bound: false },
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
    const shareCode = my.shareCode || info.shareCode || '';
    this.setData({
      familyInfo: {
        familyId: my.familyId || info.familyId || '',
        familyName: familyName,
        memberName: memberName,
        shareCode: shareCode,
        // 已关联家族（family 存在即视为已绑定支系）
        bound: !!(my.familyId || info.familyId) && !!familyName
      }
    });
  },

  /** 加入家族支系入口:输入分享码或家族ID */
  joinFamilyEntry() {
    if (!this.data.isOnline) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '加入家族支系',
      editable: true,
      placeholderText: '请输入分享码（如 ABC12345）或家族ID',
      confirmText: '加入',
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (!res.confirm) return;
        const input = (res.content || '').trim();
        if (!input) {
          wx.showToast({ title: '请输入分享码或家族ID', icon: 'none' });
          return;
        }
        this.doJoin(input);
      }
    });
  },

  /** 提交加入:纯数字视为家族ID,否则视为分享码 */
  doJoin(input) {
    const payload = /^\d+$/.test(input)
      ? { familyId: Number(input) }
      : { shareCode: input.toUpperCase() };
    wx.showLoading({ title: '加入中' });
    auth.joinFamily(payload)
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

  /** 上传头像到后端,返回可访问的 URL */
  uploadAvatar(filePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: API_BASE_URL + '/common/upload',
        filePath: filePath,
        name: 'file',
        header: { Authorization: 'Bearer ' + getToken() },
        success(res) {
          try {
            const data = JSON.parse(res.data);
            if (data.code === '0000') {
              resolve(data.data.url);
            } else {
              reject(new Error(data.msg || '头像上传失败'));
            }
          } catch (e) {
            reject(new Error('上传响应解析失败'));
          }
        },
        fail(err) {
          reject(new Error((err && err.errMsg) || '头像上传失败'));
        }
      });
    });
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
          // 清除本地 token
          clearToken();
          app.globalData.userInfo = null;
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
          app.globalData.userInfo = null;
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
