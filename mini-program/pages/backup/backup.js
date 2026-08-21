Page({
  data: {
    records: [
      { id: 1, name: '朱氏家族数据备份', time: '2024-07-20 14:30', status: '成功' },
      { id: 2, name: '朱氏家族数据备份', time: '2024-06-15 10:00', status: '成功' }
    ]
  },

  onLoad() {},

  backupData() {
    wx.showLoading({ title: '备份中' });
    setTimeout(() => {
      wx.hideLoading();
      const records = this.data.records;
      records.unshift({
        id: Date.now(),
        name: '朱氏家族数据备份',
        time: this.formatTime(new Date()),
        status: '成功'
      });
      this.setData({ records });
      wx.showToast({
        title: '备份成功',
        icon: 'success'
      });
    }, 1500);
  },

  restoreData() {
    wx.showModal({
      title: '恢复数据',
      content: '确定要恢复到最近一次备份吗？当前数据将被覆盖。',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({
            title: '恢复成功',
            icon: 'success'
          });
        }
      }
    });
  },

  formatTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
});
