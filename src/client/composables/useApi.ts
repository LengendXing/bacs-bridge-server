import { ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import type { ApiResponse } from '@shared/types';
import { ErrorCode } from '@shared/types';

/**
 * API 请求封装
 * 统一处理 JWT 注入、401 跳转、响应解包
 */
export function useApi() {
  const auth = useAuthStore();

  /** GET 请求 */
  async function get<T>(path: string): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {};
    if (auth.token) headers['X-Auth-Token'] = auth.token;

    const res = await fetch(path, { headers });
    if (res.status === 401) {
      auth.clearToken();
      throw new Error('未登录');
    }
    return res.json();
  }

  /** POST 请求 */
  async function post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth.token) headers['X-Auth-Token'] = auth.token;

    const res = await fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      auth.clearToken();
      throw new Error('未登录');
    }
    return res.json();
  }

  /** PUT 请求 */
  async function put<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth.token) headers['X-Auth-Token'] = auth.token;

    const res = await fetch(path, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      auth.clearToken();
      throw new Error('未登录');
    }
    return res.json();
  }

  /** DELETE 请求 */
  async function del<T>(path: string): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {};
    if (auth.token) headers['X-Auth-Token'] = auth.token;

    const res = await fetch(path, {
      method: 'DELETE',
      headers,
    });
    if (res.status === 401) {
      auth.clearToken();
      throw new Error('未登录');
    }
    return res.json();
  }

  return { get, post, put, del };
}
