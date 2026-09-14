const app = getApp();
const { content } = require('../../utils/api');
const { normalizeEvent, resolveImageUrls } = require('../../utils/format');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

Page({
  data: {
    event: {}
  },

  onLoad(options) {
    const eventId = options.id;
    this.loadEvent(eventId);
  },

  /** 加载事件详情:优先走后端 API,失败回退 mock */
  loadEvent(id) {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      content.getById('event', id)
        .then((row) => {
          const base = normalizeEvent(row);
          this.setData({ event: this.assembleEvent(base, row) });
        })
        .catch((err) => {
          console.error('事件详情加载失败,使用 mock', err);
          this.setData({ event: this.getMockEvent(id) });
        });
    } else {
      this.setData({ event: this.getMockEvent(id) });
    }
  },

  /** 装配详情页展示字段（后端附带关联数据,缺失时补空避免 WXML 报错） */
  assembleEvent(base, row) {
    const r = row || {};
    return Object.assign({
      relatedMembers: [],
      photos: [],
      details: [],
      canEdit: false
    }, base, {
      relatedMembers: (r.relatedMembers || []).map(m => ({
        id: m.id,
        name: m.name,
        gender: m.gender || '',
        relation: m.relation || ''
      })),
      photos: resolveImageUrls(r.photos || []),
      details: r.details || [],
      // 仅家族创建者/管理员可编辑删除（mock 模式放开便于本地演示）
      canEdit: USE_MOCK ? true : !!r.canEdit
    });
  },

  getMockEvent(id) {
    return {
      id: id,
      year: 1880,
      month: 3,
      day: 15,
      title: '朱太公出生',
      description: '家族始祖朱太公出生于山东省济南市历城区的一个书香门第。其父为当地知名学者，自幼受到良好教育。朱太公一生勤劳朴实，为家族发展奠定了坚实基础。',
      type: 'birth',
      typeName: '出生',
      details: [
        { label: '出生时间', value: '1880年3月15日' },
        { label: '出生地点', value: '山东省济南市历城区' },
        { label: '父亲', value: '朱老先生' },
        { label: '母亲', value: '朱老夫人' }
      ],
      relatedMembers: [
        { id: '1', name: '朱太公', gender: 'male', relation: '本人' },
        { id: '2', name: '朱太婆', gender: 'female', relation: '配偶' }
      ],
      photos: []
    };
  },

  viewMember(e) {
    const memberId = e.currentTarget.dataset.id;
    const familyId = (app.globalData.currentFamily || {}).id;
    wx.navigateTo({
      url: `/pages/member-detail/member-detail?id=${memberId}${familyId ? '&familyId=' + familyId : ''}`
    });
  },

  previewPhoto(e) {
    const current = e.currentTarget.dataset.src;
    const urls = (this.data.event.photos || []).map(p => p);
    wx.previewImage({ current, urls });
  },

  /** 编辑事件:跳转编辑页 */
  editEvent() {
    const event = this.data.event;
    if (!event.id) return;
    if (!USE_MOCK && !getToken()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/add-event/add-event?id=${event.id}`
    });
  },

  /** 删除事件:确认后软删除并返回 */
  deleteEvent() {
    const event = this.data.event;
    if (!event.id) return;
    if (!USE_MOCK && !getToken()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除确认',
      content: '确定删除该事件吗？删除后不可恢复。',
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (!res.confirm) return;
        if (USE_MOCK || !getToken()) {
          wx.showToast({ title: '删除成功', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 1200);
          return;
        }
        wx.showLoading({ title: '删除中' });
        const familyId = (app.globalData.currentFamily || {}).id;
        content.remove('event', event.id, familyId)
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: '删除成功', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1200);
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
          });
      }
    });
  },

  /** 好友分享:卡片直达本条事件 */
  onShareAppMessage() {
    const event = this.data.event;
    if (event && event.id) {
      return {
        title: `${event.year || ''}年·${event.title}`,
        path: '/pages/event-detail/event-detail?id=' + event.id,
        imageUrl: (event.photos && event.photos[0]) || ''
      };
    }
    return { title: '家族事件', path: '/pages/timeline/timeline' };
  },

  /** 朋友圈分享 */
  onShareTimeline() {
    const event = this.data.event;
    return {
      title: event && event.id ? `${event.year || ''}年·${event.title}` : '家族事件',
      query: event && event.id ? 'id=' + event.id : '',
      imageUrl: (event && event.photos && event.photos[0]) || ''
    };
  }
});
