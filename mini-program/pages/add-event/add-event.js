const app = getApp();
const { content, familyMember } = require('../../utils/api');
const { normalizeEvent, normalizeMember, resolveImageUrls } = require('../../utils/format');
const { API_BASE_URL, USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

/** 事件类型选项（value 与数据库 type 对应） */
const TYPE_OPTIONS = [
  { value: 'birth', label: '出生' },
  { value: 'marriage', label: '婚嫁' },
  { value: 'death', label: '逝世' },
  { value: 'other', label: '其他' }
];

Page({
  data: {
    isEdit: false,
    typeOptions: TYPE_OPTIONS,
    members: [],          // 可选关联成员 {id,name,gender}
    selectedMemberIds: [],// 已选关联成员 ID
    yearRange: [],
    monthRange: ['不详', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    dayRange: ['不详', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31'],
    form: {
      title: '',
      year: '',
      month: 0,
      day: 0,
      type: 'other',
      typeName: '其他',
      description: '',
      photos: []
    }
  },

  onLoad(options) {
    // 年份范围:1900 ~ 当前年份+10
    const cur = new Date().getFullYear();
    const yearRange = [];
    for (let y = 1900; y <= cur + 10; y++) yearRange.push(y);
    this.setData({ yearRange });

    if (options && options.id) {
      this._editId = options.id;
      this.setData({ isEdit: true });
      this.loadEditData(options.id);
    }
    this.loadMembers();
  },

  /** 加载成员候选列表（关联成员选择用） */
  loadMembers() {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (USE_MOCK || !getToken() || !familyId) return;
    familyMember.getAll(familyId, { status: 1 })
      .then((list) => {
        this.setData({
          members: (list || []).map(m => {
            const n = normalizeMember(m);
            return { id: n.id, name: n.name, gender: n.gender };
          })
        });
      })
      .catch((err) => console.error('成员列表加载失败', err));
  },

  /** 编辑模式:加载事件详情回填表单 */
  loadEditData(id) {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (USE_MOCK || !getToken() || !familyId) return;
    content.getById('event', id)
      .then((row) => {
        const e = normalizeEvent(row);
        this.setData({
          'form.title': e.title,
          'form.year': e.year || '',
          'form.month': e.month || 0,
          'form.day': e.day || 0,
          'form.type': e.type || 'other',
          'form.typeName': e.typeName || this.typeLabel(e.type || 'other'),
          'form.description': e.description || '',
          'form.photos': resolveImageUrls(row.photos || []),
          selectedMemberIds: (row.relatedMembers || []).map(m => String(m.id))
        });
        wx.setNavigationBarTitle({ title: '编辑事件' });
      })
      .catch((err) => {
        console.error('事件详情加载失败', err);
        wx.showToast({ title: '事件加载失败', icon: 'none' });
      });
  },

  typeLabel(type) {
    const t = TYPE_OPTIONS.find(o => o.value === type);
    return t ? t.label : '其他';
  },

  onTitleInput(e) {
    this.setData({ 'form.title': e.detail.value });
  },

  onDescInput(e) {
    this.setData({ 'form.description': e.detail.value });
  },

  /** 年份选择 */
  onYearChange(e) {
    const year = this.data.yearRange[Number(e.detail.value)];
    this.setData({ 'form.year': year });
  },

  /** 月份选择(0=不详) */
  onMonthChange(e) {
    this.setData({ 'form.month': Number(e.detail.value) });
  },

  /** 日期选择(0=不详) */
  onDayChange(e) {
    this.setData({ 'form.day': Number(e.detail.value) });
  },

  /** 类型选择 */
  selectType(e) {
    const value = e.currentTarget.dataset.value;
    const typeName = this.typeLabel(value);
    this.setData({ 'form.type': value, 'form.typeName': typeName });
  },

  /** 勾选/取消关联成员 */
  toggleMember(e) {
    const id = String(e.currentTarget.dataset.id);
    const selected = this.data.selectedMemberIds;
    const idx = selected.indexOf(id);
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else {
      selected.push(id);
    }
    this.setData({ selectedMemberIds: selected });
  },

  /** 选择照片(最多9张) */
  choosePhoto() {
    const remain = 9 - this.data.form.photos.length;
    if (remain <= 0) return;
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = (res.tempFiles || []).map(f => f.tempFilePath);
        this.setData({ 'form.photos': this.data.form.photos.concat(paths) });
      }
    });
  },

  deletePhoto(e) {
    const index = e.currentTarget.dataset.index;
    const photos = this.data.form.photos.filter((_, i) => i !== index);
    this.setData({ 'form.photos': photos });
  },

  previewPhoto(e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({ current: this.data.form.photos[index], urls: this.data.form.photos });
  },

  /** 判断是否为本地临时文件路径（非 http/uploads 开头即需上传） */
  isLocalTempFile(path) {
    return !!path && typeof path === 'string' && !/^https?:\/\//.test(path) && !/^\/uploads\//.test(path);
  },

  /** 上传图片到后端,返回可访问的相对 URL */
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

  submitForm() {
    const form = this.data.form;
    if (!form.title.trim()) {
      wx.showToast({ title: '请输入事件标题', icon: 'none' });
      return;
    }
    if (!form.year) {
      wx.showToast({ title: '请选择事件年份', icon: 'none' });
      return;
    }

    const onSuccess = () => {
      wx.showToast({
        title: this.data.isEdit ? '修改成功' : '添加成功',
        icon: 'success',
        success: () => {
          setTimeout(() => wx.navigateBack(), 1500);
        }
      });
    };

    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      wx.showLoading({ title: '提交中' });
      const tempPhotos = (form.photos || []).filter(p => this.isLocalTempFile(p));
      const readyPhotos = (form.photos || []).filter(p => !this.isLocalTempFile(p));
      Promise.all(tempPhotos.map(p => this.uploadImage(p)))
        .then((urls) => {
          const selectedIds = this.data.selectedMemberIds;
          const relatedMembers = this.data.members
            .filter(m => selectedIds.includes(String(m.id)))
            .map(m => ({ id: String(m.id), name: m.name, gender: m.gender || '' }));
          const payload = {
            familyId,
            title: form.title.trim(),
            year: Number(form.year),
            month: Number(form.month) || 0,
            day: Number(form.day) || 0,
            type: form.type,
            typeName: form.typeName,
            description: form.description.trim(),
            relatedMembers,
            photos: readyPhotos.concat(urls)
          };
          return this.data.isEdit
            ? content.update('event', this._editId, payload)
            : content.create('event', payload);
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
  }
});
