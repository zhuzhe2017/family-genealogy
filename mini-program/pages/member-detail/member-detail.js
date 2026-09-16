const app = getApp();
const { familyMember } = require('../../utils/api');
const { normalizeMember } = require('../../utils/format');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

Page({
  data: {
    member: {},
    loading: true,
    loadFailed: false
  },

  onLoad(options) {
    const memberId = options.id;
    this.loadMemberDetail(memberId);
  },

  loadMemberDetail(id) {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      this.setData({ loading: true, loadFailed: false });
      // 并行请求成员详情 + 子女列表,避免全量拉取家族成员
      Promise.all([
        familyMember.getById(familyId, id),
        familyMember.getChildren(familyId, id)
      ])
        .then(([row, children]) => {
          const me = normalizeMember(row);
          // 父母姓名按 ID 单独查询(仅在存在父母 ID 时发起,失败不影响主流程)
          const parentIds = [me.fatherId, me.motherId].filter(Boolean);
          const parentPromises = parentIds.map(pid =>
            familyMember.getById(familyId, pid).catch(() => null)
          );
          return Promise.all(parentPromises).then((parents) => {
            const father = me.fatherId ? (parents.find(p => p && p.id === me.fatherId) || null) : null;
            const mother = me.motherId ? (parents.find(p => p && p.id === me.motherId) || null) : null;
            this.assembleMemberDetail(me, children, father, mother);
            this.setData({ loading: false });
          });
        })
        .catch((err) => {
          console.error('成员详情加载失败', err);
          this.setData({ loading: false, loadFailed: true });
        });
    } else {
      // 离线/未登录场景使用演示数据,避免页面空白
      this.setData({ member: this.getMockMember(id), loading: false });
    }
  },

  /** 组装详情页展示字段(父母/子女来自独立查询结果) */
  assembleMemberDetail(me, children, father, mother) {
    const spouseList = me.spouseList || (me.spouseInfo ? [me.spouseInfo] : []);
    this.setData({
      member: {
        ...me,
        // 后端返回当前用户是否可编辑（绑定该成员ID的会员或家族创建者）
        canEdit: !!me.canEdit,
        // 配偶信息统一为数组（多配偶循环展示），spouseInfo 兼容取第一位
        // 首位配偶默认展开详情，其余折叠，点击可切换
        spouseList: spouseList.map((s, i) => ({ ...s, collapsed: i !== 0 })),
        spouseInfo: spouseList[0] || {},
        spouseNames: spouseList.map(s => s.name).join('、'),
        father: father ? father.name : '',
        mother: mother ? mother.name : '',
        children: (children || []).map(c => ({ id: c.id, name: c.name, gender: c.gender })),
        photos: me.photos || []
      }
    });
  },

  getMockMember(id) {
    return {
      id: id,
      name: '朱太公',
      gender: 'male',
      generation: 1,
      generationName: '文',
      birthDate: '1880年3月15日',
      deathDate: '1955年8月20日',
      birthPlace: '山东省济南市',
      isAlive: false,
      bio: '朱太公，字子远，生于清光绪六年。早年从商，后回乡办学，为家族发展奠定了坚实基础。为人正直，乐善好施，深受乡邻敬重。',
      spouseList: [
        {
          name: '朱太婆',
          birthDate: '1882年5月12日',
          bio: '朱太婆，贤良淑德，相夫教子，为家族培养了三子。',
          deathDate: '1960年11月8日',
          deathPlace: '山东省济南市朱氏祖坟',
          longitude: '117.000923',
          latitude: '36.675807',
          collapsed: false
        },
        {
          name: '侧室王氏',
          birthDate: '1890年1月1日',
          bio: '侧室，生一女。',
          collapsed: true
        }
      ],
      spouseInfo: {
        name: '朱太婆',
        birthDate: '1882年5月12日',
        bio: '朱太婆，贤良淑德，相夫教子，为家族培养了三子。',
        deathDate: '1960年11月8日',
        deathPlace: '山东省济南市朱氏祖坟',
        longitude: '117.000923',
        latitude: '36.675807'
      },
      spouseNames: '朱太婆',
      father: '',
      mother: '',
      children: [
        { id: '2', name: '朱大', gender: 'male' },
        { id: '3', name: '朱二', gender: 'male' },
        { id: '4', name: '朱三', gender: 'male' }
      ],
      photos: ['', '', '']
    };
  },

  /** 点击配偶：展开/收起该配偶的详细信息（手风琴效果，首位默认展开） */
  viewSpouse(e) {
    const index = e.currentTarget.dataset.index;
    const key = `member.spouseList[${index}].collapsed`;
    this.setData({ [key]: !this.data.member.spouseList[index].collapsed });
  },

  viewParent(e) {
    const parentId = e.currentTarget.dataset.id;
    if (parentId) {
      wx.navigateTo({
        url: `/pages/member-detail/member-detail?id=${parentId}`
      });
    }
  },

  viewChild(e) {
    const childId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/member-detail/member-detail?id=${childId}`
    });
  },

  previewPhoto() {
    wx.showToast({ title: '预览照片', icon: 'none' });
  },

  editMember() {
    wx.navigateTo({
      url: `/pages/add-member/add-member?id=${this.data.member.id}&edit=1`
    });
  },

  shareMember() {
    wx.showShareMenu({
      withShareTicket: true
    });
  }
});
