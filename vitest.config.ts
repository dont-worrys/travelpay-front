import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// 컴포넌트 테스트 설정. 앱 빌드 설정(vite.config.ts)과 분리해 테스트 도구가 빌드에 섞이지 않게 한다.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
