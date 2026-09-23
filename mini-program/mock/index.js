/**
 * Mock 数据模块：仅在"MOCK"条件编译下被打包（app.js 中 // #ifdef MOCK 包裹引入）。
 * 生产构建不包含本目录，运行时也不会加载任何 mock 逻辑。
 */

/** Mock 用户(开发期或后端不可用时) */
function mockLogin(app) {
  app.globalData.userInfo = {
    id: 'user001',
    nickName: '朱家族人',
    avatarUrl: '',
    role: 'admin'
  };
}

/** Mock 家族数据 */
function initMockData(app) {
  app.globalData.families = [
    {
      id: 'fam001',
      name: '朱氏家族',
      logo: '',
      memberCount: 126,
      generationCount: 8,
      generationNames: '文、德、永、世、兴、明、道、广',
      // 按代字辈序列:同代可有多字辈,首页只显首字带+角标
      generationSequence: { 1: ['文'], 2: ['德', '得'], 3: ['永'], 4: ['世', '士'], 5: ['兴'], 6: ['明'], 7: ['道'], 8: ['广'] },
      founder: '朱太公',
      origin: '山东济南',
      hallName: '颍川堂',
      createTime: '2024-01-15',
      isAdmin: true
    },
    {
      id: 'fam002',
      name: '朱氏宗族',
      logo: '',
      memberCount: 89,
      generationCount: 6,
      generationNames: '宗、邦、维、振、家、声',
      founder: '朱老太',
      origin: '河南开封',
      createTime: '2024-03-20',
      isAdmin: false
    }
  ];
  app.globalData.currentFamily = app.globalData.families[0];
}

module.exports = { mockLogin, initMockData };
