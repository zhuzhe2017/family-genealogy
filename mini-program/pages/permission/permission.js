Page({
  data: {
    members: [
      { id: 1, name: '张三', role: 'admin', desc: '家族管理员' },
      { id: 2, name: '李四', role: 'member', desc: '普通成员' },
      { id: 3, name: '王五', role: 'member', desc: '普通成员' }
    ]
  },

  onLoad() {},

  switchRole(e) {
    const id = e.currentTarget.dataset.id;
    const members = this.data.members.map(item => {
      if (item.id === id) {
        item.role = item.role === 'admin' ? 'member' : 'admin';
      }
      return item;
    });
    this.setData({ members });
    wx.showToast({
      title: '权限已切换',
      icon: 'success'
    });
  }
});
