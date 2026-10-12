const app = getApp();
const { content } = require('../../utils/api');
const { normalizeEvent, resolveImageUrls } = require('../../utils/format');
const { getToken } = require('../../utils/request');

Page({
  data: {
    event: {},
    loading: true,
    loadFailed: false
  },

  onLoad(options) {
    const eventId = options.id;
    this.loadEvent(eventId);
  },

  /** 加载事件详情:优先走后端 API;失败仅提示,不回退演示数据 */
  loadEvent(id) {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (getToken() && familyId) {
      this.setData({ loading: true, loadFailed: false });
      content.getById('event', id)
        .then((row) => {
          const base = normalizeEvent(row);
          this.setData({ event: this.assembleEvent(base, row), loading: false });
        })
        .catch((err) => {
          console.error('事件详情加载失败', err);
          this.setData({ loading: false, loadFailed: true });
        });
    } else {
      // 未登录/未选择家族:显示加载失败占位
      this.setData({ event: {}, loading: false, loadFailed: true });
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
      // 仅家族创建者/管理员可编辑删除
      canEdit: !!r.canEdit
    });
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
    if (!getToken()) {
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
    if (!getToken()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除确认',
      content: '确定删除该事件吗？删除后不可恢复。',
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (!res.confirm) return;
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
