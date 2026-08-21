const app = getApp();
const { content } = require('../../utils/api');
const { normalizeEvent } = require('../../utils/format');
const { USE_MOCK } = require('../../utils/config');
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

  /** 加载家族事件:优先走后端 API,失败回退 mock */
  loadEvents() {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      content.getList('event', { familyId: familyId, page: 1, pageSize: 100 })
        .then((res) => {
          this.renderEvents((res.list || []).map(normalizeEvent));
        })
        .catch((err) => {
          console.error('事件加载失败,使用 mock', err);
          this.renderEvents(this.getMockEvents());
        });
    } else {
      this.renderEvents(this.getMockEvents());
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

  getMockEvents() {
    return [
      { id: 1, year: 1880, month: 3, day: 15, title: '朱太公出生', description: '家族始祖朱太公出生于山东省济南市', type: 'birth', typeName: '出生', relatedMembers: [{ id: '1', name: '朱太公' }] },
      { id: 2, year: 1900, month: 5, day: 20, title: '朱太公与朱太婆成婚', description: '朱太公迎娶朱太婆，开启家族新篇章', type: 'marriage', typeName: '婚嫁', relatedMembers: [{ id: '1', name: '朱太公' }, { id: '2', name: '朱太婆' }] },
      { id: 3, year: 1910, month: 8, day: 10, title: '朱大出生', description: '长子朱大出生', type: 'birth', typeName: '出生', relatedMembers: [{ id: '3', name: '朱大' }] },
      { id: 4, year: 1912, month: 2, day: 28, title: '朱二出生', description: '次子朱二出生', type: 'birth', typeName: '出生', relatedMembers: [{ id: '4', name: '朱二' }] },
      { id: 5, year: 1915, month: 11, day: 5, title: '朱三出生', description: '三子朱三出生', type: 'birth', typeName: '出生', relatedMembers: [{ id: '5', name: '朱三' }] },
      { id: 6, year: 1940, month: 6, day: 18, title: '朱强出生', description: '朱大的长子朱强出生', type: 'birth', typeName: '出生', relatedMembers: [{ id: '6', name: '朱强' }] },
      { id: 7, year: 1955, month: 8, day: 20, title: '朱太公逝世', description: '家族始祖朱太公享年75岁', type: 'death', typeName: '逝世', relatedMembers: [{ id: '1', name: '朱太公' }] },
      { id: 8, year: 1966, month: 4, day: 1, title: '家族祠堂重建', description: '族人集资重建家族祠堂', type: 'other', typeName: '其他', relatedMembers: [] },
      { id: 9, year: 1980, month: 9, day: 10, title: '首届家族聚会', description: '改革开放后首次大规模家族聚会', type: 'other', typeName: '其他', relatedMembers: [] },
      { id: 10, year: 2024, month: 1, day: 15, title: '数字家谱上线', description: '家族数字化建设启动', type: 'other', typeName: '其他', relatedMembers: [] }
    ];
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
