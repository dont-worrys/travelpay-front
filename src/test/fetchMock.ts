import { vi } from 'vitest'

/** 테스트에서 가로챈 요청 한 건. */
export interface RecordedRequest {
  method: string
  path: string
  search: string
  headers: Record<string, string>
  body: unknown
}

/** 응답을 돌려주거나, 연결 실패를 흉내 내려면 예외를 던진다. */
export type RouteHandler = (request: RecordedRequest, callIndex: number) => Response | Promise<Response>

/** 공통 성공 응답(`success`·`data`·`error`). */
export function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data, error: null }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 공통 오류 응답. */
export function fail(status: number, code: string, message = '오류', details: { field: string; message: string }[] = []) {
  return new Response(JSON.stringify({ success: false, data: null, error: { code, message, details } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 브라우저 fetch가 연결에 실패할 때와 같은 예외. */
export function networkError(): never {
  throw new TypeError('Failed to fetch')
}

/**
 * 전역 fetch를 `"METHOD /path"` 경로표로 바꾼다. CSRF 토큰 요청은 기본으로 응답한다.
 * 경로표에 없는 요청은 테스트가 놓친 호출이므로 실패시킨다.
 */
export function mockFetch(routes: Record<string, RouteHandler>) {
  const requests: RecordedRequest[] = []
  const counts = new Map<string, number>()
  const allRoutes: Record<string, RouteHandler> = {
    'GET /api/v1/auth/csrf': () => ok({ headerName: 'Csrf-Token', token: 'test-csrf' }),
    ...routes,
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    const request: RecordedRequest = {
      method,
      path: url.pathname,
      search: url.search,
      headers: { ...(init?.headers as Record<string, string> | undefined) },
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    requests.push(request)
    const key = `${method} ${url.pathname}`
    const handler = allRoutes[key]
    if (!handler) {
      throw new Error(`테스트 경로표에 없는 요청: ${key}`)
    }
    const index = counts.get(key) ?? 0
    counts.set(key, index + 1)
    return handler(request, index)
  })
  vi.stubGlobal('fetch', fetchMock)

  return {
    requests,
    /** 특정 메서드·경로로 보낸 요청만. */
    calls(method: string, path: string): RecordedRequest[] {
      return requests.filter((item) => item.method === method && item.path === path)
    },
  }
}
