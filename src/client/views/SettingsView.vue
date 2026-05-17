<!--
  SettingsView - 设置页
  包含账户设置（修改密码）、两步验证（TOTP 2FA）、菜单栏布局
-->
<template>
  <div>
    <h2 class="text-lg font-semibold mb-6" style="color: var(--text)">{{ t('settings.title') }}</h2>

    <!-- 菜单栏布局 -->
    <div class="glass-card mb-6">
      <h3 class="text-base font-semibold mb-4" style="color: var(--text)">{{ t('settings.menuLayout') }}</h3>
      <p class="text-sm mb-4" style="color: var(--text-secondary)">
        {{ t('settings.menuLayoutHint') }}
      </p>
      <div class="flex items-center gap-3">
        <button
          class="btn-mac btn-mac-sm"
          :class="{ 'btn-mac-primary': menuLayout === 'top' }"
          @click="setLayout('top')"
        >
          {{ t('settings.layoutTop') }}
        </button>
        <button
          class="btn-mac btn-mac-sm"
          :class="{ 'btn-mac-primary': menuLayout === 'left' }"
          @click="setLayout('left')"
        >
          {{ t('settings.layoutLeft') }}
        </button>
      </div>
    </div>

    <!-- 快捷登录（客户端扫码） -->
    <div class="glass-card mb-6">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-base font-semibold" style="color: var(--text)">{{ t('settings.sectionQr') }}</h3>
        <span v-if="qrCountdown > 0" class="text-xs" style="color: var(--text-secondary)">
          {{ t('settings.qrAutoRefresh', { n: qrCountdown }) }}
        </span>
      </div>
      <p class="text-sm mb-4" style="color: var(--text-secondary)">
        {{ t('settings.qrHint') }}
      </p>
      <div class="flex items-start gap-4">
        <div
          style="width: 200px; height: 200px; background: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center;"
        >
          <canvas ref="qrLoginCanvas" style="width: 180px; height: 180px"></canvas>
        </div>
        <div class="flex-1">
          <p v-if="qrServer" class="text-xs mb-2" style="color: var(--text-secondary)">
            {{ t('settings.serverLabel') }}: <code style="color: var(--text)">{{ qrServer }}</code>
          </p>
          <p v-if="qrError" class="text-sm mb-2" style="color: var(--danger)">{{ qrError }}</p>
          <button
            class="btn-mac btn-mac-sm"
            :disabled="qrLoading"
            @click="refreshQrLogin"
          >
            {{ qrLoading ? t('settings.generating') : t('settings.manualRefresh') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 对外服务地址 -->
    <div class="glass-card mb-6">
      <h3 class="text-base font-semibold mb-2" style="color: var(--text)">{{ t('settings.externalUrl') }}</h3>
      <p class="text-sm mb-3" style="color: var(--text-secondary)">
        {{ t('settings.externalUrlHint') }}
      </p>
      <form @submit.prevent="handleSaveExternalUrl" class="flex items-center gap-2 max-w-xl">
        <input
          v-model="externalUrlInput"
          type="text"
          class="input-mac"
          :placeholder="t('settings.externalUrlPlaceholder')"
          style="flex: 1"
        />
        <button type="submit" class="btn-mac btn-mac-sm" :disabled="externalUrlSaving">
          {{ externalUrlSaving ? t('settings.saving') : t('settings.save') }}
        </button>
      </form>
      <p v-if="externalUrlError" class="text-sm mt-2" style="color: var(--danger)">{{ externalUrlError }}</p>
      <p v-if="externalUrlSuccess" class="text-sm mt-2" style="color: var(--success)">{{ externalUrlSuccess }}</p>
    </div>

    <!-- 账户设置 -->
    <div class="glass-card mb-6">
      <h3 class="text-base font-semibold mb-4" style="color: var(--text)">{{ t('settings.sectionSecurity') }}</h3>
      <form @submit.prevent="handleChangePassword" class="max-w-sm">
        <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('settings.oldPassword') }}</label>
        <input
          v-model="oldPassword"
          type="password"
          class="input-mac mb-3"
          :placeholder="t('settings.oldPassword')"
          autocomplete="current-password"
          required
        />

        <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('settings.newPassword') }}</label>
        <input
          v-model="newPassword"
          type="password"
          class="input-mac mb-3"
          :placeholder="t('settings.newPassword')"
          autocomplete="new-password"
          required
        />

        <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('settings.confirmPassword') }}</label>
        <input
          v-model="confirmPassword"
          type="password"
          class="input-mac mb-4"
          :placeholder="t('settings.confirmPassword')"
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
          {{ pwdLoading ? t('common.submitting') : t('settings.changePassword') }}
        </button>
      </form>
    </div>

    <!-- 两步验证 -->
    <div class="glass-card">
      <h3 class="text-base font-semibold mb-4" style="color: var(--text)">{{ t('settings.totpEnable') }}</h3>
      <p class="text-sm mb-4" style="color: var(--text-secondary)">
        {{ t('settings.totpHint') }}
      </p>

      <!-- 已启用状态 -->
      <template v-if="totpEnabled">
        <div class="flex items-center gap-2 mb-4">
          <span class="badge badge-online">{{ t('settings.enabledBadge') }}</span>
        </div>
        <form @submit.prevent="handleDisableTotp" class="max-w-sm">
          <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">{{ t('settings.disableConfirmLabel') }}</label>
          <input
            v-model="disablePassword"
            type="password"
            class="input-mac mb-3"
            :placeholder="t('settings.disablePasswordPlaceholder')"
            autocomplete="current-password"
            required
          />
          <p v-if="disableError" class="text-sm mb-2" style="color: var(--danger)">{{ disableError }}</p>
          <button type="submit" class="btn-mac btn-mac-danger btn-mac-sm" :disabled="disableLoading">
            {{ disableLoading ? t('settings.totpDisabling') : t('settings.totpDisable') }}
          </button>
        </form>
      </template>

      <!-- 未启用状态 -->
      <template v-else>
        <span class="badge badge-offline mb-3" style="display: inline-block">{{ t('settings.disabledBadge') }}</span>
        <div v-if="!totpQrUrl">
          <button
            class="btn-mac btn-mac-primary btn-mac-sm"
            :disabled="totpLoading"
            @click="handleEnableTotp"
          >
            {{ totpLoading ? t('settings.totpGenerating') : t('settings.totpEnableBtn') }}
          </button>
          <p v-if="totpError" class="text-sm mt-2" style="color: var(--danger)">{{ totpError }}</p>
        </div>
        <div v-else>
          <!-- QR 码展示 -->
          <div class="mb-3">
            <p class="text-sm mb-2" style="color: var(--text-secondary)">
              {{ t('settings.totpScanQr') }}
            </p>
            <canvas ref="qrCanvas" style="width: 180px; height: 180px; border-radius: 8px"></canvas>
            <p class="text-xs mt-2" style="color: var(--text-secondary)">
              {{ t('settings.secretLabel') }}: {{ totpSecret }}
            </p>
          </div>
          <!-- 验证码确认 -->
          <form @submit.prevent="handleConfirmTotp" class="max-w-xs">
            <label class="block text-xs font-medium mb-1" style="color: var(--text-secondary)">
              {{ t('settings.totpCodeLabel') }}
            </label>
            <input
              v-model="totpCode"
              type="text"
              class="input-mac mb-2 text-center tracking-widest"
              :placeholder="t('settings.totpCodePlaceholder')"
              maxlength="6"
              required
              style="letter-spacing: 0.5em"
            />
            <label class="flex items-center gap-2 mb-3 cursor-pointer text-sm" style="color: var(--text)">
              <input v-model="trustDeviceOnEnable" type="checkbox" />
              <span>{{ t('settings.trustDevice30days') }}</span>
            </label>
            <p v-if="totpError" class="text-sm mb-2" style="color: var(--danger)">{{ totpError }}</p>
            <button type="submit" class="btn-mac btn-mac-primary btn-mac-sm" :disabled="totpLoading">
              {{ totpLoading ? t('settings.totpVerifying') : t('settings.totpConfirm') }}
            </button>
          </form>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApi } from '../composables/useApi';
