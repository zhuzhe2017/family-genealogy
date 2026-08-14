import { getServiceBaseURL } from '@/utils/service';

/**
 * 将后端返回的相对图片路径解析为可访问的完整 URL。
 *
 * 后端上传接口返回相对路径如 /uploads/xxx.png；
 * - 开发环境开启代理(VITE_HTTP_PROXY=Y)时直接使用相对路径,由 vite 的 /uploads 代理转发;
 * - 生产/直连模式则拼上服务端源地址(http://host:port)。
 * 已为 http(s) 绝对地址时原样返回。
 */
export function resolveImageUrl(url?: string | null): string {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;

  const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === 'Y';
  if (isHttpProxy) return url;

  const { baseURL } = getServiceBaseURL(import.meta.env, false);
  const origin = (baseURL || '').replace(/\/api\/?$/, '');
  return `${origin}${url}`;
}
