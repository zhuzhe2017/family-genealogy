const app = getApp();
const { gathering } = require('../../utils/api');

Page({
  data: {
    familyId: 0,
    id: 0,
    isEdit: false,
    form: {
      title: '',
      location: '',
      addressDetail: '',
      description: '',
      capacity: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      deadlineDate: '',
      deadlineTime: ''
    },
    sessions: [],
    agenda: []
  },

  onLoad(options) {
    const family = app.globalData.currentFamily || {};
    const id = Number(options.id) || 0;
    this.setData({ familyId: Number(family.id) || 0, id, isEdit: id > 0 });
    if (id > 0) {
      wx.setNavigationBarTitle({ title: '编辑聚会' });
      this.loadDetail(id);
    } else {
      wx.setNavigationBarTitle({ title: '发布聚会' });
    }
  },

  loadDetail(id) {
    wx.showLoading({ title: '加载中' });
    gathering.getDetail(this.data.familyId, id)
      .then((d) => {
        wx.hideLoading();
        this.setData({
          form: {
            title: d.title || '',
            location: d.location || '',
            addressDetail: d.addressDetail || '',
            description: d.description || '',
            capacity: d.capacity ? String(d.capacity) : '',
            ...this.splitTime(d.startTime, 'start'),
            ...this.splitTime(d.endTime, 'end'),
            ...this.splitTime(d.signupDeadline, 'deadline')
          },
          sessions: (d.sessions || []).map((s) => Object.assign(
            { id: s.id, name: s.name, capacity: s.capacity ? String(s.capacity) : '' },
            this.splitTime(s.startTime, 'start'),
            this.splitTime(s.endTime, 'end')
          )),
          agenda: (d.agenda || []).map((a) => ({ time: a.time || '', item: a.item || '', remark: a.remark || '' }))
        });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  /** 'YYYY-MM-DD HH:mm' → { XDate: 'YYYY-MM-DD', XTime: 'HH:mm' } */
  splitTime(v, prefix) {
    if (!v) return { [prefix + 'Date']: '', [prefix + 'Time']: '' };
    const s = String(v);
    return {
      [prefix + 'Date']: s.substring(0, 10),
      [prefix + 'Time']: s.length > 10 ? s.substring(11, 16) : ''
    };
  },

  /** 组装 'YYYY-MM-DD HH:mm'（缺少部分返回空） */
  joinTime(date, time) {
    return date && time ? date + ' ' + time : (date || '');
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ['form.' + key]: e.detail.value });
  },

  onDateChange(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ['form.' + key]: e.detail.value });
  },

  onTimeChange(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ['form.' + key]: e.detail.value });
  },

  // ============ 场次 ============
  onSessionInput(e) {
    const idx = e.currentTarget.dataset.index;
    const key = e.currentTarget.dataset.key;
    this.setData({ ['sessions[' + idx + '].' + key]: e.detail.value });
  },

  onSessionDate(e) {
    const idx = e.currentTarget.dataset.index;
    const key = e.currentTarget.dataset.key;
    this.setData({ ['sessions[' + idx + '].' + key]: e.detail.value });
  },

  onSessionTime(e) {
    const idx = e.currentTarget.dataset.index;
    const key = e.currentTarget.dataset.key;
    this.setData({ ['sessions[' + idx + '].' + key]: e.detail.value });
  },

  addSession() {
    this.setData({
      sessions: this.data.sessions.concat([{ id: 0, name: '', capacity: '', startDate: '', startTime: '', endDate: '', endTime: '' }])
    });
  },

  removeSession(e) {
    const idx = e.currentTarget.dataset.index;
    const sessions = this.data.sessions.slice();
    sessions.splice(idx, 1);
    this.setData({ sessions });
  },

  // ============ 议程 ============
  onAgendaInput(e) {
    const idx = e.currentTarget.dataset.index;
    const key = e.currentTarget.dataset.key;
    this.setData({ ['agenda[' + idx + '].' + key]: e.detail.value });
  },

  addAgenda() {
    this.setData({ agenda: this.data.agenda.concat([{ time: '', item: '', remark: '' }]) });
  },

  removeAgenda(e) {
    const idx = e.currentTarget.dataset.index;
    const agenda = this.data.agenda.slice();
    agenda.splice(idx, 1);
    this.setData({ agenda });
  },

  // ============ 提交 ============
  buildPayload() {
    const f = this.data.form;
    return {
      title: f.title.trim(),
      location: f.location.trim(),
      addressDetail: f.addressDetail.trim(),
      description: f.description.trim(),
      capacity: f.capacity ? Number(f.capacity) : 0,
      startTime: this.joinTime(f.startDate, f.startTime),
      endTime: this.joinTime(f.endDate, f.endTime),
      signupDeadline: this.joinTime(f.deadlineDate, f.deadlineTime),
      sessions: this.data.sessions.map((s) => ({
        id: s.id || undefined,
        name: s.name.trim(),
        capacity: s.capacity ? Number(s.capacity) : 0,
        startTime: this.joinTime(s.startDate, s.startTime),
        endTime: this.joinTime(s.endDate, s.endTime)
      })),
      agenda: this.data.agenda.filter((a) => a.item.trim()).map((a) => ({
        time: a.time.trim(),
        item: a.item.trim(),
        remark: a.remark.trim()
      }))
    };
  },

  submit(e) {
    const publish = e.currentTarget.dataset.publish === '1';
    const payload = this.buildPayload();
    if (!payload.title) {
      wx.showToast({ title: '请填写聚会名称', icon: 'none' });
      return;
    }
    if (publish && !payload.startTime) {
      wx.showToast({ title: '请填写聚会开始时间', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中' });
    const done = () => {
      wx.hideLoading();
      wx.showToast({ title: publish ? '已发布' : '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    };
    if (this.data.isEdit) {
      gathering.update(this.data.familyId, this.data.id, payload)
        .then(() => {
          // 编辑后点「发布」：流转为已发布（updateStatus 幂等，已发布时直接返回成功）
          if (publish) {
            return gathering.updateStatus(this.data.familyId, this.data.id, 1).then(done);
          }
          done();
        })
        .catch((err) => {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
        });
    } else {
      gathering.create(this.data.familyId, Object.assign({}, payload, { status: publish ? 1 : 0 }))
        .then(done)
        .catch((err) => {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
        });
    }
  }
});
