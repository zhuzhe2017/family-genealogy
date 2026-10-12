const app = getApp();
const { content } = require('../../utils/api');
const { normalizeEvent } = require('../../utils/format');
const { getToken } = require('../../utils/request');

Page({
  data: {
    activeFilter: 'all',
    groupedEvents: [],
    allEvents: []
  },

  onShow() {
    // 每次进入/返回本页刷新(新增/编辑/删除事件后回到列表能看到最新)
    this.loadEvents();
  },

  /** 加载家族事件:优先走后端 API,失败/未登录显示空态 */
  loadEvents() {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (getToken() && familyId) {
      content.getList('event', { familyId: familyId, page: 1, pageSize: 100 })
        .then((res) => {
          this.renderEvents((res.list || []).map(normalizeEvent));
        })
        .catch((err) => {
          console.error('事件加载失败', err);
          this.renderEvents([]);
        });
    } else {
      this.renderEvents([]);
    }
  },

  /** 渲染:缓存全量数据并按年份分组 */
  renderEvents(events) {
    // 后端事件无 relatedMembers 字段,补空数组避免 WXML undefined.length 报错
    const normalized = events.map(e => Object.assign({ relatedMembers: [] }, e));
    const grouped = {};
    normalized.forEach(e => {
      if (!grouped[e.year]) grouped[e.year] = [];
      grouped[e.year].push(e);
    });

    const groupedEvents = Object.keys(grouped)
      .sort((a, b) => Number(b) - Number(a))
      .map(year => ({
        year: year,
        events: grouped[year].sort((a, b) => b.month - a.month || b.day - a.day)
      }));

    this.setData({ allEvents: normalized, groupedEvents });
  },

  /** 按事件类型筛选 */
  filterEvents(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ activeFilter: type });
    if (type === 'all') {
      this.renderEvents(this.data.allEvents);
      return;
    }
    this.renderEvents(this.data.allEvents.filter(ev => ev.type === type));
  },

  viewEvent(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/event-detail/event-detail?id=${id}`
    });
  },

  /** 添加事件:跳转编辑页 */
  addEvent() {
    wx.navigateTo({
      url: '/pages/add-event/add-event'
    });
  }
});
