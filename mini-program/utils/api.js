const { request } = require('./request');

/** 用户认证相关接口 */
const auth = {
  /** 微信登录:用 wx.login 拿到的 code 换取 token 和用户信息 */
  wxLogin: function (code) {
    return request({ url: '/user/wx-login', method: 'POST', data: { code: code } });
  },
  /** 获取当前用户信息 */
  getProfile: function () {
    return request({ url: '/user/profile' });
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

module.exports = { auth, family, familyMember, content };
