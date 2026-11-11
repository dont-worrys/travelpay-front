/**
 * API 기준 주소. 개발 서버는 Vite 프록시를 쓰므로 비워 둔다(같은 출처 `/api/...`).
 * 배포처럼 Gateway가 다른 출처에 있으면 `VITE_API_BASE_URL`에 지정한다.
 */
export const apiBaseUrl: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

/**
 * Vercel Preview 빌드면 true. 미리보기 주소에서 운영 API를 부르거나 운영 계정으로 로그인하지 못하게
 * 모든 API 요청을 보내기 전에 막는다. 값은 `vite.config.ts`가 `VERCEL_ENV`로 정하며 환경 변수로 바꿀 수 없다.
 */
export const apiDisabled: boolean = import.meta.env.VITE_API_DISABLED === 'true'

export const API_DISABLED_MESSAGE =
  '미리보기(Preview) 환경에서는 API를 호출하지 않습니다. 로그인과 기능 확인은 https://travelpay.store 또는 로컬 개발 서버에서 해 주세요.'
