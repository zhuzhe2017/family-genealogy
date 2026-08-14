const app = getApp();
const { familyMember } = require('../../utils/api');
const { normalizeMember } = require('../../utils/format');
const { API_BASE_URL, USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

Page({
  data: {
    isEdit: false,
    form: {
      name: '',
      gender: 'male',
      generation: 1,
      birthDate: '',
      birthPlace: '',
      isAlive: true,
      deathDate: '',
      fatherName: '',
      motherName: '',
      fatherId: '',
      motherId: '',
      spouseId: '',
      spouseInfo: {
        name: '',
        birthDate: '',
        rank: '',
        bio: '',
        deathDate: '',
        deathPlace: '',
        longitude: '',
        latitude: ''
      },
      generationName: '',
      title: '',
      bio: '',
      photos: []
    }
  },

  onLoad(options) {
    if (options.edit) {
      this._editId = options.id;
      this.setData({ isEdit: true });
      // 加载编辑数据
      this.loadEditData(options.id);
    }
  },

  loadEditData(id) {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      familyMember.getById(familyId, id)
        .then((row) => {
          const m = normalizeMember(row);
          this.setData({
            'form.name': m.name,
            'form.gender': m.gender || 'male',
            'form.generation': m.generation || 1,
            'form.birthDate': m.birthDate,
            'form.birthPlace': m.birthPlace,
            'form.isAlive': m.isAlive,
            'form.deathDate': m.deathDate,
            'form.generationName': m.generationName,
            'form.title': m.title,
            'form.bio': m.bio,
            'form.fatherId': m.fatherId,
            'form.motherId': m.motherId,
            'form.photos': m.photos || [],
            'form.spouseInfo': m.spouseInfo || {
              name: '', birthDate: '', rank: '', bio: '',
              deathDate: '', deathPlace: '', longitude: '', latitude: ''
            }
          });
        })
        .catch((err) => {
          console.error('编辑数据加载失败,使用 mock', err);
          this.setMockEditData();
        });
    } else {
      this.setMockEditData();
    }
  },

  setMockEditData() {
    this.setData({
      'form.name': '张太公',
      'form.gender': 'male',
      'form.birthDate': '1880-03-15',
      'form.birthPlace': '山东省济南市',
      'form.isAlive': false,
      'form.deathDate': '1955-08-20',
      'form.generationName': '',
      'form.title': '家族始祖',
      'form.bio': '张太公，字子远，生于清光绪六年。'
    });
  },

  inputChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`form.${field}`]: value
    });
  },

  selectGender(e) {
    const gender = e.currentTarget.dataset.gender;
    this.setData({ 'form.gender': gender });
  },

  dateChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value
    });
  },

  spouseInputChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`form.spouseInfo.${field}`]: value
    });
  },

  spouseDateChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.spouseInfo.${field}`]: e.detail.value
    });
  },

  toggleAlive(e) {
    this.setData({ 'form.isAlive': e.detail.value });
  },

  selectParent(e) {
    const type = e.currentTarget.dataset.type;
    wx.showToast({ title: `选择${type === 'father' ? '父亲' : '母亲'}`, icon: 'none' });
  },

  selectSpouse() {
    wx.showToast({ title: '选择配偶', icon: 'none' });
  },

  choosePhoto() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = (res.tempFiles || []).map(f => f.tempFilePath);
        const photos = this.data.form.photos.concat(paths);
        this.setData({ 'form.photos': photos });
      }
    });
  },

  deletePhoto(e) {
    const index = e.currentTarget.dataset.index;
    const photos = this.data.form.photos.filter((_, i) => i !== index);
    this.setData({ 'form.photos': photos });
  },

  submitForm() {
    const form = this.data.form;
    if (!form.name || !form.name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }
    if (form.generationName && !this.validateGenerationName(form.generationName)) {
      wx.showToast({ title: '字辈只能为1-10个中文汉字', icon: 'none' });
      return;
    }

    const onSuccess = () => {
      wx.showToast({
        title: this.data.isEdit ? '修改成功' : '添加成功',
        icon: 'success',
        success: () => {
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        }
      });
    };

    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      wx.showLoading({ title: '提交中' });
      // 本地临时照片先逐张上传,拿到 URL 后随成员一起提交
      const tempPhotos = (form.photos || []).filter(p => this.isLocalTempFile(p));
      const readyPhotos = (form.photos || []).filter(p => !this.isLocalTempFile(p));
      Promise.all(tempPhotos.map(p => this.uploadImage(p)))
        .then((urls) => {
          const payload = {
            name: form.name.trim(),
            gender: form.gender,
            generation: Number(form.generation) || 1,
            generationName: form.generationName.trim(),
            birthDate: form.birthDate || '',
            birthPlace: form.birthPlace || '',
            isAlive: form.isAlive ? 1 : 0,
            deathDate: form.deathDate || '',
            deathPlace: form.deathPlace || '',
            bio: form.bio || '',
            fatherId: form.fatherId || '',
            motherId: form.motherId || '',
            spouseInfo: form.spouseInfo || {},
            photos: readyPhotos.concat(urls)
          };
          return this.data.isEdit
            ? familyMember.update(familyId, this._editId, payload)
            : familyMember.create(familyId, payload);
        })
        .then(() => {
          wx.hideLoading();
          onSuccess();
        })
        .catch((err) => {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
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

  validateGenerationName(value) {
    if (!value) return true;
    return /^[\u4e00-\u9fa5]{1,10}$/.test(value.trim());
  }
});