import { useAuth } from '../composables/useAuth';
import type { TotpSetupResponse } from '@shared/types';
import QRCode from 'qrcode';

const { t } = useI18n();
const api = useApi();
const auth = useAuth();

// ── 菜单栏布局 ──
const menuLayout = ref<'top' | 'left'>(localStorage.getItem('menuLayout') as 'top' | 'left' || 'top');

function setLayout(layout: 'top' | 'left') {
  menuLayout.value = layout;
  localStorage.setItem('menuLayout', layout);
}

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
    pwdError.value = t('settings.passwordMismatch');
    return;
  }
  pwdLoading.value = true;
  try {
    const res = await api.post('/api/auth/change-password', {
      oldPassword: oldPassword.value,
      newPassword: newPassword.value,
    });
    if (res.code === 0) {
      pwdSuccess.value = t('settings.passwordSuccess');
      oldPassword.value = '';
      newPassword.value = '';
      confirmPassword.value = '';
    } else {
      pwdError.value = res.message || t('common.operationFailed');
    }
  } catch {
    pwdError.value = t('common.networkError');
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
      totpError.value = res.message || t('settings.qrError');
    }
  } catch {
    totpError.value = t('common.networkError');
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
      if (err) totpError.value = t('settings.totpQrFailed');
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
      totpError.value = res.message || t('settings.totpCodeError');
    }
  } catch {
    totpError.value = t('common.networkError');
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
      disableError.value = res.message || t('common.operationFailed');
    }
  } catch {
    disableError.value = t('common.networkError');
  } finally {
    disableLoading.value = false;
  }
}

