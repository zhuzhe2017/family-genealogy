const app = getApp();
const { subscription } = require('../../utils/api');
const { getToken } = require('../../utils/request');
const { USE_MOCK } = require('../../utils/config');

/** 能力点 → 展示文案（与后端 Capability 枚举一致） */
const CAPABILITY_LABELS = {
  backup: '数据备份',
  export: '谱牒数据导出',
  permission: '高级权限管理 / 多管理员',
  reminder: '纪念日、生日提醒',
  digest: '家族简报',
  theme: '家族主页 / 封面定制',
  badge: '家族徽章 / 荣誉体系',
  ai_restore: 'AI 老照片修复',
  worship_pro: '祭祀增值服务',
  print: '谱牒印刷折扣',
  advisor: '专业修谱顾问',
  support: '专属客服',
  no_ads: '无广告体验'
};

/** 订阅状态 → 展示文案 */
const STATUS_LABELS = {
  active: '订阅有效',
  grace: '宽限期（请尽快续费）',
  frozen: '已冻结',
  expired: '已过期，数据只读'
};

/** 离线兜底套餐配置（与后端 subscription_plan 种子数据保持一致） */
const FALLBACK_PLANS = [
  {
    code: 'family',
    name: '家族版',
    price: '199',
    unit: '元/年',
    recommend: true,
    tag: '最多家族选择',
    features: [
      '10GB 家族存储空间',
      'AI 老照片修复 10 张/年',
      '祭祀增值服务 50 次/年',
      '数据备份 / 谱牒数据导出',
      '高级权限管理 / 多管理员',
      '纪念日、生日提醒',
      '家族简报 / 主页定制'
    ]
  },
  {
    code: 'premium',
    name: '尊享版',
    price: '599',
    unit: '元/年',
    recommend: false,
    tag: '全部权益',
    features: [
      '存储空间不限',
      'AI 老照片修复 100 张/年',
      '祭祀增值服务不限次',
      '包含家族版全部功能',
      '谱牒印刷折扣',
      '修谱顾问 / 专属客服',
      '无广告体验'
    ]
  }
];

/** 免费版权益（展示用，不可购买） */
const FREE_FEATURES = ['500MB 家族存储空间', '基础家谱树 / 家族动态', '成员档案管理', '基础照片、文档上传'];

