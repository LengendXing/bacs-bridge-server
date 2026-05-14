import FingerprintJS from '@fingerprintjs/fingerprintjs';

const STORAGE_KEY = 'bacs_device_id';

let _cached: string | null = null;

/**
 * 获取当前浏览器的稳定设备指纹 ID。
 *
 * 计算过程：
 * 1. 优先读 localStorage 缓存，已有则直接返回
 * 2. 否则调用 FingerprintJS 计算指纹，写入 localStorage 后返回
 *
 * FingerprintJS 基于 canvas、WebGL、字体、UA 等多个维度，
 * 清 cookie 不影响结果，同一浏览器重启后结果稳定。
 */
export async function getDeviceId(): Promise<string> {
  if (_cached) return _cached;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    _cached = stored;
    return stored;
  }

  const fp = await FingerprintJS.load();
  const result = await fp.get();
  const id = result.visitorId;

  localStorage.setItem(STORAGE_KEY, id);
  _cached = id;
  return id;
}
