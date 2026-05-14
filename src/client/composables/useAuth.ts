import { useApi } from './useApi';
import { useAuthStore } from '../stores/auth';
import { getDeviceId } from './useDeviceId';
import type { LoginRequest, LoginResponse, Verify2faRequest } from '@shared/types';

/**
 * 认证组合式函数
 * 封装登录、登出、2FA 验证等认证操作
 */
export function useAuth() {
  const api = useApi();
  const auth = useAuthStore();

  /** 登录（带设备指纹，有信任记录时可跳过 2FA） */
  async function login(username: string, password: string) {
    const deviceId = await getDeviceId();
    const res = await api.post<LoginResponse>('/api/auth/login', {
      username,
      password,
      deviceId,
    } satisfies LoginRequest);
    if (res.code === 0 && res.data) {
      if (!res.data.require2fa) {
        auth.setToken(res.data.token);
      }
    }
    return res;
  }

  /** 2FA 验证（带设备指纹，勾选信任时写入数据库） */
  async function verify2fa(tempToken: string, code: string, trustDevice = false) {
    const deviceId = await getDeviceId();
    const res = await api.post<LoginResponse>('/api/auth/2fa/verify', {
      tempToken,
      code,
      trustDevice,
      deviceId,
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
