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
  /** 家族成员角色列表（仅族长可分配/回收角色） */
  getFamilyRoles: function () {
    return request({ url: '/user/family/roles' });
  },
  /** 设置成员角色（role: admin 设为管理员 / member 取消管理员） */
  setFamilyRole: function (userId, role) {
    return request({ url: '/user/family/roles/' + userId, method: 'PUT', data: { role: role } });
  },
  /** 更新当前用户资料 */
  updateProfile: function (data) {
    return request({ url: '/user/profile', method: 'PUT', data: data });
  },
  /** 注销账号 */
  deleteAccount: function () {
    return request({ url: '/user/account', method: 'DELETE' });
  },
  /** 记录隐私政策/用户协议同意（docType: privacy / agreement / member_notice） */
  recordConsent: function (docType, docVersion) {
    return request({ url: '/user/consent', method: 'POST', data: { docType: docType, docVersion: docVersion } });
  },
  /** 查询当前用户已同意的文档版本 */
  getConsents: function () {
    return request({ url: '/user/consent' });
  },
  /** 记录微信订阅消息授权（wx.requestSubscribeMessage 成功后调用） */
  recordSubscribeAuth: function (tmplId, scene) {
    return request({ url: '/user/subscribe-message/record', method: 'POST', data: { tmplId: tmplId, scene: scene || 'renewal_reminder' } });
  },
  /** 查询当前用户订阅消息授权数量 */
  getSubscribeCount: function () {
    return request({ url: '/user/subscribe-message/count' });
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
  /** 成员轻量搜索(选择场景用,仅 id/name/gender,支持分页) */
  search: function (familyId, params) {
    return request({ url: '/user/family/' + familyId + '/members/search', data: params || {} });
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

/** 内容分类相关接口(album-相册分类 document-文档分类;type 二选一) */
const category = {
  /** 分类列表(首次访问自动初始化默认分类,含各分类文件计数) */
  getList: function (type, familyId) {
    return request({ url: '/user/category/' + type + '/list', data: { familyId: familyId } });
  },
  /** 创建分类(仅家族创建者/管理员;data: { familyId, name, icon? }) */
  create: function (type, data) {
    return request({ url: '/user/category/' + type + '/create', method: 'POST', data: data || {} });
  },
  /** 更新分类(仅家族创建者/管理员;data: { familyId, name?, icon?, sortOrder? }) */
  update: function (type, id, data) {
    return request({ url: '/user/category/' + type + '/' + id, method: 'PUT', data: data || {} });
  },
  /** 删除分类(仅家族创建者/管理员;分类下有文件时拒绝) */
  remove: function (type, familyId, id) {
    return request({ url: '/user/category/' + type + '/' + id + '?familyId=' + familyId, method: 'DELETE' });
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

/** 用户侧会员（CRM 会员档案：等级/积分/消费，绑定手机号后自动建档） */
const member = {
  /** 我的会员信息：{ member, level, pointsRecords }，未建档 member=null */
  getProfile: function () {
    return request({ url: '/user/member/profile' });
  },
  /** 每日签到得积分（当天重复签到返回 409） */
  signIn: function () {
    return request({ url: '/user/member/signin', method: 'POST' });
  }
};

/** 数据备份相关接口（familyId 为当前家族ID；创建备份需 backup 权益，未解锁返回 4xxx） */
const backup = {
  /** 备份记录列表（倒序，含文件大小） */
  getList: function (familyId) {
    return request({ url: '/user/family/' + familyId + '/backups' });
  },
  /** 创建备份：打包家族数据生成 JSON 备份文件 */
  create: function (familyId) {
    return request({ url: '/user/family/' + familyId + '/backup', method: 'POST' });
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
  /** 通过邀请码查询邀请信息（含小程序码/分享/加入计数） */
  getInfoByCode: function (code) {
    return request({ url: '/user/invitation/info/' + encodeURIComponent(code) });
  },
  /** 主动触发生成小程序码（微信凭证未配置时 qrCodeUrl 为空串） */
  generateWxacode: function (code) {
    return request({ url: '/user/invitation/wxacode/' + encodeURIComponent(code) });
  },
  /** 记录一次分享（分享海报/链接/扫码） */
  recordShare: function (code) {
    return request({ url: '/user/invitation/share/' + encodeURIComponent(code), method: 'POST' });
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

/** 宗亲聚会相关接口（familyId 为当前家族ID，后端校验家族归属与组织者权限） */
const gathering = {
  /** 聚会分页列表 */
  getList: function (familyId, params) {
    return request({ url: '/user/gathering/list', data: Object.assign({ familyId: familyId }, params || {}) });
  },
  /** 聚会详情（含场次/我的报名/是否组织者/归档资料） */
  getDetail: function (familyId, id) {
    return request({ url: '/user/gathering/' + id, data: { familyId: familyId } });
  },
  /** 创建聚会 */
  create: function (familyId, data) {
    return request({ url: '/user/gathering', method: 'POST', data: data || {} });
  },
  /** 编辑聚会（组织者） */
  update: function (familyId, id, data) {
    return request({ url: '/user/gathering/' + id, method: 'PUT', data: data || {} });
  },
  /** 状态流转（组织者）：0-草稿 1-已发布 2-进行中 3-已结束 4-已归档 */
  updateStatus: function (familyId, id, status) {
    return request({ url: '/user/gathering/' + id + '/status', method: 'PUT', data: { status: status } });
  },
  /** 删除聚会（组织者） */
  remove: function (familyId, id) {
    return request({ url: '/user/gathering/' + id, method: 'DELETE' });
  },
  /** 报名（data: { sessionId?, name, phone?, dietType?, dietNote?, specialNeed?, guestCount? }） */
  register: function (familyId, id, data) {
    return request({ url: '/user/gathering/' + id + '/register', method: 'POST', data: data || {} });
  },
  /** 我的报名记录 */
  getMyRegistration: function (familyId, id) {
    return request({ url: '/user/gathering/' + id + '/registration/mine', data: { familyId: familyId } });
  },
  /** 取消报名 */
  cancelRegistration: function (registrationId) {
    return request({ url: '/user/gathering/registration/' + registrationId + '/cancel', method: 'PUT' });
  },
  /** 我的签到信息（6位签到码 + 二维码） */
  getCheckinCode: function (familyId, id) {
    return request({ url: '/user/gathering/' + id + '/checkin-code', data: { familyId: familyId } });
  },
  /** 现场签到（data: { code, method? }，双通道：手动输入/扫码核销） */
  checkin: function (familyId, id, data) {
    return request({ url: '/user/gathering/' + id + '/checkin', method: 'POST', data: data || {} });
  },
  /** 报名名单（组织者） */
  getRegistrations: function (familyId, id, params) {
    return request({ url: '/user/gathering/' + id + '/registrations', data: Object.assign({ familyId: familyId }, params || {}) });
  },
  /** 参会统计分析（组织者） */
  getStats: function (familyId, id) {
    return request({ url: '/user/gathering/' + id + '/stats', data: { familyId: familyId } });
  },
  /** 新增归档资料（组织者） */
  createArchive: function (familyId, id, data) {
    return request({ url: '/user/gathering/' + id + '/archive', method: 'POST', data: data || {} });
  },
  /** 删除归档资料（组织者） */
  deleteArchive: function (familyId, id, archiveId) {
    return request({ url: '/user/gathering/' + id + '/archive/' + archiveId, method: 'DELETE' });
  }
};

/**
 * 家族基金相关接口
 * familyId 统一拼入 URL query（POST/PUT 也可携带，后端 @Query 取参）
 * 后端校验家族归属、角色权限、限额与大额审批
 */
const fund = {
  /** 基金信息 + 我的角色/权限（无基金时 hasFund=false） */
  getInfo: function (familyId) {
    return request({ url: '/user/fund/info?familyId=' + familyId });
  },
  /** 创建基金（每家族唯一，创建人自动成为族长） */
  create: function (familyId, data) {
    return request({ url: '/user/fund?familyId=' + familyId, method: 'POST', data: data || {} });
  },
  /** 更新基金基本信息与限额规则（manage_rule） */
  updateSettings: function (familyId, data) {
    return request({ url: '/user/fund/settings?familyId=' + familyId, method: 'PUT', data: data || {} });
  },
  /** 基金成员列表（view_all 可见全部，否则仅本人） */
  getMembers: function (familyId) {
    return request({ url: '/user/fund/members?familyId=' + familyId });
  },
  /** 添加基金成员（manage_member） */
  addMember: function (familyId, data) {
    return request({ url: '/user/fund/members?familyId=' + familyId, method: 'POST', data: data || {} });
  },
  /** 更新成员角色/权限（manage_member） */
  updateMember: function (familyId, userId, data) {
    return request({ url: '/user/fund/members/' + userId + '?familyId=' + familyId, method: 'PUT', data: data || {} });
  },
  /** 移除基金成员（manage_member） */
  removeMember: function (familyId, userId) {
    return request({ url: '/user/fund/members/' + userId + '?familyId=' + familyId, method: 'DELETE' });
  },
  /** 存入（data: { amount, paymentMethod?, remark? }） */
  deposit: function (familyId, data) {
    return request({ url: '/user/fund/deposit?familyId=' + familyId, method: 'POST', data: data || {} });
  },
  /** 取出（超阈值自动进入待审批） */
  withdraw: function (familyId, data) {
    return request({ url: '/user/fund/withdraw?familyId=' + familyId, method: 'POST', data: data || {} });
  },
  /** 成员间转账（data: { amount, targetUserId, remark? }） */
  transfer: function (familyId, data) {
    return request({ url: '/user/fund/transfer?familyId=' + familyId, method: 'POST', data: data || {} });
  },
  /** 调账（族长：data: { amount, direction, remark? }） */
  adjust: function (familyId, data) {
    return request({ url: '/user/fund/adjust?familyId=' + familyId, method: 'POST', data: data || {} });
  },
  /** 审批大额取出（approve：data: { approved, remark? }） */
  approveTx: function (familyId, txId, data) {
    return request({ url: '/user/fund/transactions/' + txId + '/approve?familyId=' + familyId, method: 'POST', data: data || {} });
  },
  /** 交易明细分页（params: { type?, status?, userId?, startDate?, endDate?, page?, pageSize? }） */
  getTransactions: function (familyId, params) {
    return request({ url: '/user/fund/transactions?familyId=' + familyId, data: params || {} });
  },
  /** 慈善榜单（params: { limit? }，默认10条） */
  rank: function (familyId, params) {
    return request({ url: '/user/fund/rank?familyId=' + familyId, data: params || {} });
  },
  /** 基金统计（余额/今日/本月/我的） */
  getStats: function (familyId) {
    return request({ url: '/user/fund/stats?familyId=' + familyId });
  },
  /** 解散基金（dissolve，公共池余额需为 0） */
  dissolve: function (familyId, data) {
    return request({ url: '/user/fund/dissolve?familyId=' + familyId, method: 'POST', data: data || {} });
  }
};

module.exports = { auth, family, familyMember, content, category, subscription, member, backup, worship, invitation, banner, plugin, gathering, fund };
