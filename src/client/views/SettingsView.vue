<!--
  SettingsView - 设置页
  包含账户设置（修改密码）、两步验证（TOTP 2FA）、菜单栏布局
-->
<template>
  <div>
    <h2 class="text-lg font-semibold mb-6" style="color: var(--text)">设置</h2>

    <!-- 菜单栏布局 -->
    <div class="glass-card mb-6">
      <h3 class="text-base font-semibold mb-4" style="color: var(--text)">菜单栏布局</h3>
      <p class="text-sm mb-4" style="color: var(--text-secondary)">
        选择菜单栏的位置：顶部（标签页风格）或左侧（传统后台风格）
      </p>
      <div class="flex items-center gap-3">
        <button
          class="btn-mac btn-mac-sm"
          :class="{ 'btn-mac-primary': menuLayout === 'top' }"
          @click="setLayout('top')"
        >
          顶部标签
        </button>
        <button
          class="btn-mac btn-mac-sm"
          :class="{ 'btn-mac-primary': menuLayout === 'left' }"
          @click="setLayout('left')"
        >
          左侧菜单
        </button>
      </div>
    </div>

    <!-- 账户设置 -->
    <div class="glass-card mb-6">
      <h3 class="text-base font-semibold mb-4" style="color: var(--text)">账户设置</h3>
      <form @submit.prevent="handleChangePassword" class="max-w-sm">
        <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">旧密码</label>
        <input
          v-model="oldPassword"
          type="password"
          class="input-mac mb-3"
          placeholder="输入旧密码"
          autocomplete="current-password"
          required
        />

        <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">新密码</label>
        <input
          v-model="newPassword"
          type="password"
          class="input-mac mb-3"
          placeholder="输入新密码"
          autocomplete="new-password"
          required
        />

        <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">确认新密码</label>
        <input
          v-model="confirmPassword"
          type="password"
          class="input-mac mb-4"
          placeholder="再次输入新密码"
          autocomplete="new-password"
          required
        />

        <p v-if="pwdError" class="text-sm mb-3" style="color: var(--danger)">{{ pwdError }}</p>
        <p v-if="pwdSuccess" class="text-sm mb-3" style="color: var(--success)">{{ pwdSuccess }}</p>

        <button
          type="submit"
          class="btn-mac btn-mac-primary btn-mac-sm"
          :disabled="pwdLoading"
        >
          {{ pwdLoading ? '提交中...' : '修改密码' }}
        </button>
      </form>
    </div>

    <!-- 两步验证 -->
    <div class="glass-card">
      <h3 class="text-base font-semibold mb-4" style="color: var(--text)">两步验证</h3>
      <p class="text-sm mb-4" style="color: var(--text-secondary)">
        启用 TOTP 两步验证后，登录时需要额外输入认证器中的验证码。
      </p>

      <!-- 已启用状态 -->
      <template v-if="totpEnabled">
        <div class="flex items-center gap-2 mb-4">
          <span class="badge badge-online">已启用</span>
        </div>
        <form @submit.prevent="handleDisableTotp" class="max-w-sm">
          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">输入当前密码确认禁用</label>
          <input
            v-model="disablePassword"
            type="password"
            class="input-mac mb-3"
            placeholder="输入当前密码"
            autocomplete="current-password"
            required
          />
          <p v-if="disableError" class="text-sm mb-2" style="color: var(--danger)">{{ disableError }}</p>
          <button type="submit" class="btn-mac btn-mac-danger btn-mac-sm" :disabled="disableLoading">
            {{ disableLoading ? '禁用中...' : '禁用两步验证' }}
          </button>
        </form>
      </template>

      <!-- 未启用状态 -->
      <template v-else>
        <span class="badge badge-offline mb-3" style="display: inline-block">未启用</span>
        <div v-if="!totpQrUrl">
          <button
            class="btn-mac btn-mac-primary btn-mac-sm"
            :disabled="totpLoading"
            @click="handleEnableTotp"
          >
            {{ totpLoading ? '生成中...' : '启用两步验证' }}
          </button>
          <p v-if="totpError" class="text-sm mt-2" style="color: var(--danger)">{{ totpError }}</p>
        </div>
        <div v-else>
          <!-- QR 码展示 -->
          <div class="mb-3">
            <p class="text-sm mb-2" style="color: var(--text-secondary)">
              使用认证器 App 扫描下方二维码：
            </p>
            <canvas ref="qrCanvas" style="width: 180px; height: 180px; border-radius: 8px"></canvas>
            <p class="text-xs mt-2" style="color: var(--text-secondary)">
              密钥：{{ totpSecret }}
            </p>
          </div>
          <!-- 验证码确认 -->
          <form @submit.prevent="handleConfirmTotp" class="max-w-xs">
            <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">
              输入 6 位验证码完成绑定
            </label>
            <input
              v-model="totpCode"
              type="text"
              class="input-mac mb-2 text-center tracking-widest"
              placeholder="000000"
              maxlength="6"
              required
              style="letter-spacing: 0.5em"
            />
            <label class="flex items-center gap-2 mb-3 cursor-pointer text-sm" style="color: var(--text)">
              <input v-model="trustDeviceOnEnable" type="checkbox" />
              <span>同时信任当前设备（30天免2FA）</span>
            </label>
            <p v-if="totpError" class="text-sm mb-2" style="color: var(--danger)">{{ totpError }}</p>
            <button type="submit" class="btn-mac btn-mac-primary btn-mac-sm" :disabled="totpLoading">
              {{ totpLoading ? '验证中...' : '确认启用' }}
            </button>
          </form>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useApi } from '../composables/useApi';
