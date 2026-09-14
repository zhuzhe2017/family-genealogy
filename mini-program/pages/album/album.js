const app = getApp();
const contentApi = require('../../utils/api').content;
const { USE_MOCK } = require('../../utils/config');
const { getToken, upload } = require('../../utils/request');
const { normalizePhoto } = require('../../utils/format');

// ---------------- 瀑布流常量 ----------------
const DEFAULT_RATIO = 1;      // 未知尺寸时默认 1:1 占位
const MAX_RATIO_WAIT = 1500;  // 单张图片尺寸解析超时(ms),超时按默认比例放置
const CONCURRENCY = 4;        // 并发获取图片尺寸数
const PAGE_GAP = 8;           // 列间距/行间距(px)
const PAGE_SIZE = 30;         // 每页加载照片数
const MIN_ITEM_HEIGHT = 120;  // 单项最小高度(px),防止超宽图过窄
const PAGE_PADDING = 12;      // 瀑布流容器左右内边距(px)

// 图片高宽比缓存:url -> ratio(高/宽),跨页面/会话复用,减少 getImageInfo 调用
const ratioCache = new Map();

// 照片分类兜底字典(与后端默认分类约定一致;优先使用后端动态分类 loadCategories,
// 仅在后端加载失败/mock 环境回退到此字典,保证离线可用)
const PHOTO_CATEGORIES = [
  { id: 'ancestor', name: '先祖', icon: '👴' },
  { id: 'family', name: '全家福', icon: '👨‍👩‍👧‍👦' },
  { id: 'events', name: '活动', icon: '🎉' },
  { id: 'buildings', name: '建筑', icon: '🏛️' },
  { id: 'documents', name: '文档', icon: '📄' }
];

// 并发受控的图片尺寸解析队列
let activeRatioTasks = 0;
const pendingRatioTasks = [];

function pumpRatioQueue() {
  while (activeRatioTasks < CONCURRENCY && pendingRatioTasks.length) {
    const { src, resolve } = pendingRatioTasks.shift();
    activeRatioTasks++;
    runImageInfo(src)
      .then((ratio) => {
        ratioCache.set(src, ratio);
        resolve(ratio);
      })
      .finally(() => {
        activeRatioTasks--;
        pumpRatioQueue();
      });
  }
}

function runImageInfo(src) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(DEFAULT_RATIO), MAX_RATIO_WAIT);
    wx.getImageInfo({
      src,
      success: (res) => {
        clearTimeout(timer);
        const ratio = res.width > 0 && res.height > 0 ? res.height / res.width : DEFAULT_RATIO;
        resolve(ratio);
      },
      fail: () => {
        clearTimeout(timer);
        resolve(DEFAULT_RATIO);
      }
    });
  });
}

/** 获取图片高宽比(高/宽),带缓存与并发限制 */
function resolveRatio(src) {
  if (!src) return Promise.resolve(DEFAULT_RATIO);
  if (ratioCache.has(src)) return Promise.resolve(ratioCache.get(src));
  return new Promise((resolve) => {
    pendingRatioTasks.push({ src, resolve });
    pumpRatioQueue();
  });
}

