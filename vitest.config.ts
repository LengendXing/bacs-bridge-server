import { defineConfig } from 'vitest/config';
import path from 'path';

// 独立 vitest 配置——避免 vite.config.ts 的 root='src/client' 导致后端测试被忽略
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/client'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