Page({
  data: {
    plans: [],
    freeFeatures: FREE_FEATURES,
    currentFamilyName: '',
    subStatus: null,
    paying: false,
    loading: true,      // 在线加载中（弱网/慢速时显示加载占位）
    loadFailed: false,  // 套餐加载失败：错误占位 + 重试
    offlineMode: false  // 离线/未登录：本地示例套餐提示
  },

  onShow() {
    const family = app.globalData.currentFamily;
    this.setData({ currentFamilyName: (family && family.name) || '' });
    this.loadData();
  },

  /** 加载套餐列表与当前订阅状态；离线/未登录用本地示例，在线失败不静默回退 */
  loadData() {
    const family = app.globalData.currentFamily;
    this.setData({ currentFamilyName: (family && family.name) || '' });

    // 离线/未登录：展示本地示例套餐，标注离线提示
    if (USE_MOCK || !getToken()) {
      this.setData({
        plans: FALLBACK_PLANS,
        subStatus: null,
        loading: false,
        loadFailed: false,
        offlineMode: true
      });
      return;
    }

    // 已有内容时刷新不闪加载态；首次加载才显示占位
    this.setData({ loading: this.data.plans.length === 0, loadFailed: false, offlineMode: false });

    const loadPlans = subscription.getPlans()
      .then((list) => this.normalizePlans(list))
      .catch((err) => {
        console.error('套餐列表加载失败', err);
        return null; // 失败标记：展示错误占位，而非假套餐
      });

    const loadStatus = family
      ? subscription.getCurrent(Number(family.id))
        .then((data) => this.normalizeStatus(data))
        .catch((err) => {
          console.error('订阅状态加载失败', err);
          return null;
        })
      : Promise.resolve(null);

    Promise.all([loadPlans, loadStatus]).then(([plans, subStatus]) => {
      if (plans === null) {
        // 已有套餐数据：保留展示并轻提示；无数据则进入错误占位
        if (this.data.plans.length > 0) {
          wx.showToast({ title: '刷新失败，已展示上次内容', icon: 'none' });
          this.setData({ loading: false, loadFailed: false, subStatus: subStatus || this.data.subStatus });
          return;
        }
        this.setData({ loading: false, loadFailed: true, plans: [], subStatus: subStatus || null });
        return;
      }
      this.setData({ loading: false, loadFailed: false, plans: plans || [], subStatus: subStatus || null });
    });
  },

  /** 下拉刷新（弱网重试入口） */
  onPullDownRefresh() {
    this.loadData();
    wx.stopPullDownRefresh();
  },

  /** 后端 PlanView → 页面套餐卡片（按 sort_order 已排好序，跳过免费版） */
  normalizePlans(list) {
    if (!Array.isArray(list) || list.length === 0) return [];
    return list
      .filter((p) => p.code !== 'free')
      .map((p) => ({
        code: p.code,
        name: p.name,
        price: this.formatPrice(p.priceAnnual),
        unit: '元/年',
        recommend: p.code === 'family',
        tag: p.code === 'family' ? '最多家族选择' : (p.code === 'premium' ? '全部权益' : ''),
        features: this.buildFeatures(p)
      }));
  },

  /** 由后端能力点/存储/额度组装权益文案 */
  buildFeatures(plan) {
    const features = [];
    if (Number(plan.storageLimit) === 0) {
      features.push('存储空间不限');
    } else {
      features.push(this.formatStorage(Number(plan.storageLimit)) + ' 家族存储空间');
    }
    const rules = plan.quotaRules || {};
    if (rules.ai_restore) {
      features.push('AI 老照片修复 ' + rules.ai_restore + ' 张/年');
    }
    if (rules.worship_pro) {
      features.push('祭祀增值服务 ' + (rules.worship_pro >= 999 ? '不限次' : rules.worship_pro + ' 次/年'));
    }
    (plan.capabilities || []).forEach((cap) => {
      if (cap === 'ai_restore' || cap === 'worship_pro') return; // 已在额度行展示
      const label = CAPABILITY_LABELS[cap];
      if (label && features.indexOf(label) < 0) features.push(label);
    });
    return features;
  },

  /** 后端订阅状态 + 额度 → 页面展示对象 */
  normalizeStatus(data) {
    if (!data) return null;
    const isFree = data.planCode === 'free' || data.planCode === undefined;
    const limit = Number(data.storageLimit) || 0;
    const used = Number(data.storageUsed) || 0;
    const rules = data.quotaRules || {};
    const aiLimit = Number(rules.ai_restore) || 0;
    const worshipLimit = Number(rules.worship_pro) || 0;

    return {
      planName: data.planName || (isFree ? '免费版' : ''),
      isFree: isFree,
      statusText: STATUS_LABELS[data.status] || '',
      expireText: this.formatDate(data.expireAt),
      storageUsedText: this.formatStorage(used),
      storageLimitText: limit === 0 ? '不限' : this.formatStorage(limit),
      storagePercent: limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100)),
      aiRestoreLimit: aiLimit || 0,
      aiRestoreUsed: Number(data.aiRestoreUsed) || 0,
      worshipProLimit: worshipLimit || 0,
      worshipProUsed: Number(data.worshipProUsed) || 0
    };
  },

  formatPrice(price) {
    const n = Number(price) || 0;
    return n % 1 === 0 ? String(n) : n.toFixed(2);
  },

  /** 字节 → 可读容量（MB/GB） */
  formatStorage(bytes) {
    const n = Number(bytes) || 0;
    const gb = n / (1024 * 1024 * 1024);
    if (gb >= 1) return (gb % 1 === 0 ? gb : gb.toFixed(1)) + 'GB';
    const mb = n / (1024 * 1024);
    return (mb % 1 === 0 ? mb : mb.toFixed(1)) + 'MB';
  },

  /** ISO 时间 → YYYY-MM-DD */
  formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  },

  /** 选择套餐 → 确认开通（选择当前家族） */
  choosePlan(e) {
    if (this.data.paying) return;
    const plan = e.currentTarget.dataset.plan;
    const family = app.globalData.currentFamily;

    if (!family) {
      wx.showModal({
        title: '提示',
        content: '请先在首页选择或创建家族，再开通会员。',
        showCancel: false
      });
      return;
    }
    wx.showModal({
      title: '确认开通' + plan.name,
      content: '为「' + family.name + '」开通' + plan.name + '（' + plan.price + plan.unit + '），家族内成员共享全部权益。',
      confirmText: '立即开通',
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (res.confirm) {
          this.doPrepay(plan, family);
        }
      }
    });
  },

  /** 调用下单接口：模拟模式直接成功，真实模式拉起微信支付 */
  doPrepay(plan, family) {
    this.setData({ paying: true });
    wx.showLoading({ title: '下单中...' });
    subscription
      .prepay({ familyId: Number(family.id), planCode: plan.code, months: 12 })
      .then((res) => {
        wx.hideLoading();
        this.setData({ paying: false });
        if (res && res.mock) {
          wx.showToast({ title: '开通成功', icon: 'success' });
          this.loadData();
        } else if (res && res.payParams) {
          this.requestPayment(res.payParams);
        } else {
          wx.showToast({ title: '下单异常，请稍后重试', icon: 'none' });
        }
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ paying: false });
        wx.showToast({ title: (err && err.message) || '开通失败', icon: 'none' });
      });
  },

  /** 调用 wx.requestPayment 完成支付 */
  requestPayment(params) {
    wx.requestPayment({
      timeStamp: params.timeStamp,
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType,
      paySign: params.paySign,
      success: () => {
        wx.showToast({ title: '支付成功', icon: 'success' });
        this.loadData();
      },
      fail: (err) => {
        wx.showToast({ title: (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) ? '已取消支付' : '支付失败', icon: 'none' });
      }
    });
  }
});