Page({
  data: {
    activeCategory: 'all',
    currentCategoryName: '全部照片',
    // 分类列表由真实照片数据聚合生成(refreshCategories),避免硬编码分类无数据可切
    categories: [
      { id: 'all', name: '全部', icon: '📷', count: 0 }
    ],
    // 瀑布流列: [{ items: [{id,url,title,year,ratio,height,delay,loaded,rawIndex}], height }]
    columns: [],
    // 首屏骨架屏占位: 每列若干高度(px)
    skeletonCols: [],
    photoCount: 0,
    hasMore: true,
    loading: false,
    loadingMore: false,
    showEmpty: false
  },

  onLoad() {
    this.initLayout();
    if (wx.onWindowResize) {
      // 横竖屏/窗口尺寸变化时重新布局(尺寸已缓存,重建成本低)
      this._resizeHandler = () => {
        this.initLayout();
        this.renderMasonry(this.currentViewPhotos(), false);
      };
      wx.onWindowResize(this._resizeHandler);
    }
    // 先加载分类(懒初始化),再拉取照片,保证分类列表可用
    this.loadCategories().finally(() => this.fetchAndRender(true));
  },

  onUnload() {
    if (wx.offWindowResize && this._resizeHandler) {
      wx.offWindowResize(this._resizeHandler);
    }
  },

  onPullDownRefresh() {
    this.fetchAndRender(true).finally(() => wx.stopPullDownRefresh());
  },

  /** 触底加载下一页 */
  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.fetchAndRender(false);
  },

  /** 根据窗口宽度计算列数与列宽(响应式) */
  initLayout() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const width = info.windowWidth || 375;
    // 手机(~375-430):2 列;平板(>=600):3 列;更宽屏幕:4 列
    const colCount = width >= 900 ? 4 : (width >= 600 ? 3 : 2);
    const colWidth = (width - PAGE_PADDING * 2 - PAGE_GAP * (colCount - 1)) / colCount;
    this._gap = PAGE_GAP;
    this._colCount = colCount;
    this._colWidth = Math.floor(colWidth);
    // 骨架屏占位高度(每列错落,模拟瀑布流)
    const heights = [];
    for (let i = 0; i < colCount; i++) {
      const col = [];
      for (let j = 0; j < 4; j++) {
        col.push(160 + ((i * 3 + j * 7) % 5) * 32);
      }
      heights.push(col);
    }
    this.setData({ skeletonCols: heights });
  },

  /** 按当前分类获取待渲染照片 */
  currentViewPhotos() {
    const id = this.data.activeCategory;
    if (id === 'all') return this._allPhotos || [];
    return (this._allPhotos || []).filter(p => p.category === id);
  },

  /**
   * 从真实照片数据聚合分类列表:只保留有照片的分类,数量为真实计数
   * 确保"切换分类"始终能切到有内容的分类,不再出现硬编码分类全空
   */
  refreshCategories() {
    const photos = this._allPhotos || [];
    const countMap = {};
    photos.forEach((p) => {
      const c = p.category || 'uncategorized';
      countMap[c] = (countMap[c] || 0) + 1;
    });
    const list = PHOTO_CATEGORIES
      .filter(c => countMap[c.id])
      .map(c => ({ id: c.id, name: c.name, icon: c.icon, count: countMap[c.id] }));
    if (countMap['']) list.push({ id: '', name: '未分类', icon: '🖼️', count: countMap[''] });
    if (countMap['uncategorized']) list.push({ id: 'uncategorized', name: '未分类', icon: '🖼️', count: countMap['uncategorized'] });
    this.setData({
      categories: [{ id: 'all', name: '全部', icon: '📷', count: photos.length }].concat(list)
    });
  },

  /** 拉取数据并渲染 */
  async fetchAndRender(reset) {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (USE_MOCK || !getToken() || !familyId) {
      if (reset) {
        this._allPhotos = this.mockPhotos();
        this.setData({ loading: true });
        await this.renderMasonry(this.currentViewPhotos(), false);
        this.setData({ loading: false, loadingMore: false, photoCount: this._allPhotos.length, hasMore: false, showEmpty: false });
        this.refreshCategories();
      }
      return;
    }

    const page = reset ? 1 : this._page;
    this.setData({ [reset ? 'loading' : 'loadingMore']: true });
    try {
      const res = await contentApi.getList('photo', { familyId, page, pageSize: PAGE_SIZE });
      const list = (res.list || []).map(normalizePhoto);
      const total = Number(res.total) || 0;
      if (reset) {
        this._allPhotos = list;
        this._page = 2;
      } else {
        this._allPhotos = (this._allPhotos || []).concat(list);
        this._page = page + 1;
      }
      const hasMore = this._page * PAGE_SIZE < total;
      // 增量追加仅适用于"全部"视图;分类视图需整体重排
      const incremental = !reset && this.data.activeCategory === 'all';
      await this.renderMasonry(this.currentViewPhotos(), incremental);
      this.setData({
        loading: false,
        loadingMore: false,
        photoCount: this.currentViewPhotos().length,
        hasMore,
        showEmpty: this.currentViewPhotos().length === 0
      });
      // 分类列表随真实数据刷新(计数、可见分类)
      this.refreshCategories();
    } catch (err) {
      console.error('相册加载失败', err);
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /**
   * 瀑布流渲染:按真实比例将照片顺序放入"当前最短"列
   * incremental=true 时仅追加新照片到现有列(不重建已有项)
   */
  renderMasonry(photos, incremental) {
    const gap = this._gap;
    const colWidth = this._colWidth;
    const columns = incremental ? this.data.columns : this.buildColumns();
    if (!incremental) {
      // 保留已有项的加载状态,避免分类切换/重排时图片闪烁
      this._loadedMap = new Map();
      this.data.columns.forEach(c =>
        c.items.forEach(it => { if (it.loaded) this._loadedMap.set(it.rawIndex, true); })
      );
      this._itemPos = new Map();
      // 清空视图,等待逐张流入
      this.setData({ columns: columns.map(c => ({ key: c.key, items: [], height: 0 })) });
    } else if (!this._itemPos) {
      this._itemPos = new Map();
    }

    const list = photos || [];
    return new Promise((resolve) => {
      let i = 0;
      const n = list.length;
      const flush = () =>
        this.setData({ columns: columns.map(c => ({ key: c.key, items: c.items.slice(), height: c.height })) });

      const step = () => {
        if (i >= n) {
          flush();
          resolve();
          return;
        }
        const photo = list[i++];
        const rawIndex = this._allPhotos.indexOf(photo);
        resolveRatio(photo.url).then((ratio) => {
          const height = Math.max(MIN_ITEM_HEIGHT, Math.round(colWidth * ratio));
          const colIdx = this.shortestColumnIndex(columns);
          const item = {
            ...photo,
            ratio,
            height,
            delay: Math.min(i * 40, 320), // 入场动画错峰
            loaded: !!(this._loadedMap && this._loadedMap.get(rawIndex)),
            rawIndex
          };
          columns[colIdx].items.push(item);
          columns[colIdx].height += height + gap;
          this._itemPos.set(rawIndex, { col: colIdx, idx: columns[colIdx].items.length - 1 });
          if (i % 6 === 0) flush();
          step();
        });
      };
      step();
    });
  },

  /** 当前最短的列下标 */
  shortestColumnIndex(columns) {
    let min = Infinity;
    let idx = 0;
    columns.forEach((c, i) => {
      if (c.height < min) {
        min = c.height;
        idx = i;
      }
    });
    return idx;
  },

  buildColumns() {
    return Array.from({ length: this._colCount }, (_, i) => ({ key: 'col-' + i, items: [], height: 0 }));
  },

  /** 图片加载完成 → 淡入显示 */
  onImageLoad(e) {
    this.markLoaded(e.currentTarget.dataset.key);
  },

  /** 图片加载失败 → 同样显示占位,避免一直空白 */
  onImageError(e) {
    this.markLoaded(e.currentTarget.dataset.key);
  },

  markLoaded(rawIndex) {
    const pos = this._itemPos && this._itemPos.get(Number(rawIndex));
    if (!pos) return;
    const key = `columns[${pos.col}].items[${pos.idx}].loaded`;
    if (this.data.columns[pos.col] && this.data.columns[pos.col].items[pos.idx] &&
        !this.data.columns[pos.col].items[pos.idx].loaded) {
      this.setData({ [key]: true });
    }
  },

  /** 点击查看大图 */
  viewPhoto(e) {
    const index = Number(e.currentTarget.dataset.index);
    const urls = (this._allPhotos || []).map(p => p.url).filter(u => !!u);
    const current = urls[index] || urls[0];
    if (!urls.length || !current) {
      wx.showToast({ title: '图片暂不可用', icon: 'none' });
      return;
    }
    wx.previewImage({ urls, current });
  },

  switchCategory(e) {
    const id = e.currentTarget.dataset.id;
    const category = this.data.categories.find(c => c.id === id);
    const viewPhotos = this.currentViewPhotos();
    this.setData({
      activeCategory: id,
      currentCategoryName: category ? category.name : '全部照片',
      photoCount: viewPhotos.length,
      showEmpty: viewPhotos.length === 0
    });
    this.renderMasonry(viewPhotos, false);
  },

  addPhoto() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = (res.tempFiles || []).map(f => f.tempFilePath);
        if (!files.length) return;
        // 先选照片分类,保证分类切换有真实数据可切(分类池:动态分类优先,兜底字典次之)
        const pool = (this._categories && this._categories.length) ? this._categories : PHOTO_CATEGORIES;
        const itemList = pool.map(c => c.name).concat(['未分类']);
        wx.showActionSheet({
          itemList,
          success: (pick) => {
            const categoryId = pick.tapIndex < pool.length ? pool[pick.tapIndex].id : '';
            this.uploadPhotos(files, categoryId);
          }
        });
      }
    });
  },

  /** 逐张上传并创建照片记录,全部成功后统一刷新 */
  uploadPhotos(files, categoryId) {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      wx.showLoading({ title: '上传中' });
      const tasks = files.map((filePath) =>
        this.uploadImage(filePath)
          .then((url) => contentApi.create('photo', {
            familyId,
            url,
            title: '',
            year: String(new Date().getFullYear()),
            categoryId
          }))
      );
      Promise.all(tasks)
        .then(() => {
          wx.hideLoading();
          wx.showToast({ title: '上传成功', icon: 'success' });
          this.fetchAndRender(true);
        })
        .catch((err) => {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' });
        });
    } else {
      wx.showToast({ title: '上传成功', icon: 'success' });
    }
  },

  uploadImage(filePath) {
    const familyId = (app.globalData.currentFamily || {}).id;
    const formData = familyId ? { familyId: String(familyId), bizType: 'photo' } : {};
    return upload({ url: '/common/upload', filePath, formData }).then(data => data.url);
  },

  /** Mock 相册数据(开发期) */
  mockPhotos() {
    const list = [
      { id: 1, url: '', title: '朱太公遗照', year: '1950', category: 'ancestor' },
      { id: 2, url: '', title: '家族祠堂', year: '1960', category: 'buildings' },
      { id: 3, url: '', title: '1950年全家福', year: '1950', category: 'family' },
      { id: 4, url: '', title: '祭祖大典', year: '2024', category: 'events' },
      { id: 5, url: '', title: '族谱封面', year: '2024', category: 'documents' },
      { id: 6, url: '', title: '家族聚会', year: '2023', category: 'events' },
      { id: 7, url: '', title: '老宅照片', year: '1970', category: 'buildings' },
      { id: 8, url: '', title: '朱大肖像', year: '1940', category: 'ancestor' },
      { id: 9, url: '', title: '2024年全家福', year: '2024', category: 'family' }
    ];
    return list.map(normalizePhoto);
  }
});
