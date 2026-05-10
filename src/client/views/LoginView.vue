<template>
  <div class="min-h-screen flex items-center justify-center" style="background: var(--bg)">
    <!-- 登录卡片 - macOS 风格 -->
    <div class="glass-card" style="width: 380px; max-width: 90vw">
      <div class="flex items-center gap-3 mb-4">
        <BacsLogo :size="36" />
      </div>
      <p class="text-sm mb-6" style="color: var(--text-secondary)">请输入账号和密码</p>

      <!-- 账号密码表单 -->
      <form v-if="!show2fa" @submit.prevent="handleLogin">
        <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">账号</label>
        <input
          v-model="username"
          type="text"
          class="input-mac mb-4"
          placeholder="请输入账号"
          autocomplete="username"
          required
          autofocus
        />
        <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">密码</label>
        <input
          v-model="password"
          type="password"
          class="input-mac mb-6"
          placeholder="输入密码"
          required
        />
        <button
          type="submit"
          class="btn-mac btn-mac-primary w-full"
          style="padding: 12px; font-size: 16px"
          :disabled="loading"
        >
          {{ loading ? '登录中...' : '登录' }}
        </button>
        <p v-if="error" class="text-sm mt-3" style="color: var(--danger)">{{ error }}</p>
      </form>

      <!-- 2FA 验证表单 -->
      <form v-else @submit.prevent="handleVerify2fa">
        <div class="text-center mb-4">
          <div class="text-3xl mb-2">🔐</div>
          <h3 class="text-lg font-semibold" style="color: var(--text)">两步验证</h3>
          <p class="text-sm" style="color: var(--text-secondary)">请输入认证器中的 6 位验证码</p>
        </div>
        <input
          v-model="totpCode"
          type="text"
          class="input-mac mb-2 text-center text-2xl tracking-widest"
          placeholder="000000"
          maxlength="6"
          required
          autofocus
          style="letter-spacing: 0.5em"
        />
        <label class="flex items-center gap-2 mt-3 mb-5 cursor-pointer text-sm" style="color: var(--text)">
          <input v-model="trustDevice" type="checkbox" class="accent-indigo-500" />
          <span>信任此设备（30天内免验证）</span>
        </label>
        <button
          type="submit"
          class="btn-mac btn-mac-primary w-full"
          style="padding: 12px; font-size: 16px"
          :disabled="loading"
        >
          {{ loading ? '验证中...' : '验证' }}
        </button>
        <p v-if="error" class="text-sm mt-3" style="color: var(--danger)">{{ error }}</p>
        <button type="button" class="btn-mac w-full mt-3" @click="show2fa = false">返回</button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * LoginView - 登录页
 * 支持账号密码登录 + TOTP 两步验证
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth';
import BacsLogo from '../components/BacsLogo.vue';

const router = useRouter();
const { login, verify2fa } = useAuth();

const username = ref('');
const password = ref('');
const totpCode = ref('');
const trustDevice = ref(false);
const loading = ref(false);
const error = ref('');
const show2fa = ref(false);
const tempToken = ref('');

/** 处理登录提交 */
async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    const res = await login(username.value, password.value);
    if (res.code === 0 && res.data) {
      if (res.data.require2fa) {
        // 需要 2FA 验证
        tempToken.value = res.data.tempToken || '';
        show2fa.value = true;
      } else {
        // 登录成功，跳转首页
        router.push('/');
      }
    } else {
      error.value = res.message || '登录失败';
    }
  } catch (e: any) {
    error.value = '网络错误，请重试';
  } finally {
    loading.value = false;
  }
}

/** 处理 2FA 验证提交 */
async function handleVerify2fa() {
  error.value = '';
  loading.value = true;
  try {
    const res = await verify2fa(tempToken.value, totpCode.value, trustDevice.value);
    if (res.code === 0) {
      router.push('/');
    } else {
      error.value = res.message || '验证码错误';
    }
  } catch (e: any) {
    error.value = '网络错误，请重试';
  } finally {
    loading.value = false;
  }
}
</script>
