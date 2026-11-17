const MAX_LENGTH = 254
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/

/**
 * 로그인 이메일 형식. 서버 규칙(`LoginRequest`·`UserCredentials`)과 같다: @ 하나, 공백·제어 문자 없음, 앞뒤가 비지 않음, 254자 이하.
 * 서버가 받는 계정을 화면에서 막지 않도록 서버보다 엄격하게 하지 않는다(서버는 점 없는 도메인도 받는다).
 * 앞뒤 공백은 지운 값으로 본다(보낼 때도 지운다).
 */
export function isLoginEmail(value: string): boolean {
  const email = value.trim()
  return email.length <= MAX_LENGTH && !CONTROL.test(email) && /^[^\s@]+@[^\s@]+$/.test(email)
}

/**
 * 새로 가입할 이메일 형식. 로그인 규칙에 더해 흔한 형식(이름@도메인.최상위도메인)인지 본다.
 * 새 계정이라 기존 계정을 막을 일이 없으므로 "name@gmail"처럼 점이 빠진 오타를 미리 막는다.
 */
export function isSignupEmail(value: string): boolean {
  return isLoginEmail(value) && /@[^\s@.]+(\.[^\s@.]+)+$/.test(value.trim())
}
