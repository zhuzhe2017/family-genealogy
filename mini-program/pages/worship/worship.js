const app = getApp();
const { worship } = require('../../utils/api');
const { getToken } = require('../../utils/request');

/** 各祭祀类型的默认展示文案（记录无内容时兜底） */
const TYPE_LABELS = {
  incense: '为祖先上香祈福',
  pray: '为家族祈福',
  offer: '献上祭品',
  wish: '许下心愿'
};

Page({
  data: {
    familyId: null,
    loading: true,      // 首屏加载中
    needLogin: false,   // 未登录:引导登录
    loadFailed: false,  // 请求失败:显示重试提示
    incenseCount: 0,
    prayCount: 0,
    offerCount: 0,
    wishCount: 0,
    records: [],
    submitting: false,  // 提交防抖:防止连点重复写入
    memorials: [],      // 纪念对象列表
    memorialLoading: false,   // 纪念列表加载中
    showMemberPicker: false,  // 已故成员选择弹层
    memberPickerLoading: false,
    memorialCandidates: [],   // 可创建纪念的已故成员
    memorialSubmitting: false, // 创建纪念防抖
    reminders: [],        // 纪念日/生日提醒列表
    reminderLoading: false,   // 提醒加载中
    reminderLocked: false     // 未开通 reminder 权益:显示开通引导
  },

  onLoad() {
    const family = app.globalData.currentFamily || {};
    this.setData({ familyId: family.id || null });
  },

  onShow() {
    const family = app.globalData.currentFamily || {};
    this.setData({ familyId: family.id || null });
    this.loadSummary();
    this.loadMemorials();
    this.loadReminders();
  },

  /** 加载纪念日/生日提醒（reminder 权益；未开通时显示开通引导） */
  loadReminders() {
    const familyId = this.data.familyId;
    if (!getToken() || !familyId) return;
    this.setData({ reminderLoading: true, reminderLocked: false });
    worship.getReminders(familyId, 30)
      .then((res) => {
        const list = (res && res.list) || [];
        this.setData({
          reminders: list.map((r) => ({
            memberId: r.memberId,
            memberName: r.memberName || '先祖',
            type: r.remindType,
            date: r.date || '',
            daysUntil: r.daysUntil,
            desc: r.desc || ''
          })),
          reminderLoading: false,
          reminderLocked: false
        });
      })
      .catch((err) => {
        console.error('纪念日提醒加载失败', err);
        // 权益受限(4001/4004)由全局引导处理,此处仅展示开通引导位;其他错误静默
        this.setData({ reminderLoading: false, reminderLocked: true, reminders: [] });
      });
  },

  /** 纪念日提醒未开通:跳转会员中心开通 */
  goMemberCenter() {
    wx.navigateTo({ url: '/pages/member-center/member-center' });
  },

  /** 加载纪念对象列表 */
  loadMemorials() {
    const familyId = this.data.familyId;
    if (!getToken() || !familyId) return;
    this.setData({ memorialLoading: true });
    worship.getMemorials(familyId)
      .then((list) => {
        this.setData({ memorials: (list || []).map((m) => this.toMemorialItem(m)), memorialLoading: false });
      })
      .catch((err) => {
        console.error('纪念对象加载失败', err);
        this.setData({ memorialLoading: false });
      });
  },

  /** 后端纪念条目 → 页面对象（生卒区间展示） */
  toMemorialItem(m) {
    const life = [m.birthDate, m.deathDate].filter(Boolean).join(' - ');
    return {
      id: m.id,
      memberId: m.memberId,
      memberName: m.memberName || '先祖',
      avatarUrl: m.avatarUrl || '',
      epitaph: m.epitaph || '',
      life: life || '生卒不详'
    };
  },

  /** 祈福记录「查看更多」：跳转记录分页页 */
  goMoreRecords() {
    if (!getToken() || !this.data.familyId) {
      wx.showToast({ title: '请先加入家族', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/worship-records/worship-records?familyId=' + this.data.familyId });
  },

  /** 纪念卡片点击：跳转纪念详情页 */
  goMemorialDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/memorial-detail/memorial-detail?id=' + id + '&familyId=' + this.data.familyId });
  },

  /** 加载祭祀页面汇总（今日统计 + 最近记录） */
  loadSummary() {
    const familyId = this.data.familyId;

    // 未登录:引导登录,不展示假数据
    if (!getToken()) {
      this.setData({ needLogin: true, loading: false, loadFailed: false });
      return;
    }
    // 未选择家族
    if (!familyId) {
      this.setData({ needLogin: false, loading: false, loadFailed: true });
      return;
    }

    // 已有数据时刷新不闪加载态
    this.setData({ needLogin: false, loading: this.data.records.length === 0, loadFailed: false });

    worship.getSummary(familyId)
      .then((res) => {
        const stats = res.stats || {};
        this.setData({
          incenseCount: stats.incenseCount || 0,
          prayCount: stats.prayCount || 0,
          offerCount: stats.offerCount || 0,
          wishCount: stats.wishCount || 0,
          records: (res.records || []).map((r) => this.toRecordItem(r)),
          loading: false,
          loadFailed: false
        });
      })
      .catch((err) => {
        console.error('祭祀数据加载失败', err);
        this.setData({ loading: false, loadFailed: true });
      });
  },

  /** 后端记录条目 → 页面对象（相对时间 + 内容兜底） */
  toRecordItem(r) {
    return {
      id: r.id,
      userName: r.userName || '族人',
      time: this.relativeTime(r.createTime),
      content: r.content || TYPE_LABELS[r.type] || '参与祭祀祈福',
      type: r.type
    };
  },

  /**
   * 通用提交：上香/祈福/献祭/许愿
   * 提交前校验登录与家族归属，成功后用服务端返回的最新统计原子刷新
   */
  submitAction(type, content) {
    const familyId = this.data.familyId;
    if (this.data.submitting) return;

    if (!getToken()) {
      this.guideLogin();
      return;
    }
    if (!familyId) {
      wx.showToast({ title: '请先加入家族再参与祭祀', icon: 'none', duration: 2500 });
      return;
    }

    this.setData({ submitting: true });
    worship.createRecord({ familyId, type, content: content || '' })
      .then((res) => {
        const stats = res.stats || {};
        const patch = {
          incenseCount: stats.incenseCount || 0,
          prayCount: stats.prayCount || 0,
          offerCount: stats.offerCount || 0,
          wishCount: stats.wishCount || 0
        };
        if (res.record) {
          patch.records = [this.toRecordItem(res.record), ...this.data.records];
        }
        this.setData(patch);
        wx.showToast({ title: this.successText(type), icon: 'success' });
      })
      .catch((err) => {
        console.error('祭祀提交失败', err);
        wx.showToast({ title: (err && err.message) || '操作失败，请重试', icon: 'none', duration: 2500 });
      })
      .then(() => {
        this.setData({ submitting: false });
      });
  },

  successText(type) {
    const texts = { incense: '上香成功', pray: '祈福成功', offer: '献祭成功', wish: '许愿成功' };
    return texts[type] || '操作成功';
  },

  /** 上香：先确认再提交 */
  burnIncense() {
    wx.showModal({
      title: '上香祈福',
      content: '您确定要为祖先上香吗？',
      success: (res) => {
        if (res.confirm) {
          this.submitAction('incense');
        }
      }
    });
  },

  /** 祈福：与上香一致，确认后提交，避免误触 */
  pray() {
    wx.showModal({
      title: '祈福',
      content: '为家族祈福，愿祖先保佑子孙平安顺遂？',
      success: (res) => {
        if (res.confirm) {
          this.submitAction('pray');
        }
      }
    });
  },

  /** 献祭：选择祭品后提交（所选祭品写入记录内容） */
  offerGift() {
    const gifts = ['鲜花', '水果', '香烛', '纸钱'];
    wx.showActionSheet({
      itemList: gifts,
      success: (res) => {
        this.submitAction('offer', gifts[res.tapIndex] || '');
      }
    });
  },

  /** 许愿：填写心愿内容后提交 */
  writeWish() {
    wx.showModal({
      title: '写下心愿',
      editable: true,
      placeholderText: '请输入您的心愿...',
      success: (res) => {
        if (res.confirm && res.content) {
          this.submitAction('wish', res.content);
        }
      }
    });
  },

  /** 未登录引导 */
  guideLogin() {
    wx.showModal({
      title: '未登录',
      content: '登录后可参与家族祭祀祈福',
      confirmText: '去登录',
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/login/login' });
        }
      }
    });
  },

  /** 后端时间字符串 → 相对时间（iOS 需将空格替换为 T 才能解析） */
  relativeTime(time) {
    if (!time) return '';
    const date = new Date(String(time).replace(' ', 'T'));
    if (isNaN(date.getTime())) return String(time).substring(0, 10);
    const diff = Date.now() - date.getTime();
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 7 * 24 * 60 * 60 * 1000) return Math.floor(diff / 86400000) + '天前';
    return String(time).substring(0, 10);
  },

  // ==================== 纪念对象（纪念堂） ====================

  /** 打开已故成员选择弹层（创建纪念入口） */
  openMemberPicker() {
    const familyId = this.data.familyId;
    if (!getToken()) {
      this.guideLogin();
      return;
    }
    if (!familyId) {
      wx.showToast({ title: '请先加入家族再创建纪念', icon: 'none', duration: 2500 });
      return;
    }
    this.setData({ showMemberPicker: true, memberPickerLoading: true, memorialCandidates: [] });
    worship.getMemorialCandidates(familyId)
      .then((list) => {
        this.setData({ memorialCandidates: list || [], memberPickerLoading: false });
      })
      .catch((err) => {
        console.error('已故成员加载失败', err);
        this.setData({ memberPickerLoading: false });
        if (!err || !err.entitlement) {
          wx.showToast({ title: (err && err.message) || '加载失败，请重试', icon: 'none' });
        }
      });
  },

  closeMemberPicker() {
    this.setData({ showMemberPicker: false });
  },

  /** 阻止弹层面板点击冒泡到遮罩 */
  noop() {},

  /** 选择已故成员 → 输入纪念寄语 → 创建纪念（消耗 worship_pro 额度） */
  pickCandidate(e) {
    const memberId = e.currentTarget.dataset.memberId;
    const name = e.currentTarget.dataset.name || '该成员';
    wx.showModal({
      title: '为 ' + name + ' 创建纪念',
      editable: true,
      placeholderText: '写下纪念寄语（选填）',
      success: (res) => {
        if (res.confirm) {
          this.createMemorial(memberId, res.content || '');
        }
      }
    });
  },

  createMemorial(memberId, epitaph) {
    const familyId = this.data.familyId;
    if (this.data.memorialSubmitting) return;
    this.setData({ memorialSubmitting: true });
    worship.createMemorial({ familyId, memberId, epitaph: epitaph || '' })
      .then(() => {
        this.setData({ showMemberPicker: false });
        wx.showToast({ title: '纪念创建成功', icon: 'success' });
        this.loadMemorials();
      })
      .catch((err) => {
        console.error('创建纪念失败', err);
        // 额度不足(4003)/未解锁(4001)等由全局权益引导处理，此处仅提示非权益错误
        if (!err || !err.entitlement) {
          wx.showToast({ title: (err && err.message) || '创建失败，请重试', icon: 'none', duration: 2500 });
        }
      })
      .then(() => {
        this.setData({ memorialSubmitting: false });
      });
  },

  /** 删除纪念（仅创建者或家族创建者） */
  deleteMemorial(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || '该纪念';
    if (this.data.memorialSubmitting) return;
    wx.showModal({
      title: '删除纪念',
      content: '确定删除「' + name + '」的纪念吗？删除后需重新消耗额度创建',
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ memorialSubmitting: true });
        worship.deleteMemorial(this.data.familyId, id)
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadMemorials();
          })
          .catch((err) => {
            console.error('删除纪念失败', err);
            wx.showToast({ title: (err && err.message) || '删除失败，请重试', icon: 'none', duration: 2500 });
          })
          .then(() => {
            this.setData({ memorialSubmitting: false });
          });
      }
    });
  }
});
