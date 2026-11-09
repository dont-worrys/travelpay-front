/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Gateway 기준 주소. 비우면 같은 출처(개발 서버 프록시)로 요청한다. */
  readonly VITE_API_BASE_URL?: string
  /** 'true'면 배포 빌드에서도 충전 화면에 Mock Bank 테스트 계좌 버튼을 보여 준다(개발 서버는 항상 표시). */
  readonly VITE_SHOW_TEST_ACCOUNTS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
