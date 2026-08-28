import { request } from '../request';

/**
 * 用户手机号密码登录
 * 租户后台前期使用，后期会补充验证码/扫码登录
 */
export function fetchUserPwdLogin(phone: string, password: string) {
  return request<Api.Auth.LoginToken>({
    url: '/user/pwd-login',
    method: 'post',
    data: { phone, password }
  });
}

/**
 * 用户手机号验证码登录
 */
export function fetchUserPhoneLogin(phone: string, code: string) {
  return request<Api.Auth.LoginToken>({
    url: '/user/phone-login',
    method: 'post',
    data: { phone, code }
  });
}

/**
 * 发送短信验证码
 */
export function fetchUserSendSmsCode(phone: string, scene: 'login' | 'bind' = 'login') {
  return request<{ success: boolean; devCode?: string }>({
    url: '/user/sms/send',
    method: 'post',
    data: { phone, scene }
  });
}

/** 获取当前用户信息（C 端用户 profile） */
export function fetchGetUserInfo() {
  return request<Api.Auth.UserInfo>({ url: '/user/profile' });
}

/** 更新当前用户资料（昵称/头像/性别） */
export function fetchUpdateProfile(data: { nickName?: string; avatarUrl?: string; gender?: number }) {
  return request<{ success: boolean }>({ url: '/user/profile', method: 'put', data });
}

/** 设置/修改当前用户登录密码 */
export function fetchChangePassword(data: { password: string }) {
  return request<{ success: boolean }>({ url: '/user/set-password', method: 'post', data });
}

/**
 * 刷新用户 token
 */
export function fetchRefreshToken(refreshToken: string) {
  return request<Api.Auth.LoginToken>({
    url: '/user/refreshToken',
    method: 'post',
    data: { refreshToken }
  });
}
