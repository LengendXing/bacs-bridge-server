import { useApi } from './useApi';
import { useAuthStore } from '../stores/auth';
import type { LoginRequest, LoginResponse, Verify2faRequest } from '@shared/types';

/**
 * 认证组合式函数
 * 封装登录、登出、2FA 验证等认证操作
 */
export function useAuth() {
  const api = useApi();
  const auth = useAuthStore();

  /** 登录 */
  async function login(username: string, password: string) {
    const res = await api.post<LoginResponse>('/api/auth/login', { username, password } satisfies LoginRequest);
    if (res.code === 0 && res.data) {
      if (!res.data.require2fa) {
        // 无需 2FA，直接拿到 JWT
        auth.setToken(res.data.token);
      }
    }
    return res;
  }

  /** 2FA 验证 */
  async function verify2fa(tempToken: string, code: string, trustDevice = false) {
    const res = await api.post<LoginResponse>('/api/auth/2fa/verify', {
      tempToken,
      code,
      trustDevice,
    } satisfies Verify2faRequest);
    if (res.code === 0 && res.data?.token) {
      auth.setToken(res.data.token);
    }
    return res;
  }

  /** 登出 */
  async function logout() {
    try {
      await api.post('/api/auth/logout', {});
    } finally {
      auth.clearToken();
    }
  }

  return { login, verify2fa, logout };
}
