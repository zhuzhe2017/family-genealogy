const app = getApp();
const { familyMember } = require('../../utils/api');
const { normalizeMember } = require('../../utils/format');
const { getToken } = require('../../utils/request');

Page({
  data: {
    member: {},
    loading: true,
    loadFailed: false,
    copied: false
  },

  /** 复制成员ID到剪贴板，按钮短暂切换为"已复制"反馈 */
  copyMemberId(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.setClipboardData({
      data: String(id),
      success: () => {
        this.setData({ copied: true });
        if (this._copyTimer) clearTimeout(this._copyTimer);
        this._copyTimer = setTimeout(() => this.setData({ copied: false }), 1500);
      },
      fail: () => {
        wx.showToast({ title: '复制失败', icon: 'none' });
      }
    });
  },

  onLoad(options) {
    const memberId = options.id;
    // 优先使用 URL 传入的 familyId，避免切换家族后 globalData 串家族（globalData 仅作兜底）
    this._familyId = Number(options.familyId) || (app.globalData.currentFamily || {}).id || 0;
    this.loadMemberDetail(memberId);
  },

  loadMemberDetail(id) {
    const familyId = this._familyId || (app.globalData.currentFamily || {}).id;
    if (getToken() && familyId) {
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
      // 离线/未登录场景:展示加载失败占位,避免页面空白
      this.setData({ member: {}, loading: false, loadFailed: true });
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
