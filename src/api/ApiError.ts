import type { FieldErrorDetail } from './types'

/** 서버에 닿지 못했거나(연결 실패) 응답을 해석할 수 없을 때 쓰는 클라이언트 쪽 오류 코드. */
export const CLIENT_ERROR_CODES = {
  NETWORK: 'CLIENT_NETWORK_ERROR',
  UNEXPECTED_RESPONSE: 'CLIENT_UNEXPECTED_RESPONSE',
  /** Preview 배포처럼 API 호출을 막은 빌드. 요청을 보내지 않았으므로 결과 모름이 아니다. */
  API_DISABLED: 'CLIENT_API_DISABLED',
} as const

/**
 * API 실패를 나타낸다. 서버가 보낸 공통 오류면 `code`·`message`·`details`를 그대로 담고,
 * 서버에 닿지 못했으면 `status`가 0이다.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: FieldErrorDetail[]

  constructor(status: number, code: string, message: string, details: FieldErrorDetail[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** 필드 이름별 첫 오류 메시지. 폼 입력 옆에 표시할 때 쓴다. */
  fieldMessages(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const detail of this.details) {
      if (!(detail.field in result)) {
        result[detail.field] = detail.message
      }
    }
    return result
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/**
 * 서버가 처리했는지 알 수 없는 실패(연결 실패·5xx). 금전 요청은 이때 같은 멱등성 키로 다시 보내야 한다.
 * 4xx는 서버가 판단을 끝낸 응답이다.
 */
export function isOutcomeUnknown(error: unknown): boolean {
  if (!isApiError(error)) {
    return true
  }
  return error.code === CLIENT_ERROR_CODES.NETWORK || error.status >= 500
}
