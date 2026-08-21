const app = getApp();
const { familyMember } = require('../../utils/api');
const { normalizeMember } = require('../../utils/format');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

Page({
  data: {
    totalMembers: 0,
    maleCount: 0,
    femaleCount: 0,
    groupedMembers: [],
    allMembers: [],
    // 自定义导航栏适配（状态栏高度 + 导航栏高度）
    statusBarHeight: 20,
    navBarTotal: 64
  },

  onLoad() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = (win && win.statusBarHeight) || 20;
    this.setData({ statusBarHeight, navBarTotal: statusBarHeight + 44 });
    this.loadMembers();
  },

  /** 返回时置位标记,避免"族成员" tab 入口页再次自动跳转造成循环。
   *  仅物理返回/返回手势(navigateBack 回入口页)需要防循环;
   *  主动回首页(switchTab,不经过入口页)不置位,避免标记残留导致下次点 tab 停在动态页 */
  onUnload() {
    if (this._homeExit) return;
    app.globalData.skipMemberNav = true;
  },

  loadMembers() {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      familyMember.getAll(familyId)
        .then((res) => {
          this.renderMembers((res || []).map(normalizeMember));
        })
        .catch((err) => {
          console.error('成员加载失败,使用 mock', err);
          this.renderMembers(this.getMockMembers());
        });
    } else {
      this.renderMembers(this.getMockMembers());
    }
  },

  getMockMembers() {
    return [
      { id: '1', name: '朱太公', gender: 'male', generation: 1, generationName: '文', birthYear: '1880', spouseInfo: { name: '朱太婆' } },
      { id: '2', name: '朱大', gender: 'male', generation: 2, generationName: '德', birthYear: '1910', spouseInfo: { name: '李氏' } },
      { id: '3', name: '朱二', gender: 'male', generation: 2, generationName: '德', birthYear: '1912', spouseInfo: { name: '王氏' } },
      { id: '4', name: '朱三', gender: 'male', generation: 2, generationName: '德', birthYear: '1915', spouseInfo: { name: '陈氏' } },
      { id: '5', name: '朱强', gender: 'male', generation: 3, generationName: '永', birthYear: '1940', spouseInfo: { name: '刘氏' } },
      { id: '6', name: '朱明', gender: 'male', generation: 3, generationName: '永', birthYear: '1942', spouseInfo: { name: '赵氏' } },
      { id: '7', name: '朱华', gender: 'male', generation: 3, generationName: '永', birthYear: '1945', spouseInfo: { name: '孙氏' } },
      { id: '8', name: '朱丽', gender: 'female', generation: 3, generationName: '永', birthYear: '1948', spouseInfo: { name: '周先生' } },
      { id: '9', name: '朱芳', gender: 'female', generation: 3, generationName: '永', birthYear: '1950', spouseInfo: { name: '吴先生' } },
      { id: '10', name: '朱伟', gender: 'male', generation: 4, generationName: '世', birthYear: '1970', spouseInfo: { name: '郑氏' } },
      { id: '11', name: '朱敏', gender: 'female', generation: 4, generationName: '世', birthYear: '1972', spouseInfo: { name: '王先生' } },
      { id: '12', name: '朱军', gender: 'male', generation: 4, generationName: '世', birthYear: '1975' },
      { id: '13', name: '朱燕', gender: 'female', generation: 4, generationName: '世', birthYear: '1978', spouseInfo: { name: '李先生' } },
      { id: '14', name: '朱鹏', gender: 'male', generation: 4, generationName: '世', birthYear: '1980', spouseInfo: { name: '周氏' } },
      { id: '15', name: '朱浩', gender: 'male', generation: 5, generationName: '兴', birthYear: '2000' },
      { id: '16', name: '朱悦', gender: 'female', generation: 5, generationName: '兴', birthYear: '2005' },
      { id: '17', name: '朱晨', gender: 'male', generation: 5, generationName: '兴', birthYear: '2010' },
      { id: '18', name: '朱雪', gender: 'female', generation: 5, generationName: '兴', birthYear: '2012' }
    ];
  },

  /** 渲染成员统计与按代分组 */
  renderMembers(allMembers) {
    const maleCount = allMembers.filter(m => m.gender === 'male').length;
    const femaleCount = allMembers.filter(m => m.gender === 'female').length;
    this.setData({ allMembers, totalMembers: allMembers.length, maleCount, femaleCount });
    this.regroupMembers(allMembers);
  },

  onSearch(e) {
    const keyword = e.detail.value;
    if (!keyword) {
      this.loadMembers();
      return;
    }
    const filtered = this.data.allMembers.filter(m => m.name.includes(keyword));
    this.regroupMembers(filtered);
  },

  regroupMembers(members) {
    const grouped = {};
    members.forEach(m => {
      if (!grouped[m.generation]) grouped[m.generation] = [];
      grouped[m.generation].push(m);
    });
    const groupedMembers = Object.keys(grouped).sort((a, b) => Number(a) - Number(b)).map(gen => ({
      generation: gen,
      members: grouped[gen]
    }));
    this.setData({ groupedMembers });
  },

  showFilter() {
    const all = this.data.allMembers;
    wx.showActionSheet({
      itemList: ['按姓名排序', '按出生年份排序', '只看男性', '只看女性'],
      success: (res) => {
        let result = all.slice();
        switch (res.tapIndex) {
          case 0: // 按姓名排序
            result.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'));
            break;
          case 1: // 按出生年份排序(未知年份排最后)
            result.sort((a, b) => {
              const ay = a.birthYear || '';
              const by = b.birthYear || '';
              return ay === by ? 0 : (ay === '' ? 1 : (by === '' ? -1 : ay.localeCompare(by)));
            });
            break;
          case 2: // 只看男性
            result = result.filter(m => m.gender === 'male');
            break;
          case 3: // 只看女性
            result = result.filter(m => m.gender === 'female');
            break;
          default:
            return;
        }
        this.regroupMembers(result);
      }
    });
  },

  viewMember(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/member-detail/member-detail?id=${id}`
    });
  },

  addMember() {
    wx.navigateTo({
      url: '/pages/add-member/add-member'
    });
  },

  /** 导航栏左上角返回：直接回首页（覆盖默认返回上一页）。
   *  标记 _homeExit,onUnload 时不再置位防循环标记(回首页不经过"族成员"入口页,无需防循环) */
  goHome() {
    this._homeExit = true;
    wx.switchTab({ url: '/pages/home/home' });
  }
});
