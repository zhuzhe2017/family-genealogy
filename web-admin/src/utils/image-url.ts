import { getServiceBaseURL } from '@/utils/service';

/**
 * 将后端返回的相对图片路径解析为可访问的完整 URL。
 *
 * 后端上传接口返回相对路径如 /uploads/xxx.png；
 * - 生产环境使用相对路径(如 /api),由 Nginx 反代到后端,静态资源经 /uploads 访问;
 * - 开发/测试环境则拼上服务端源地址(http://host:port),直接跨源加载 /uploads 图片。
 * 已为 http(s) 绝对地址时原样返回。
 */
export function resolveImageUrl(url?: string | null): string {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;

  const { baseURL } = getServiceBaseURL(import.meta.env, false);
  const origin = (baseURL || '').replace(/\/api\/?$/, '');
  return `${origin}${url}`;
}
