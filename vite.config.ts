import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// 개발 서버는 /api 요청을 Gateway로 넘긴다. 브라우저는 프런트와 같은 출처로 요청하므로
// 세션 쿠키는 localhost:5173 기준으로 저장된다.
// 프록시는 Origin 헤더를 그대로 넘기므로 Gateway 실행 시 GATEWAY_CORS_ALLOWED_ORIGINS에
// http://localhost:5173을 넣어야 한다(없으면 Gateway가 403 COMMON_FORBIDDEN).
export default defineConfig(({ mode }) => {
  // API_PROXY_TARGET은 설정 파일에서만 읽는다(VITE_ 접두사가 없어 브라우저 코드에 노출되지 않음).
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.API_PROXY_TARGET || 'http://127.0.0.1:8080'
  // Vercel Preview 빌드는 운영 API·운영 계정 로그인을 쓰지 못하게 API 호출을 막는다.
  // VERCEL_ENV는 Vercel이 빌드 때 넣는 값(production·preview·development)이라 환경 변수 실수로 풀리지 않는다.
  const apiDisabled = process.env.VERCEL_ENV === 'preview'

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_API_DISABLED': JSON.stringify(apiDisabled ? 'true' : 'false'),
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
  }
})
