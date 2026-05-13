<template>
  <div v-if="ready" class="term-route">
    <TerminalPanel :binding-id="bindingId" :fullscreen="true" />
    <button class="btn-mac btn-mac-sm close-btn" @click="closeWindow">关闭</button>
  </div>
  <div v-else class="boot-screen">
    <div class="msg">{{ bootMsg }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import TerminalPanel from '../components/TerminalPanel.vue';

const route = useRoute();
const bindingId = String(route.params.bindingId || '');
const ready = ref(false);
const bootMsg = ref('正在初始化…');

function getToken(): string | null {
  return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
}

async function bootstrapToken(): Promise<boolean> {
  const url = new URL(window.location.href);
  const boot = url.searchParams.get('boot');
  if (getToken()) {
    if (boot) {
      url.searchParams.delete('boot');
      window.history.replaceState({}, '', url.toString());
    }
    return true;
  }
  if (!boot) {
    bootMsg.value = '未登录或登录态已过期，请回主窗口重新登录后再打开终端。';
    return false;
  }
  try {
    const res = await fetch('/api/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: boot }),
      credentials: 'same-origin',
    });
    const json = await res.json();
    if (json && json.code === 0 && json.data?.token) {
      sessionStorage.setItem('auth_token', String(json.data.token));
      url.searchParams.delete('boot');
      window.history.replaceState({}, '', url.toString());
      return true;
    }
    bootMsg.value = '登录态交换失败';
  } catch (e: any) {
    bootMsg.value = `登录态交换失败: ${e?.message || e}`;
  }
  return false;
}

function closeWindow() {
  if (window.opener) window.close();
  else history.back();
}

onMounted(async () => {
  ready.value = await bootstrapToken();
});
</script>

<style scoped>
.term-route {
  position: fixed;
  inset: 0;
}
.close-btn {
  position: fixed;
  top: 8px;
  right: 12px;
  z-index: 10;
}
.boot-screen {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0b0b0c;
  color: #aaa;
  font-size: 13px;
}
</style>
