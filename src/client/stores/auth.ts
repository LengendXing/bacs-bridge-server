import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

/**
 * 认证状态管理
 * 管理 JWT token、用户信息、2FA 状态
 */
export const useAuthStore = defineStore('auth', () => {
  /** JWT token */
  const token = ref<string | null>(sessionStorage.getItem('auth_token'));
  /** 是否已认证 */
  const isAuthenticated = computed(() => !!token.value);

  /** 存储 token 并持久化到 sessionStorage */
  function setToken(newToken: string) {
    token.value = newToken;
    sessionStorage.setItem('auth_token', newToken);
  }

  /** 清除 token（登出） */
  function clearToken() {
    token.value = null;
    sessionStorage.removeItem('auth_token');
  }

  return { token, isAuthenticated, setToken, clearToken };
});
