Page({
  data: {
    incenseCount: 128,
    prayCount: 86,
    offerCount: 45,
    wishCount: 67,
    records: [
      { id: 1, userName: '张三', time: '10分钟前', content: '为家族祈福，愿祖先保佑子孙平安健康，事业顺利。' },
      { id: 2, userName: '李四', time: '30分钟前', content: '清明时节，缅怀先祖，感恩先辈为家族做出的贡献。' },
      { id: 3, userName: '王五', time: '1小时前', content: '愿家族兴旺发达，代代相传，子孙贤良。' },
      { id: 4, userName: '赵六', time: '2小时前', content: '为已故亲人祈福，愿他们在天之灵安息。' },
      { id: 5, userName: '孙七', time: '3小时前', content: '祈求家族和睦，兄弟团结，共创美好未来。' }
    ]
  },

  onLoad() {
    // 加载数据
  },

  burnIncense() {
    wx.showModal({
      title: '上香祈福',
      content: '您确定要为祖先上香吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            incenseCount: this.data.incenseCount + 1
          });
          wx.showToast({ title: '上香成功', icon: 'success' });
        }
      }
    });
  },

  pray() {
    wx.showToast({ title: '祈福成功', icon: 'success' });
    this.setData({
      prayCount: this.data.prayCount + 1
    });
  },

  offerGift() {
    wx.showActionSheet({
      itemList: ['鲜花', '水果', '香烛', '纸钱'],
      success: (res) => {
        this.setData({
          offerCount: this.data.offerCount + 1
        });
        wx.showToast({ title: '献祭成功', icon: 'success' });
      }
    });
  },

  writeWish() {
    wx.showModal({
      title: '写下心愿',
      editable: true,
      placeholderText: '请输入您的心愿...',
      success: (res) => {
        if (res.confirm && res.content) {
          this.setData({
            wishCount: this.data.wishCount + 1,
            records: [{
              id: Date.now(),
              userName: '我',
              time: '刚刚',
              content: res.content
            }, ...this.data.records]
          });
          wx.showToast({ title: '许愿成功', icon: 'success' });
        }
      }
    });
  }
});
