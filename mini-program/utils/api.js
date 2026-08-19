const { request } = require('./request');

/** 用户认证相关接口 */
const auth = {
  /** 微信登录:用 wx.login 拿到的 code 换取 token 和用户信息 */
  wxLogin: function (code) {
    return request({ url: '/user/wx-login', method: 'POST', data: { code: code } });
  },
  /** 发送手机号短信验证码(scene: login-登录 / bind-绑定手机号) */
  sendSmsCode: function (phone, scene) {
    return request({ url: '/user/sms/send', method: 'POST', data: { phone: phone, scene: scene || 'login' } });
  },
  /** 手机号验证码登录(未注册自动注册) */
  phoneLogin: function (phone, code) {
    return request({ url: '/user/phone-login', method: 'POST', data: { phone: phone, code: code } });
  },
  /** 绑定手机号(需登录,作为多端统一锚点) */
  bindPhone: function (phone, code) {
    return request({ url: '/user/bind-phone', method: 'POST', data: { phone: phone, code: code } });
  },
  /** 获取当前用户信息 */
  getProfile: function () {
    return request({ url: '/user/profile' });
  },
  /** 获取我的家族关联信息（登录后自动进入关联家族支系） */
  getMyFamily: function () {
    return request({ url: '/user/me/family' });
  },
  /** 加入家族支系:仅支持分享码 */
  joinFamily: function (data) {
    return request({ url: '/user/family/join', method: 'POST', data: data || {} });
  },
  /** 绑定家族成员（绑定后获得编辑该成员权限，不受 VIP 限制） */
  bindMember: function (memberId) {
    return request({ url: '/user/family/bind-member', method: 'PUT', data: { memberId: memberId } });
  },
  /** 更新当前用户资料 */
  updateProfile: function (data) {
    return request({ url: '/user/profile', method: 'PUT', data: data });
  },
  /** 注销账号 */
  deleteAccount: function () {
    return request({ url: '/user/account', method: 'DELETE' });
  }
};

/** 家族相关接口（小程序用户端 /user 前缀） */
const family = {
  /** 家族分页列表 */
  getList: function (params) {
    return request({ url: '/user/family/list', data: params || {} });
  },
  /** 全部家族(下拉选择用) */
  getAll: function (params) {
    return request({ url: '/user/family/all', data: params || {} });
  },
  /** 家族详情 */
  getById: function (id) {
    return request({ url: '/user/family/' + id });
  },
  /** 创建家族 */
  create: function (data) {
    return request({ url: '/user/family/create', method: 'POST', data: data || {} });
  }
};

/** 家族成员相关接口 */
const familyMember = {
  /** 家族全部成员(家谱树用,不分页) */
  getAll: function (familyId, params) {
    return request({ url: '/user/family/' + familyId + '/members', data: params || {} });
  },
  /** 成员详情 */
  getById: function (familyId, id) {
    return request({ url: '/user/family/' + familyId + '/members/' + id });
  },
  /** 成员子女列表 */
  getChildren: function (familyId, id) {
    return request({ url: '/user/family/' + familyId + '/members/' + id + '/children' });
  },
  /** 父亲候选（上一代男性成员，按姓名/母亲姓名模糊搜索） */
  getFatherCandidates: function (familyId, params) {
    return request({ url: '/user/family/' + familyId + '/father-candidates', data: params || {} });
  },
  /** 父亲的配偶列表（候选母亲） */
  getFatherSpouses: function (familyId, fatherId) {
    return request({ url: '/user/family/' + familyId + '/father-spouses', data: { fatherId: fatherId || '' } });
  },
  /** 添加成员 */
  create: function (familyId, data) {
    return request({ url: '/user/family/' + familyId + '/members', method: 'POST', data: data || {} });
  },
  /** 更新成员 */
  update: function (familyId, id, data) {
    return request({ url: '/user/family/' + familyId + '/members/' + id, method: 'PUT', data: data || {} });
  }
};

/** 内容相关接口(动态/照片/文档/事件) */
const content = {
  /** 内容列表 */
  getList: function (type, params) {
    return request({ url: '/user/content/' + type + '/list', data: params || {} });
  },
  /** 内容详情 */
  getById: function (type, id) {
    return request({ url: '/user/content/' + type + '/' + id });
  },
  /** 发布内容 */
  create: function (type, data) {
    return request({ url: '/user/content/' + type + '/create', method: 'POST', data: data || {} });
  },
  /** 更新内容（事件） */
  update: function (type, id, data) {
    return request({ url: '/user/content/' + type + '/' + id, method: 'PUT', data: data || {} });
  },
  /** 删除内容（软删除，事件） */
  remove: function (type, id) {
    return request({ url: '/user/content/' + type + '/' + id, method: 'DELETE' });
  },
  /** 动态点赞/取消点赞(toggle) */
  toggleLike: function (id) {
    return request({ url: '/user/content/dynamic/' + id + '/like', method: 'POST' });
  },
  /** 动态评论列表(分页) */
  getComments: function (id, params) {
    return request({ url: '/user/content/dynamic/' + id + '/comments', data: params || {} });
  },
  /** 发表评论 */
  createComment: function (id, data) {
    return request({ url: '/user/content/dynamic/' + id + '/comment', method: 'POST', data: data || {} });
  }
};

