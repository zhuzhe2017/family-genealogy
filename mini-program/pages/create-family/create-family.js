const app = getApp();
const { family } = require('../../utils/api');
const { API_BASE_URL, USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');
const { normalizeFamily } = require('../../utils/format');

Page({
  data: {
    form: {
      name: '',
      origin: '',
      founder: '',
      description: '',
      logo: '',
      generationNames: '',
      isPublic: true,
      allowJoin: true
    }
  },

  inputChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value
    });
  },

  chooseLogo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          'form.logo': res.tempFiles[0].tempFilePath
        });
      }
    });
  },

  deleteLogo() {
    this.setData({ 'form.logo': '' });
  },

  togglePublic(e) {
    this.setData({ 'form.isPublic': e.detail.value });
  },

  toggleAllowJoin(e) {
    this.setData({ 'form.allowJoin': e.detail.value });
  },

  submitForm() {
    const form = this.data.form;
    if (!form.name || !form.name.trim()) {
      wx.showToast({ title: '请输入家族名称', icon: 'none' });
      return;
    }
    if (form.generationNames && !this.validateGenerationNames(form.generationNames)) {
      wx.showToast({ title: '字辈格式不正确，请使用中文逗号或顿号分隔', icon: 'none' });
      return;
    }

    const onSuccess = () => {
      wx.showToast({
        title: '创建成功',
        icon: 'success',
        success: () => {
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        }
      });
    };

    if (!USE_MOCK && getToken()) {
      // 本地临时 logo 先上传到后端,拿到可访问 URL 后再创建家族
      const logoPromise = this.isLocalTempFile(form.logo)
        ? this.uploadImage(form.logo)
        : Promise.resolve(form.logo);
      logoPromise
        .then((logoUrl) => {
          const payload = {
            name: form.name.trim(),
            origin: form.origin.trim(),
            founder: form.founder.trim(),
            description: form.description.trim() || null,
            logo: logoUrl || '',
            isPublic: form.isPublic ? 1 : 0,
            allowJoin: form.allowJoin ? 1 : 0
            // 字辈序列 generationNames 暂不落库：后端字辈需关联 generation_table，一期仅建基础字段
          };
          return family.create(payload);
        })
        .then((data) => {
          // 创建成功后刷新家族列表,并自动进入新创建的家族(创建者已被服务端自动加入)
          const createdId = data && (data.id || data.familyId);
          this.refreshFamilies(createdId);
          app.loadMyFamily();
          onSuccess();
        })
        .catch((err) => {
          wx.showToast({ title: (err && err.message) || '创建失败', icon: 'none' });
        });
    } else {
      onSuccess();
    }
  },

  /** 判断是否为本地临时文件路径（非 http/uploads 开头即需上传） */
  isLocalTempFile(path) {
    return !!path && typeof path === 'string' && !/^https?:\/\//.test(path) && !/^\/uploads\//.test(path);
  },

  /** 上传图片到后端,返回可访问 URL */
  uploadImage(filePath) {
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
              reject(new Error(data.msg || '上传失败'));
            }
          } catch (e) {
            reject(new Error('上传响应解析失败'));
          }
        },
        fail(err) {
          reject(new Error((err && err.errMsg) || '上传失败'));
        }
      });
    });
  },

  /** 创建成功后刷新全局家族列表;focusId 存在时自动进入该新创建的家族并本地记忆 */
  refreshFamilies(focusId) {
    family.getList({ page: 1, pageSize: 50 })
      .then((res) => {
        app.globalData.families = (res.list || []).map(normalizeFamily);
        if (focusId) {
          const created = app.globalData.families.find(f => String(f.id) === String(focusId));
          if (created) {
            app.switchFamily(focusId);
            return;
          }
        }
        if (app.globalData.families.length > 0) {
          app.globalData.currentFamily = app.globalData.families[0];
        }
      })
      .catch(() => {});
  },

  validateGenerationNames(value) {
    if (!value) return true;
    const names = value.split(/[、,，]/).map(s => s.trim()).filter(Boolean);
    return names.length > 0 && names.every(name => /^[\u4e00-\u9fa5]{1,10}$/.test(name));
  }
});
