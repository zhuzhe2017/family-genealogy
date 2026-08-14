const app = getApp();
const { auth } = require('../../utils/api');
const { clearToken, getToken } = require('../../utils/request');
const { API_BASE_URL, USE_MOCK } = require('../../utils/config');
const { resolveImageUrl } = require('../../utils/format');

Page({
  data: {
    userInfo: {},
    editVisible: false,
    editForm: {
      nickName: '',
      gender: 0,
      avatarTempPath: ''
    }
  },

  onLoad() {
    this.loadProfile();
  },

  onShow() {
    this.loadProfile();
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
    return Object.assign({}, info, { avatarFull: resolveImageUrl(info.avatarUrl) });
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