/** 订阅/会员相关接口 */
const subscription = {
  /** 当前家族订阅状态（套餐+存储用量+按次额度消耗），会员中心展示用 */
  getCurrent: function (familyId) {
    return request({ url: '/user/subscription/current', data: { familyId: familyId } });
  },
  /** 套餐列表（含免费版），会员中心展示用 */
  getPlans: function () {
    return request({ url: '/user/subscription/plans' });
  },
  /** 订阅下单:返回 wx.requestPayment 参数;模拟模式(未配置商户)返回 { mock: true } */
  prepay: function (data) {
    return request({ url: '/user/subscription/prepay', method: 'POST', data: data || {} });
  },
  /** 申请退款(订单支付人本人) */
  refund: function (data) {
    return request({ url: '/user/subscription/refund', method: 'POST', data: data || {} });
  }
};

/** 祭祀祈福相关接口 */
const worship = {
  /** 祭祀页面汇总：今日各类型统计 + 最近祈福记录 */
  getSummary: function (familyId) {
    return request({ url: '/user/worship/summary', data: { familyId: familyId } });
  },
  /** 提交祭祀操作（incense-上香 pray-祈福 offer-献祭 wish-许愿，content 选填） */
  createRecord: function (data) {
    return request({ url: '/user/worship/record', method: 'POST', data: data || {} });
  },
  /** 祈福记录分页（查看更多；page/pageSize/type 选填） */
  getRecordPage: function (familyId, params) {
    return request({ url: '/user/worship/records', data: Object.assign({ familyId: familyId }, params || {}) });
  },
  /** 纪念日/生日提醒（reminder 权益；days 选填，默认 30 天） */
  getReminders: function (familyId, days) {
    return request({ url: '/user/worship/reminders', data: { familyId: familyId, days: days || 30 } });
  },
  /** 纪念对象列表（纪念堂） */
  getMemorials: function (familyId) {
    return request({ url: '/user/worship/memorials', data: { familyId: familyId } });
  },
  /** 纪念对象详情（纪念信息 + 家族最近祭祀记录） */
  getMemorialDetail: function (familyId, id) {
    return request({ url: '/user/worship/memorials/' + id, data: { familyId: familyId } });
  },
  /** 可创建纪念的已故成员列表 */
  getMemorialCandidates: function (familyId) {
    return request({ url: '/user/worship/memorial-candidates', data: { familyId: familyId } });
  },
  /** 创建纪念对象（消耗 worship_pro 额度；data: { familyId, memberId, epitaph? }） */
  createMemorial: function (data) {
    return request({ url: '/user/worship/memorials', method: 'POST', data: data || {} });
  },
  /** 删除纪念对象（仅创建者或家族创建者） */
  deleteMemorial: function (familyId, id) {
    return request({ url: '/user/worship/memorials/' + id, method: 'DELETE', data: { familyId: familyId } });
  }
};

/** 家族会员邀请相关接口 */
const invitation = {
  /** 创建邀请（data: { familyId, inviteePhone?, inviteeEmail?, role?, expireDays?, channel? }） */
  create: function (data) {
    return request({ url: '/user/invitation/create', method: 'POST', data: data || {} });
  },
  /** 我发出的邀请列表 */
  getSentList: function (params) {
    return request({ url: '/user/invitation/sent', data: params || {} });
  },
  /** 我收到的邀请列表 */
  getReceivedList: function (params) {
    return request({ url: '/user/invitation/received', data: params || {} });
  },
  /** 家族全部邀请列表（限创建者/管理员） */
  getFamilyList: function (familyId, params) {
    return request({ url: '/user/invitation/family/' + familyId + '/list', data: params || {} });
  },
  /** 通过邀请码查询邀请信息 */
  getInfoByCode: function (code) {
    return request({ url: '/user/invitation/info/' + encodeURIComponent(code) });
  },
  /** 处理邀请：接受/拒绝（data: { inviteCode, accept, remark? }） */
  process: function (data) {
    return request({ url: '/user/invitation/process', method: 'POST', data: data || {} });
  },
  /** 撤销我发出的邀请 */
  revoke: function (id) {
    return request({ url: '/user/invitation/revoke/' + id, method: 'PUT' });
  }
};

/** 广告轮播相关接口 */
const banner = {
  /** 当前家族启用轮播列表（含全局广告，返回切换间隔 interval） */
  getList: function (familyId) {
    return request({ url: '/user/banner/list', data: { familyId: familyId } });
  },
  /** 全局广告轮播列表（无需登录，所有用户可见） */
  getGlobal: function () {
    return request({ url: '/banner/global' });
  },
  /** 点击上报：用户点击广告后调用（运营统计用，失败静默） */
  recordClick: function (id) {
    return request({ url: '/banner/' + id + '/click', method: 'POST' });
  }
};

/** 应用插件相关接口 */
const plugin = {
  /** 启用中的插件列表（应用中心「应用」分区，无需登录） */
  getList: function () {
    return request({ url: '/plugin/list' });
  }
};

module.exports = { auth, family, familyMember, content, subscription, worship, invitation, banner, plugin };
