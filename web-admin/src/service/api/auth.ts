import { request } from '../request';

/**
 * Login
 *
 * @param userName User name
 * @param password Password
 * @param captchaToken 验证码 token（开启验证码时必填）
 * @param captchaCode 验证码内容（开启验证码时必填）
 */
export function fetchLogin(userName: string, password: string, captchaToken?: string, captchaCode?: string) {
  return request<Api.Auth.LoginToken>({
    url: '/auth/login',
    method: 'post',
    data: {
      userName,
      password,
      ...(captchaToken && captchaCode ? { captchaToken, captchaCode } : {})
    }
  });
}

/** Get user info */
export function fetchGetUserInfo() {
  return request<Api.Auth.UserInfo>({ url: '/auth/getUserInfo' });
}

/** 更新当前管理员个人资料（昵称/手机号/邮箱/头像） */
export function fetchUpdateProfile(data: { nickname?: string; phone?: string; email?: string; avatarUrl?: string }) {
  return request<{ success: boolean }>({ url: '/auth/profile', method: 'put', data });
}

/** 修改当前管理员登录密码 */
export function fetchChangePassword(data: { oldPassword: string; newPassword: string }) {
  return request<{ success: boolean }>({ url: '/auth/password', method: 'post', data });
}

/**
 * Refresh token
 *
 * @param refreshToken Refresh token
 */
export function fetchRefreshToken(refreshToken: string) {
  return request<Api.Auth.LoginToken>({
    url: '/auth/refreshToken',
    method: 'post',
    data: {
      refreshToken
    }
  });
}

/**
 * return custom backend error
 *
 * @param code error code
 * @param msg error message
 */
export function fetchCustomBackendError(code: string, msg: string) {
  return request({ url: '/auth/error', params: { code, msg } });
}
