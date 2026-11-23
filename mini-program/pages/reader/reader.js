/**
 * 在线阅读器
 * 
 * 跳转契约（冻结，与 cultural-index 一致）：
 *   docId     必填  文档ID
 *   docType   必填  public | family
 *   familyId  可选  仅 family 类型
 * 
 * 三个阅读视图：
 *   view = pages    原页图片浏览（movable-view + 图片预加载）
 *   view = text     整理版正文（章节化）
 *   view = trans    白话译文
 * 
 * 阅读进度：wx.setStorageSync 存书签 { docId, view, pageNo/chapterId, scrollTop }
 */
const api = require('../../utils/api.js');

// 书签存储键前缀
const BOOKMARK_KEY = 'reader_bookmark_';

Page({
  // ============================================================
  // 数据模型
  // ============================================================
  data: {
    // 入参
    docId: '',
    docType: 'public', // public | family
    familyId: null,

    // 文档基础信息
    docInfo: null,
    loading: true,
    loadError: false,

    // 章节树
    chapterTree: [],
    showChapterDrawer: false,

    // --- 视图切换 ---
    currentView: 'dual', // dual=对照 | pages | text | trans
    viewTabs: [
      { key: 'dual', label: '对照' },
      { key: 'pages', label: '原页' },
      { key: 'text', label: '整理版' },
      { key: 'trans', label: '译文' }
    ],

    // --- 原页浏览 ---
    pages: [],           // 原页图片列表
    pageIndex: 0,        // 当前页索引（0-based）
    pageNo: 1,           // 当前页码（1-based，显示用）
    pagesLoading: true,

    // --- 正文/译文 ---
    chapters: [],        // 扁平章节列表（for 渲染）
    activeChapterId: null,
    activeChapterTitle: '',
    chapterContent: '',
    translatedContent: '',
    textLoading: false
  },

  // ============================================================
  // 生命周期
  // ============================================================
  onLoad: function (query) {
    // 解析跳转参数（契约已冻结）
    const docId = query.docId || '';
    const docType = query.docType || 'public';
    const familyId = query.familyId ? Number(query.familyId) : null;

    if (!docId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }

    this.setData({ docId, docType, familyId });

    // 恢复阅读进度
    const bookmark = this.getBookmark();
    if (bookmark) {
      if (bookmark.view) this.setData({ currentView: bookmark.view });
    }

    this.loadAll();
  },

  onUnload: function () {
    // 保存当前书签
    this.saveBookmark();
  },

  // ============================================================
  // 数据加载
  // ============================================================
  loadAll: function () {
    this.setData({ loading: true, loadError: false });
    const promises = [];

    // 1. 文档详情
    promises.push(this.loadDocInfo());

    // 2. 章节树
    promises.push(this.loadChapters());

    // 3. 原页图片
    promises.push(this.loadPages());

    Promise.all(promises).then(() => {
      this.setData({ loading: false });

      // 恢复书签进度
      const bookmark = this.getBookmark();
      if (bookmark) {
        if (bookmark.view === 'pages' && bookmark.pageNo) {
          const idx = bookmark.pageNo - 1;
          if (idx >= 0 && idx < this.data.pages.length) {
            this.setData({ pageIndex: idx, pageNo: bookmark.pageNo });
          }
        } else if (bookmark.chapterId) {
          const bc = this.data.chapters.find(c => c.id === bookmark.chapterId);
          this.setData({
            activeChapterId: bookmark.chapterId,
            activeChapterTitle: bc ? bc.title : ''
          });
          this.loadChapterContent(bookmark.chapterId);
        }
      } else if (this.data.chapters.length > 0) {
        // 默认选第一章
        const first = this.data.chapters[0];
        this.setData({ activeChapterId: first.id, activeChapterTitle: first.title });
        this.loadChapterContent(first.id);
      }
    }).catch(err => {
      console.error('[reader] loadAll failed:', err);
      this.setData({ loading: false, loadError: true });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  loadDocInfo: function () {
    const { docId, docType, familyId } = this.data;
    const req = docType === 'public'
      ? api.culturalDoc.getPublicById(docId)
      : api.culturalDoc.getFamilyById(familyId, docId);

    return req.then(res => {
      const doc = res.data || res;
      wx.setNavigationBarTitle({ title: doc.title || '阅读器' });
      this.setData({ docInfo: doc });
    });
  },

  loadChapters: function () {
    const { docId, docType, familyId } = this.data;
    const req = docType === 'public'
      ? api.culturalDoc.getPublicChapters(docId)
      : api.culturalDoc.getFamilyChapters(familyId, docId);

    return req.then(res => {
      const tree = res.data || res || [];
      const flatList = this.flattenChapterTree(tree);
      this.setData({ chapterTree: tree, chapters: flatList });
    });
  },

  loadPages: function () {
    const { docId, docType, familyId } = this.data;
    this.setData({ pagesLoading: true });

    // 没有原页 → 跳过（不阻塞）
    if (docType !== 'public' && !familyId) {
      this.setData({ pages: [], pagesLoading: false });
      return Promise.resolve();
    }

    const req = docType === 'public'
      ? api.culturalDoc.getPublicPages(docId)
      : api.culturalDoc.getFamilyPages(familyId, docId);

    return req.then(res => {
      const pages = res.data || res || [];
      this.setData({ pages, pagesLoading: false });
    }).catch(() => {
      this.setData({ pages: [], pagesLoading: false });
    });
  },

  loadChapterContent: function (chapterId) {
    this.setData({ textLoading: true });

    // 公共端点：GET /cultural-doc/public/chapter/:chapterId
    // 家族端点无专门 chapter 接口，但章节内容已在章节树请求里
    // 这里统一从 chapters 扁平列表中取（树接口返回的 chapter 不含 content，需要单独请求）
    if (this.data.docType === 'public') {
      api.culturalDoc.getPublicChapterContent(chapterId).then(res => {
        const ch = res.data || res;
        this.setData({
          chapterContent: ch.content || '',
          translatedContent: ch.translated || '',
          textLoading: false
        });
      }).catch(() => this.setData({ textLoading: false }));
    } else {
      // 家族：先用 chapters 列表里已有的（可能为空），后续可扩展专门接口
      this.setData({ textLoading: false });
    }
  },

  // ============================================================
  // 章节树 → 扁平列表（保留 parentId 结构用于渲染缩进）
  // ============================================================
  flattenChapterTree: function (tree, depth) {
    depth = depth || 0;
    const result = [];
    for (let i = 0; i < tree.length; i++) {
      const node = tree[i];
      result.push({
        id: node.id,
        title: node.title,
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        depth: depth
      });
      if (node.children && node.children.length > 0) {
        result.push.apply(result, this.flattenChapterTree(node.children, depth + 1));
      }
    }
    return result;
  },

  // ============================================================
  // 视图切换
  // ============================================================
  onViewChange: function (e) {
    const view = e.currentTarget.dataset.view;
    if (view === this.data.currentView) return;
    this.setData({ currentView: view });
    this.saveBookmark();
  },

  // ============================================================
  // 原页导航
  // ============================================================
  onPageChange: function (e) {
    // swiper change 事件（bindchange）
    const idx = e.detail.current;
    this.setData({ pageIndex: idx, pageNo: idx + 1 });
    this.saveBookmark();
  },

  onPrevPage: function () {
    if (this.data.pageIndex > 0) {
      const idx = this.data.pageIndex - 1;
      this.setData({ pageIndex: idx, pageNo: idx + 1 });
    }
  },

  onNextPage: function () {
    if (this.data.pageIndex < this.data.pages.length - 1) {
      const idx = this.data.pageIndex + 1;
      this.setData({ pageIndex: idx, pageNo: idx + 1 });
    }
  },

  // ============================================================
  // 章节抽屉
  // ============================================================
  toggleChapterDrawer: function () {
    this.setData({ showChapterDrawer: !this.data.showChapterDrawer });
  },

  closeChapterDrawer: function () {
    this.setData({ showChapterDrawer: false });
  },

  onChapterSelect: function (e) {
    const id = Number(e.currentTarget.dataset.id);
    const chapter = this.data.chapters.find(c => c.id === id);
    if (!chapter) return;

    // 如果原页模式，跳转到对应页
    if (this.data.currentView === 'pages' && chapter.pageStart) {
      const idx = chapter.pageStart - 1;
      if (idx >= 0 && idx < this.data.pages.length) {
        this.setData({ pageIndex: idx, pageNo: chapter.pageStart });
      } else if (this.data.pages.length > 0) {
        this.setData({ pageIndex: 0, pageNo: 1 });
      }
    } else {
      // 正文模式，加载章节内容
      const chapter = this.data.chapters.find(c => c.id === id);
      this.setData({
        activeChapterId: id,
        activeChapterTitle: chapter ? chapter.title : '',
        showChapterDrawer: false
      });
      this.loadChapterContent(id);
    }
    this.saveBookmark();
  },

  // ============================================================
  // 书签读写
  // ============================================================
  getBookmark: function () {
    try {
      const raw = wx.getStorageSync(BOOKMARK_KEY + this.data.docId);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  saveBookmark: function () {
    try {
      const bookmark = {
        view: this.data.currentView,
        pageNo: this.data.pageNo,
        chapterId: this.data.activeChapterId,
        savedAt: Date.now()
      };
      wx.setStorageSync(BOOKMARK_KEY + this.data.docId, JSON.stringify(bookmark));
    } catch {
      // 静默忽略
    }
  },

  // ============================================================
  // 图片点击 → 微信全屏预览
  // ============================================================
  onImageTap: function (e) {
    const current = e.currentTarget.dataset.src;
    const urls = this.data.pages.map(p => p.image_url);
    wx.previewImage({ current, urls });
  },

  // 重试加载
  onRetryLoad: function () {
    this.loadAll();
  }
});
