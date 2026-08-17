const app = getApp();
const { familyMember } = require('../../utils/api');
const { normalizeMember } = require('../../utils/format');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

Page({
  data: {
    viewMode: 'tree',
    selectedGen: 'all',
    treeWidth: 1200,
    treeHeight: 1200,
    showModal: false,
    selectedNode: {},
    modalAnimation: {},
    treeLevels: [],
    memberList: []
  },

  onLoad() {
    this.loadTreeData();
  },

  /** 加载家族树:优先走后端 API,失败回退 mock */
  loadTreeData() {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      familyMember.getAll(familyId)
        .then((res) => {
          this.buildTree((res || []).map(normalizeMember));
        })
        .catch((err) => {
          console.error('家族树加载失败,使用 mock', err);
          this.generateTreeData();
          this.generateMemberList();
        });
    } else {
      this.generateTreeData();
      this.generateMemberList();
    }
  },

  /** 根据成员数据构建按代分层的树结构与成员列表 */
  buildTree(members) {
    const treeLevels = [];
    const memberList = [];
    members.forEach(node => {
      const childrenCount = members.filter(m => m.fatherId === node.id || m.motherId === node.id).length;
      const fullNode = {
        ...node,
        hasChildren: childrenCount > 0,
        childrenCount,
        relation: this.getRelation(node.generation),
        title: node.title || ''
      };
      memberList.push(fullNode);
      if (!treeLevels[node.generation - 1]) treeLevels[node.generation - 1] = [];
      treeLevels[node.generation - 1].push(fullNode);
    });
    this.setData({ treeLevels, memberList });
  },

  generateTreeData() {
    // 模拟家族树数据 - 按代分层
    const treeLevels = [
      // 第一代
      [
        { id: '1', name: '张太公', gender: 'male', generation: 1, generationName: '文', birthYear: '1880', hasChildren: true, childrenCount: 3, spouseInfo: { name: '张太婆', birthDate: '1882年5月12日', bio: '张太婆，贤良淑德，相夫教子。', deathDate: '1960年11月8日', deathPlace: '山东省济南市张氏祖坟', longitude: '117.000923', latitude: '36.675807' } }
      ],
      // 第二代
      [
        { id: '2', name: '张大', gender: 'male', generation: 2, generationName: '德', birthYear: '1910', hasChildren: true, childrenCount: 2, spouseInfo: { name: '李氏', birthDate: '1911年', bio: '', deathDate: '', deathPlace: '', longitude: '', latitude: '' } },
        { id: '3', name: '张二', gender: 'male', generation: 2, generationName: '德', birthYear: '1912', hasChildren: true, childrenCount: 2, spouseInfo: { name: '王氏', birthDate: '1913年', bio: '', deathDate: '', deathPlace: '', longitude: '', latitude: '' } },
        { id: '4', name: '张三', gender: 'male', generation: 2, generationName: '德', birthYear: '1915', hasChildren: true, childrenCount: 1, spouseInfo: { name: '陈氏', birthDate: '1916年', bio: '', deathDate: '', deathPlace: '', longitude: '', latitude: '' } }
      ],
      // 第三代
      [
        { id: '5', name: '张强', gender: 'male', generation: 3, generationName: '永', birthYear: '1940', hasChildren: true, childrenCount: 2, spouseInfo: { name: '刘氏', birthDate: '1941年', bio: '', deathDate: '', deathPlace: '', longitude: '', latitude: '' } },
        { id: '6', name: '张明', gender: 'male', generation: 3, generationName: '永', birthYear: '1942', hasChildren: true, childrenCount: 1, spouseInfo: { name: '赵氏', birthDate: '1943年', bio: '', deathDate: '', deathPlace: '', longitude: '', latitude: '' } },
        { id: '7', name: '张华', gender: 'male', generation: 3, generationName: '永', birthYear: '1945', hasChildren: true, childrenCount: 2, spouseInfo: { name: '孙氏', birthDate: '1946年', bio: '', deathDate: '', deathPlace: '', longitude: '', latitude: '' } },
        { id: '8', name: '张丽', gender: 'female', generation: 3, generationName: '永', birthYear: '1948', hasChildren: true, childrenCount: 1, spouseInfo: { name: '周先生', birthDate: '1945年', bio: '', deathDate: '', deathPlace: '', longitude: '', latitude: '' } },
        { id: '9', name: '张芳', gender: 'female', generation: 3, generationName: '永', birthYear: '1950', hasChildren: false, childrenCount: 0, spouseInfo: { name: '吴先生', birthDate: '1948年', bio: '', deathDate: '', deathPlace: '', longitude: '', latitude: '' } }
      ],
      // 第四代
      [
        { id: '10', name: '张伟', gender: 'male', generation: 4, generationName: '世', birthYear: '1970', hasChildren: true, childrenCount: 1, spouseInfo: { name: '郑氏', birthDate: '1971年', bio: '', deathDate: '', deathPlace: '', longitude: '', latitude: '' } },
        { id: '11', name: '张敏', gender: 'female', generation: 4, generationName: '世', birthYear: '1972', hasChildren: true, childrenCount: 2, spouseInfo: { name: '王先生', birthDate: '1970年', bio: '', deathDate: '', deathPlace: '', longitude: '', latitude: '' } },
        { id: '12', name: '张军', gender: 'male', generation: 4, generationName: '世', birthYear: '1975', hasChildren: false, childrenCount: 0 },
        { id: '13', name: '张燕', gender: 'female', generation: 4, generationName: '世', birthYear: '1978', hasChildren: true, childrenCount: 1, spouseInfo: { name: '李先生', birthDate: '1976年', bio: '', deathDate: '', deathPlace: '', longitude: '', latitude: '' } },
        { id: '14', name: '张鹏', gender: 'male', generation: 4, generationName: '世', birthYear: '1980', hasChildren: true, childrenCount: 1, spouseInfo: { name: '周氏', birthDate: '1981年', bio: '', deathDate: '', deathPlace: '', longitude: '', latitude: '' } }
      ],
      // 第五代
      [
        { id: '15', name: '张浩', gender: 'male', generation: 5, generationName: '兴', birthYear: '2000', hasChildren: false, childrenCount: 0 },
        { id: '16', name: '张悦', gender: 'female', generation: 5, generationName: '兴', birthYear: '2005', hasChildren: false, childrenCount: 0 },
        { id: '17', name: '张晨', gender: 'male', generation: 5, generationName: '兴', birthYear: '2010', hasChildren: false, childrenCount: 0 },
        { id: '18', name: '张雪', gender: 'female', generation: 5, generationName: '兴', birthYear: '2012', hasChildren: false, childrenCount: 0 }
      ]
    ];

    this.setData({ treeLevels });
    this._allLevels = treeLevels;
  },

  generateMemberList() {
    const allMembers = [];
    this.data.treeLevels.forEach(level => {
      level.forEach(node => {
        allMembers.push({
          ...node,
          relation: this.getRelation(node.generation)
        });
      });
    });
    this.setData({ memberList: allMembers });
  },

  getRelation(generation) {
    const relations = ['', '始祖', '祖辈', '父辈', '同辈', '子辈'];
    return relations[generation] || '族人';
  },

  toggleView() {
    this.setData({
      viewMode: this.data.viewMode === 'tree' ? 'list' : 'tree'
    });
  },

  filterGen(e) {
    const gen = e.currentTarget.dataset.gen;
    this.setData({ selectedGen: gen });
    // 按"显示代数"过滤:全部或前 N 代
    const allLevels = this._allLevels || this.data.treeLevels || [];
    this.setData({
      treeLevels: gen === 'all' ? allLevels : allLevels.slice(0, Number(gen))
    });
  },

  showSearch() {
    wx.showToast({ title: '搜索功能', icon: 'none' });
  },

  showNodeDetail(e) {
    const id = e.currentTarget.dataset.id;
    const node = this.data.memberList.find(m => m.id === id);
    if (node) {
      this.setData({
        showModal: true,
        selectedNode: node
      });
    }
  },

  closeModal() {
    this.setData({ showModal: false });
  },

  viewDetail() {
    wx.navigateTo({
      url: `/pages/member-detail/member-detail?id=${this.data.selectedNode.id}`
    });
    this.closeModal();
  },

  editNode() {
    wx.navigateTo({
      url: `/pages/add-member/add-member?id=${this.data.selectedNode.id}&edit=1`
    });
    this.closeModal();
  },

  addMember() {
    wx.navigateTo({
      url: '/pages/add-member/add-member'
    });
  },

  exportTree() {
    wx.showActionSheet({
      itemList: ['导出为图片', '导出为PDF', '分享给好友'],
      success: (res) => {
        wx.showToast({ title: '导出成功', icon: 'success' });
      }
    });
  }
});