import { useAuth } from '../composables/useAuth';
import type { TotpSetupResponse } from '@shared/types';
import QRCode from 'qrcode';

const api = useApi();
const auth = useAuth();

// ── 菜单栏布局 ──
const menuLayout = ref<'top' | 'left'>(localStorage.getItem('menuLayout') as 'top' | 'left' || 'top');

function setLayout(layout: 'top' | 'left') {
  menuLayout.value = layout;
  localStorage.setItem('menuLayout', layout);
  document.documentElement.setAttribute('data-layout', layout);
}

// 初始化布局属性
document.documentElement.setAttribute('data-layout', menuLayout.value);

// ── 修改密码 ──
const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const pwdLoading = ref(false);
const pwdError = ref('');
const pwdSuccess = ref('');

async function handleChangePassword() {
  pwdError.value = '';
  pwdSuccess.value = '';
  if (newPassword.value !== confirmPassword.value) {
    pwdError.value = '两次输入的新密码不一致';
    return;
  }
  pwdLoading.value = true;
  try {
    const res = await api.post('/api/auth/change-password', {
      oldPassword: oldPassword.value,
      newPassword: newPassword.value,
    });
    if (res.code === 0) {
      pwdSuccess.value = '密码修改成功';
      oldPassword.value = '';
      newPassword.value = '';
      confirmPassword.value = '';
    } else {
      pwdError.value = res.message || '修改失败';
    }
  } catch {
    pwdError.value = '网络错误，请重试';
  } finally {
    pwdLoading.value = false;
  }
}

// ── 两步验证 ──
const totpEnabled = ref(false);
const totpQrUrl = ref('');
const totpSecret = ref('');
const totpCode = ref('');
const totpLoading = ref(false);
const totpError = ref('');
const trustDeviceOnEnable = ref(true);
const qrCanvas = ref<HTMLCanvasElement | null>(null);

// 禁用 2FA
const disablePassword = ref('');
const disableLoading = ref(false);
const disableError = ref('');

/** 查询当前 2FA 状态 */
async function loadTotpStatus() {
  try {
    const res = await api.get<{ enabled: boolean }>('/api/auth/2fa/status');
    if (res.code === 0 && res.data) {
      totpEnabled.value = res.data.enabled;
    }
  } catch {
    /* ignore */
  }
}

/** 请求启用 2FA — 获取 QR 码和密钥 */
async function handleEnableTotp() {
  totpError.value = '';
  totpLoading.value = true;
  try {
    const res = await api.get<TotpSetupResponse>('/api/auth/2fa/setup');
    if (res.code === 0 && res.data) {
      totpQrUrl.value = res.data.qrUrl;
      totpSecret.value = res.data.secret;
      // 等 DOM 更新后渲染 QR
      await nextTick();
      renderQr();
    } else {
      totpError.value = res.message || '生成 QR 码失败';
    }
  } catch {
    totpError.value = '网络错误，请重试';
  } finally {
    totpLoading.value = false;
  }
}

/** 渲染 QR 码到 canvas */
function renderQr() {
  if (qrCanvas.value && totpQrUrl.value) {
    QRCode.toCanvas(qrCanvas.value, totpQrUrl.value, {
      width: 180,
      margin: 2,
      color: { dark: '#1d1d1f', light: '#ffffff' },
    }, (err) => {
      if (err) totpError.value = 'QR 码渲染失败';
    });
  }
}

/** 提交验证码完成 2FA 启用 */
async function handleConfirmTotp() {
  totpError.value = '';
  totpLoading.value = true;
  try {
    const res = await api.post('/api/auth/2fa/enable', {
      code: totpCode.value,
      trustDevice: trustDeviceOnEnable.value,
    });
    if (res.code === 0) {
      totpEnabled.value = true;
      totpQrUrl.value = '';
      totpSecret.value = '';
      totpCode.value = '';
    } else {
      totpError.value = res.message || '验证码错误';
    }
  } catch {
    totpError.value = '网络错误，请重试';
  } finally {
    totpLoading.value = false;
  }
}

/** 禁用 2FA */
async function handleDisableTotp() {
  disableError.value = '';
  disableLoading.value = true;
  try {
    const res = await api.post('/api/auth/2fa/disable', {
      password: disablePassword.value,
    });
    if (res.code === 0) {
      totpEnabled.value = false;
      disablePassword.value = '';
    } else {
      disableError.value = res.message || '禁用失败';
    }
  } catch {
    disableError.value = '网络错误，请重试';
  } finally {
    disableLoading.value = false;
  }
}

onMounted(loadTotpStatus);
</script>
