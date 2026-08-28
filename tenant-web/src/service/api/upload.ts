import axios from 'axios';
import { getServiceBaseURL } from '@/utils/service';
import { getAuthorization } from '../request/shared';

export interface UploadImageResult {
  url: string;
  filename: string;
  size: number;
}

/**
 * 上传图片到后端 /common/upload，返回相对 URL（/uploads/xxx.png）。
 * 支持上传进度回调（0-100）。
 */
export async function uploadImage(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ data?: UploadImageResult; error?: any }> {
  const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === 'Y';
  const { baseURL } = getServiceBaseURL(import.meta.env, isHttpProxy);

  const form = new FormData();
  form.append('file', file);

  try {
    const response = await axios.post<App.Service.Response<UploadImageResult>>(
      `${baseURL}/common/upload`,
      form,
      {
        headers: {
          Authorization: getAuthorization() || '',
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: progressEvent => {
          const total = progressEvent.total || 0;
          const percent = total > 0 ? Math.round((progressEvent.loaded * 100) / total) : 0;
          onProgress?.(percent);
        }
      }
    );
    const body = response.data;
    if (String(body.code) === import.meta.env.VITE_SERVICE_SUCCESS_CODE) {
      return { data: body.data };
    }
    return { error: new Error(body.msg || '上传失败') };
  } catch (error: any) {
    const msg = error?.response?.data?.msg || error?.message || '上传失败';
    return { error: new Error(msg) };
  }
}
