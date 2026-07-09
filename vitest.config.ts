import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// 순수 로직(돈 계산·매칭·회계) 단위/시나리오 테스트. Firebase·React 없이 node 환경.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
