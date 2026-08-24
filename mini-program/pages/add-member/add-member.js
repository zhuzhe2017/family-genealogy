const app = getApp();
const { familyMember } = require('../../utils/api');
const { normalizeMember, parseSpouseList } = require('../../utils/format');
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
      deathPlace: '',
      longitude: '',
      latitude: '',
      fatherName: '',
      motherName: '',
      fatherId: '',
      motherId: '',
      spouseList: [],
      generationName: '',
      bio: '',
      avatar: '',
      photos: []
    },
    showParentPicker: false,
    parentPickerType: 'father',
    parentKeyword: '',
    parentCandidates: [],
    parentDuplicateTip: '',
    parentHasMore: false,
    parentLoading: false
  },

  onLoad(options) {
    if (options.edit) {
      this._editId = options.id;
      this.setData({ isEdit: true });
      // 加载编辑数据
      this.loadEditData(options.id);
    }
    // 从家族树"添加子女"进入：预填父亲与代数（fatherId 由节点弹窗传入）
    if (options.fatherId) {
      this.setData({
        'form.fatherId': options.fatherId,
        'form.generation': Number(options.generation) || 1
      });
      this.loadFatherName(options.fatherId);
    }
  },

  /** 根据 fatherId 加载父亲姓名用于回显 */
  loadFatherName(fatherId) {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      familyMember.getById(familyId, fatherId)
        .then((row) => {
          if (row && row.name) {
            this.setData({ 'form.fatherName': row.name });
          }
        })
        .catch(() => {});
    }
  },

  loadEditData(id) {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      // 同时加载全量成员用于回显父/母姓名
      Promise.all([
        familyMember.getById(familyId, id),
        familyMember.getAll(familyId)
      ])
        .then(([row, all]) => {
          const m = normalizeMember(row);
          const nameMap = {};
          (all || []).forEach(member => {
            nameMap[member.id] = member.name;
          });
          const fatherName = m.fatherId ? (nameMap[m.fatherId] || '已选择') : '';
          // 母亲为父亲配偶时 motherId 存 rank 序号，需按配偶列表解析姓名
          const resolveMotherName = () => {
            if (!m.motherId) return Promise.resolve('');
            if (m.fatherId) {
              return familyMember.getFatherSpouses(familyId, m.fatherId)
                .then((spouses) => {
                  const sp = (spouses || []).find(s => String(s.rank) === String(m.motherId));
                  return sp ? sp.name : (nameMap[m.motherId] || '已选择');
                })
                .catch(() => nameMap[m.motherId] || '已选择');
            }
            return Promise.resolve(nameMap[m.motherId] || '已选择');
          };
          resolveMotherName().then((motherName) => {
            this.setData({
              'form.name': m.name,
              'form.gender': m.gender || 'male',
              'form.generation': m.generation || 1,
              'form.birthDate': m.birthDate,
              'form.birthPlace': m.birthPlace,
              'form.isAlive': m.isAlive,
              'form.deathDate': m.deathDate,
              'form.deathPlace': m.deathPlace,
              'form.longitude': m.longitude != null ? String(m.longitude) : '',
              'form.latitude': m.latitude != null ? String(m.latitude) : '',
              'form.generationName': m.generationName,
              'form.bio': m.bio,
              'form.avatar': m.avatar || '',
              'form.fatherId': m.fatherId || '',
              'form.motherId': m.motherId || '',
              'form.fatherName': fatherName,
              'form.motherName': motherName,
              'form.photos': m.photos || [],
              'form.spouseList': parseSpouseList(row.spouse_info)
            });
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
      'form.name': '朱太公',
      'form.gender': 'male',
      'form.birthDate': '1880-03-15',
      'form.birthPlace': '山东省济南市',
      'form.isAlive': false,
      'form.deathDate': '1955-08-20',
      'form.generationName': ''
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

  /** 配偶字段输入（data-index 定位数组项） */
  spouseInputChange(e) {
    const index = e.currentTarget.dataset.index;
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.spouseList[${index}].${field}`]: e.detail.value
    });
  },

  /** 配偶日期选择（data-index 定位数组项） */
  spouseDateChange(e) {
    const index = e.currentTarget.dataset.index;
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.spouseList[${index}].${field}`]: e.detail.value
    });
  },

  /** 配偶在世状态切换（去世后展示墓茔信息填写） */
  spouseToggleAlive(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      [`form.spouseList[${index}].isAlive`]: e.detail.value ? 1 : 0
    });
  },

  /** 添加一位配偶：自动折叠已有配偶（保留数据），新增的默认展开 */
  addSpouse() {
    const spouseList = this.data.form.spouseList.map(s => ({ ...s, collapsed: true }));
    spouseList.push({
      name: '', birthDate: '', isAlive: 1, deathDate: '', deathPlace: '',
      longitude: '', latitude: '', bio: '', collapsed: false
    });
    this.setData({ 'form.spouseList': spouseList });
  },

  /** 删除指定配偶 */
  removeSpouse(e) {
    const index = e.currentTarget.dataset.index;
    const spouseList = this.data.form.spouseList.filter((_, i) => i !== index);
    this.setData({ 'form.spouseList': spouseList });
  },

  /** 展开/收起指定配偶表单（仅切换折叠状态，不影响已录入数据） */
  toggleSpouseCollapse(e) {
    const index = e.currentTarget.dataset.index;
    const collapsed = !this.data.form.spouseList[index].collapsed;
    this.setData({
      [`form.spouseList[${index}].collapsed`]: collapsed
    });
  },

  toggleAlive(e) {
    this.setData({ 'form.isAlive': e.detail.value });
  },

  /** 代数输入：变更后清空父/母选择（不同代数对应的上一代不同） */
  generationInput(e) {
    const value = e.detail.value;
    const gen = parseInt(value, 10);
    this.setData({
      'form.generation': value,
      'form.fatherId': '',
      'form.fatherName': '',
      'form.motherId': '',
      'form.motherName': ''
    });
    if (gen >= 2) {
      wx.showToast({ title: '请选择父亲', icon: 'none' });
    }
  },

  /** 打开父亲/母亲候选选择弹层 */
  selectParent(e) {
    const type = e.currentTarget.dataset.type;
    const gen = Number(this.data.form.generation) || 1;
    if (type === 'father') {
      if (gen < 2) {
        wx.showToast({ title: '第1代成员不能选择父亲', icon: 'none' });
        return;
      }
      // 重置分页状态后加载第一页
      this._parentPage = 0;
      this._parentLoaded = 0;
      this.setData({ showParentPicker: true, parentPickerType: 'father', parentKeyword: '', parentCandidates: [], parentDuplicateTip: '', parentHasMore: false });
      this.loadFatherCandidates('', false);
    } else {
      const fatherId = this.data.form.fatherId;
      if (!fatherId) {
        wx.showToast({ title: '请先选择父亲', icon: 'none' });
        return;
      }
      this.setData({ showParentPicker: true, parentPickerType: 'mother', parentKeyword: '', parentCandidates: [] });
      this.loadMotherCandidates(fatherId);
    }
  },

  closeParentPicker() {
    this.setData({ showParentPicker: false, parentCandidates: [], parentDuplicateTip: '', parentHasMore: false, parentLoading: false });
  },

  /** 父亲候选关键字搜索（防抖） */
  parentKeywordInput(e) {
    const keyword = e.detail.value;
    this.setData({ parentKeyword: keyword });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.loadFatherCandidates(keyword);
    }, 300);
  },

  /** 加载父亲候选（分页；空关键字返回全部；显示"爷爷姓名之子 + 配偶"供同名区分） */
  loadFatherCandidates(keyword, append) {
    const familyId = (app.globalData.currentFamily || {}).id;
    const gen = Number(this.data.form.generation) || 1;
    if (!familyId || gen < 2 || this.data.parentLoading) return;
    const page = append ? (this._parentPage || 1) + 1 : 1;
    this._parentPage = page;
    this.setData({ parentLoading: true });
    familyMember.getFatherCandidates(familyId, { generation: gen, keyword: keyword || '', page: page })
      .then((res) => {
        const items = (res && res.list) || [];
        const total = Number((res && res.total) || 0);
        this._parentLoaded = append ? (this._parentLoaded || 0) + items.length : items.length;
        const candidates = items.map(r => {
          // 副标题优先显示"爷爷姓名之子"（父子链锚点）；爷爷未知时回退字辈/代数
          const subParts = [];
          if (r.father_name) {
            subParts.push(r.father_name + '之子');
          } else {
            if (r.generation_name) subParts.push(r.generation_name + '字辈');
            subParts.push(r.generation + '代');
          }
          const extraParts = [];
          if (r.spouse_names) extraParts.push('配偶：' + r.spouse_names);
          return {
            id: r.id,
            name: r.name,
            sub: subParts.join(' · '),
            extra: extraParts.join(' ｜ ')
          };
        });
        const merged = append ? this.data.parentCandidates.concat(candidates) : candidates;
        // 同名提醒：出现同名候选时提示用户核对爷爷/配偶信息
        const nameCount = {};
        merged.forEach(c => {
          nameCount[c.name] = (nameCount[c.name] || 0) + 1;
        });
        const hasDuplicate = Object.keys(nameCount).some(n => nameCount[n] > 1);
        this.setData({
          parentCandidates: merged,
          parentHasMore: this._parentLoaded < total,
          parentDuplicateTip: hasDuplicate ? '存在同名成员，请核对爷爷/配偶信息后选择' : ''
        });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '加载候选失败', icon: 'none' });
      })
      .finally(() => {
        this.setData({ parentLoading: false });
      });
  },

  /** 候选列表上拉触底：加载更多（首页未满时无更多，自动跳过） */
  onParentScrollLower() {
    if (this.data.parentHasMore && !this.data.parentLoading) {
      this.loadFatherCandidates(this.data.parentKeyword, true);
    }
  },

  /** 加载候选母亲（所选父亲的配偶列表，motherId 存配偶 rank 序号） */
  loadMotherCandidates(fatherId) {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (!familyId) return;
    familyMember.getFatherSpouses(familyId, fatherId)
      .then((list) => {
        const candidates = (list || []).map(s => ({
          id: String(s.rank),
          name: s.name,
          sub: '',
          extra: s.isAlive ? '' : '已故'
        }));
        this.setData({ parentCandidates: candidates });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '加载候选失败', icon: 'none' });
      });
  },

  /** 选中候选父/母 */
  pickParent(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.parentCandidates[index];
    if (!item) return;
    if (this.data.parentPickerType === 'father') {
      // 更换父亲后需重新选择母亲
      this.setData({
        'form.fatherId': item.id,
        'form.fatherName': item.name,
        'form.motherId': '',
        'form.motherName': '',
        showParentPicker: false,
        parentCandidates: []
      });
    } else {
      this.setData({
        'form.motherId': item.id,
        'form.motherName': item.name,
        showParentPicker: false,
        parentCandidates: []
      });
    }
  },

  choosePhoto() {
    const remain = 9 - (this.data.form.photos || []).length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传9张照片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remain,
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

  /** 选择头像（单张） */
  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = (res.tempFiles || [])[0]?.tempFilePath;
        if (path) {
          this.setData({ 'form.avatar': path });
        }
      }
    });
  },

  /** 清除头像 */
  removeAvatar() {
    this.setData({ 'form.avatar': '' });
  },

  submitForm() {
    const form = this.data.form;
    if (!form.name || !form.name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }
    if (form.name.trim().length > 50) {
      wx.showToast({ title: '姓名不能超过50个字符', icon: 'none' });
      return;
    }
    if (form.generationName && !this.validateGenerationName(form.generationName)) {
      wx.showToast({ title: '字辈只能为1-10个中文汉字', icon: 'none' });
      return;
    }
    const gen = Number(form.generation) || 0;
    if (!Number.isInteger(gen) || gen < 1) {
      wx.showToast({ title: '代数必须为正整数', icon: 'none' });
      return;
    }
    if (gen === 1 && form.fatherId) {
      wx.showToast({ title: '第1代成员不能选择父亲', icon: 'none' });
      return;
    }
    if (gen >= 2 && !form.fatherId) {
      wx.showToast({ title: '第2代及以上成员请先选择父亲', icon: 'none' });
      return;
    }
    // 墓茔坐标合法性（经度 -180~180，纬度 -90~90；空值跳过，非法格式拦截）
    const longitude = this.parseCoordinate(form.longitude);
    const latitude = this.parseCoordinate(form.latitude);
    if (longitude !== undefined && (Number.isNaN(longitude) || longitude < -180 || longitude > 180)) {
      wx.showToast({ title: '经度需在-180到180之间', icon: 'none' });
      return;
    }
    if (latitude !== undefined && (Number.isNaN(latitude) || latitude < -90 || latitude > 90)) {
      wx.showToast({ title: '纬度需在-90到90之间', icon: 'none' });
      return;
    }
    // 配偶信息清洗与校验（支持多配偶；去世配偶才保留墓茔信息，在世配偶墓茔字段置空）
    const spouseList = (form.spouseList || [])
      .map(s => {
        const alive = s.isAlive === 0 ? 0 : 1;
        return {
          name: (s.name || '').trim(),
          birthDate: s.birthDate || '',
          isAlive: alive,
          deathDate: alive === 0 ? (s.deathDate || '') : '',
          deathPlace: alive === 0 ? (s.deathPlace || '') : '',
          longitude: alive === 0 ? this.parseCoordinate(s.longitude) : null,
          latitude: alive === 0 ? this.parseCoordinate(s.latitude) : null,
          bio: s.bio || ''
        };
      })
      .filter(s => s.name);
    for (let i = 0; i < spouseList.length; i++) {
      const sp = spouseList[i];
      const label = '第' + (i + 1) + '位配偶';
      if (sp.name.length > 50) {
        wx.showToast({ title: label + '姓名不能超过50个字符', icon: 'none' });
        return;
      }
      if (sp.isAlive === 0) {
        if (sp.longitude !== undefined && (Number.isNaN(sp.longitude) || sp.longitude < -180 || sp.longitude > 180)) {
          wx.showToast({ title: label + '经度需在-180到180之间', icon: 'none' });
          return;
        }
        if (sp.latitude !== undefined && (Number.isNaN(sp.latitude) || sp.latitude < -90 || sp.latitude > 90)) {
          wx.showToast({ title: label + '纬度需在-90到90之间', icon: 'none' });
          return;
        }
      }
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
      // 本地临时照片先逐张上传,拿到 URL 后随成员一起提交；头像同理（单张）
      const tempPhotos = (form.photos || []).filter(p => this.isLocalTempFile(p));
      const readyPhotos = (form.photos || []).filter(p => !this.isLocalTempFile(p));
      const avatarTemp = form.avatar && this.isLocalTempFile(form.avatar) ? form.avatar : '';
      const avatarReady = form.avatar && !this.isLocalTempFile(form.avatar) ? form.avatar : '';
      const uploadTasks = tempPhotos.map(p => this.uploadImage(p, 'photo'));
      if (avatarTemp) uploadTasks.push(this.uploadImage(avatarTemp, 'member_avatar'));
      Promise.all(uploadTasks)
        .then((results) => {
          const photoUrls = results.slice(0, tempPhotos.length);
          const avatarUrl = avatarTemp ? results[results.length - 1] : (avatarReady || '');
          // 配偶信息以数组提交（与后端 spouse_info JSON 数组结构一致，支持多配偶）
          const payload = {
            name: form.name.trim(),
            gender: form.gender,
            generation: gen,
            generationName: form.generationName.trim(),
            birthDate: form.birthDate || '',
            birthPlace: form.birthPlace || '',
            isAlive: form.isAlive ? 1 : 0,
            deathDate: form.deathDate || '',
            deathPlace: form.deathPlace || '',
            longitude: longitude,
            latitude: latitude,
            bio: form.bio || '',
            fatherId: form.fatherId || '',
            motherId: form.motherId || '',
            spouseInfo: spouseList,
            avatarUrl: avatarUrl || undefined,
            photos: readyPhotos.concat(photoUrls)
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

  /** 解析墓茔坐标（空值返回 undefined，非法返回 NaN 由调用方校验范围） */
  parseCoordinate(value) {
    if (value === '' || value == null) return undefined;
    const num = Number(value);
    return Number.isNaN(num) ? NaN : num;
  },

  /** 判断是否为本地临时文件：已上传资源(/uploads/)与真实远程 URL 视为就绪，其余(含微信 http://tmp/、wxfile://)需上传 */
  isLocalTempFile(path) {
    if (!path || typeof path !== 'string') return false;
    if (/^\/uploads\//.test(path)) return false; // 已上传到服务器的资源
    if (/^https?:\/\/(?!tmp\/)/.test(path)) return false; // 真实远程 URL；http://tmp/ 是微信临时文件
    return true; // 本地临时文件（wxfile:// 等）
  },

  /** 上传图片到后端,返回可访问 URL；bizType 用于存储额度记账分类 */
  uploadImage(filePath, bizType) {
    return new Promise((resolve, reject) => {
      const familyId = (app.globalData.currentFamily || {}).id;
      wx.uploadFile({
        url: API_BASE_URL + '/common/upload',
        filePath: filePath,
        name: 'file',
        header: { Authorization: 'Bearer ' + getToken() },
        formData: familyId ? { familyId: String(familyId), bizType: bizType || 'photo' } : {},
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
