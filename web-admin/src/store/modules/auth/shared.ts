import { localStg } from '@/utils/storage';

/** 从本地存储读取 token */
export function getToken() {
  return localStg.get('token');
}

/** 清除认证相关本地存储 */
export function clearAuthStorage() {
  localStg.remove('token');
  localStg.remove('refreshToken');
}
