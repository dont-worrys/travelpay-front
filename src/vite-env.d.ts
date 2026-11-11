/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Gateway 기준 주소. 비우면 같은 출처(개발 서버 프록시)로 요청한다. */
  readonly VITE_API_BASE_URL?: string
  /** 'true'면 배포 빌드에서도 충전 화면에 Mock Bank 테스트 계좌 버튼을 보여 준다(개발 서버는 항상 표시). */
  readonly VITE_SHOW_TEST_ACCOUNTS?: string
  /** 로컬 DB에만 넣은 Mock Bank 계좌 `은행코드:계좌번호:예금주`. 테스트 계좌 버튼 끝에 '로컬 전용'으로 붙는다. */
  readonly VITE_LOCAL_TEST_ACCOUNT?: string
  /** 'true'면 API 요청을 보내지 않는다. `vite.config.ts`가 Vercel Preview 빌드에서만 켠다(직접 설정 불가). */
  readonly VITE_API_DISABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
