/** 관리자 화면 입력 도우미. 서버가 UUID가 아닌 값을 400으로 거절하므로 보내기 전에 거른다. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

/** URL 검색 파라미터의 페이지 번호(0부터). 잘못된 값은 0. */
export function pageParam(value: string | null): number {
  return Math.max(0, Number.parseInt(value ?? '0', 10) || 0)
}

/**
 * `datetime-local` 입력(브라우저 시간대)을 서버용 UTC ISO-8601로 바꾼다. 비었으면 undefined, 해석할 수 없으면 null.
 */
export function localDateTimeToIso(value: string): string | undefined | null {
  if (!value) {
    return undefined
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** 지금부터 거슬러 올라간 경과 시간("3일 4시간"). 서버 시각과 브라우저 시각 차이만큼 어긋날 수 있다. */
export function elapsedSince(iso: string, now: number = Date.now()): string {
  const start = new Date(iso).getTime()
  if (Number.isNaN(start)) {
    return '-'
  }
  const totalHours = Math.max(0, Math.floor((now - start) / 3_600_000))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  return days > 0 ? `${days}일 ${hours}시간` : `${hours}시간`
}

export function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}