// ── 快捷登录二维码 ──
const qrLoginCanvas = ref<HTMLCanvasElement | null>(null);
const qrServer = ref('');
const qrCountdown = ref(0);
const qrLoading = ref(false);
const qrError = ref('');
let qrTimer: ReturnType<typeof setInterval> | null = null;

async function refreshQrLogin() {
  qrError.value = '';
  qrLoading.value = true;
  if (qrTimer) { clearInterval(qrTimer); qrTimer = null; }
  try {
    const res = await api.post<{ token: string; server: string; expiresIn: number }>('/api/auth/qr-token', {});
    if (res.code !== 0 || !res.data) {
      qrError.value = res.message || t('settings.qrError');
      return;
    }
    const { token, server, expiresIn } = res.data;
    qrServer.value = server;
    const payload = JSON.stringify({ type: 'bacs-login', server, token });
    await nextTick();
    if (qrLoginCanvas.value) {
      await QRCode.toCanvas(qrLoginCanvas.value, payload, {
        width: 180,
        margin: 1,
        color: { dark: '#1d1d1f', light: '#ffffff' },
      });
    }
    qrCountdown.value = expiresIn;
    qrTimer = setInterval(() => {
      qrCountdown.value -= 1;
      if (qrCountdown.value <= 0) {
        if (qrTimer) { clearInterval(qrTimer); qrTimer = null; }
        refreshQrLogin();
      }
    }, 1000);
  } catch {
    qrError.value = t('common.networkError');
  } finally {
    qrLoading.value = false;
  }
}

// ── 对外服务地址 ──
const externalUrlInput = ref('');
const externalUrlSaving = ref(false);
const externalUrlError = ref('');
const externalUrlSuccess = ref('');

async function loadExternalUrl() {
  try {
    const res = await api.get<{ externalUrl: string }>('/api/settings/external-url');
    if (res.code === 0 && res.data) {
      externalUrlInput.value = res.data.externalUrl || '';
    }
  } catch { /* ignore */ }
}

async function handleSaveExternalUrl() {
  externalUrlError.value = '';
  externalUrlSuccess.value = '';
  externalUrlSaving.value = true;
  try {
    const res = await api.put<{ externalUrl: string }>('/api/settings/external-url', {
      externalUrl: externalUrlInput.value,
    });
    if (res.code === 0) {
      externalUrlSuccess.value = t('settings.saved');
      // 立即刷新二维码以应用新地址
      refreshQrLogin();
    } else {
      externalUrlError.value = res.message || t('common.operationFailed');
    }
  } catch {
    externalUrlError.value = t('common.networkError');
  } finally {
    externalUrlSaving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadTotpStatus(), loadExternalUrl()]);
  refreshQrLogin();
});

onBeforeUnmount(() => {
  if (qrTimer) { clearInterval(qrTimer); qrTimer = null; }
});
</script>
