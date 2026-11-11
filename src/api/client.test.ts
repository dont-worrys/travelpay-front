import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fail, mockFetch, networkError, ok } from '../test/fetchMock'
import { CLIENT_ERROR_CODES, isOutcomeUnknown, type ApiError } from './ApiError'
import { apiRequest, apiRequestWithStatus, setUnauthorizedListener } from './client'
import { clearCsrfToken } from './csrf'

const CSRF_PATH = '/api/v1/auth/csrf'
/** Gateway CORS가 허용하는 요청 헤더. 이 밖의 헤더를 붙이면 preflight에서 거절된다. */
const ALLOWED_HEADERS = ['Accept', 'Content-Type', 'Csrf-Token', 'Idempotency-Key']

async function catchError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    return error as ApiError
  }
  throw new Error('요청이 실패하지 않았습니다.')
}

beforeEach(() => {
  // CSRF 토큰은 모듈 상태라 테스트마다 비운다.
  clearCsrfToken()
})

afterEach(() => {
  setUnauthorizedListener(null)
})

describe('apiRequest', () => {
  it('GET은 CSRF 토큰을 받지 않고, 비어 있는 쿼리 값은 뺀다', async () => {
    const api = mockFetch({ 'GET /api/v1/items': () => ok({ value: 1 }) })

    const data = await apiRequest<{ value: number }>('/api/v1/items', {
      query: { page: 0, status: '', from: undefined, to: null, desc: true },
    })

    expect(data).toEqual({ value: 1 })
    expect(api.calls('GET', CSRF_PATH)).toHaveLength(0)
    const [request] = api.calls('GET', '/api/v1/items')
    expect(request?.search).toBe('?page=0&desc=true')
    expect(request?.headers['Csrf-Token']).toBeUndefined()
  })

  it('변경 요청에는 CSRF 토큰을 한 번만 받아 붙이고, 허용된 헤더만 쓴다', async () => {
    const api = mockFetch({ 'POST /api/v1/items': () => ok({ id: 'a' }, 201) })

    const result = await apiRequestWithStatus('/api/v1/items', {
      method: 'POST',
      body: { amount: 1000 },
      idempotencyKey: 'key-1',
    })
    await apiRequest('/api/v1/items', { method: 'POST', body: { amount: 2000 }, idempotencyKey: 'key-2' })

    expect(result).toEqual({ status: 201, data: { id: 'a' } })
    expect(api.calls('GET', CSRF_PATH)).toHaveLength(1)
    const [first, second] = api.calls('POST', '/api/v1/items')
    expect(first?.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Csrf-Token': 'test-csrf',
      'Idempotency-Key': 'key-1',
    })
    expect(first?.body).toEqual({ amount: 1000 })
    expect(second?.headers['Idempotency-Key']).toBe('key-2')
    for (const request of api.requests) {
      for (const name of Object.keys(request.headers)) {
        expect(ALLOWED_HEADERS).toContain(name)
      }
    }
  })

  it('CSRF 토큰이 무효(403 COMMON_CSRF_INVALID)면 새 토큰으로 같은 멱등성 키를 한 번만 다시 보낸다', async () => {
    const api = mockFetch({
      [`GET ${CSRF_PATH}`]: (_request, index) => ok({ headerName: 'Csrf-Token', token: `token-${index}` }),
      'POST /api/v1/payments': (_request, index) =>
        index === 0 ? fail(403, 'COMMON_CSRF_INVALID') : ok({ paymentId: 'p1' }, 201),
    })

    const data = await apiRequest('/api/v1/payments', { method: 'POST', body: { amount: 5000 }, idempotencyKey: 'key-1' })

    expect(data).toEqual({ paymentId: 'p1' })
    const [first, second] = api.calls('POST', '/api/v1/payments')
    expect(first?.headers['Csrf-Token']).toBe('token-0')
    expect(second?.headers['Csrf-Token']).toBe('token-1')
    expect(second?.headers['Idempotency-Key']).toBe('key-1')
    expect(second?.body).toEqual(first?.body)
  })

  it('CSRF가 아닌 403은 다시 보내지 않고 서버 오류 코드를 그대로 던진다', async () => {
    const api = mockFetch({ 'POST /api/v1/items': () => fail(403, 'COMMON_FORBIDDEN', '권한 없음') })

    const error = await catchError(apiRequest('/api/v1/items', { method: 'POST' }))

    expect(error.status).toBe(403)
    expect(error.code).toBe('COMMON_FORBIDDEN')
    expect(error.message).toBe('권한 없음')
    expect(api.calls('POST', '/api/v1/items')).toHaveLength(1)
  })

  it('오류 응답의 details를 필드별 메시지로 읽는다', async () => {
    mockFetch({
      'POST /api/v1/items': () =>
        fail(400, 'COMMON_VALIDATION_FAILED', '입력 오류', [
          { field: 'amount', message: '1 이상' },
          { field: 'amount', message: '두 번째' },
          { field: 'memo', message: '100자 이하' },
        ]),
    })

    const error = await catchError(apiRequest('/api/v1/items', { method: 'POST', body: {} }))

    expect(error.fieldMessages()).toEqual({ amount: '1 이상', memo: '100자 이하' })
    expect(isOutcomeUnknown(error)).toBe(false)
  })

  it('연결 실패는 status 0 네트워크 오류이고 결과 모름으로 본다', async () => {
    mockFetch({ 'POST /api/v1/items': () => networkError() })

    const error = await catchError(apiRequest('/api/v1/items', { method: 'POST' }))

    expect(error.status).toBe(0)
    expect(error.code).toBe(CLIENT_ERROR_CODES.NETWORK)
    expect(isOutcomeUnknown(error)).toBe(true)
  })

  it('CSRF 토큰을 받지 못하면 변경 요청을 보내지 않는다', async () => {
    const api = mockFetch({
      [`GET ${CSRF_PATH}`]: () => new Response('', { status: 503 }),
      'POST /api/v1/items': () => ok(null),
    })

    const error = await catchError(apiRequest('/api/v1/items', { method: 'POST' }))

    expect(error.code).toBe(CLIENT_ERROR_CODES.NETWORK)
    expect(api.calls('POST', '/api/v1/items')).toHaveLength(0)
  })

  it('공통 형식이 아닌 5xx는 Gateway에 닿지 못한 것으로, 4xx는 해석 불가로 본다', async () => {
    mockFetch({
      'GET /api/v1/proxy-down': () => new Response('', { status: 500 }),
      'GET /api/v1/html-404': () => new Response('<html></html>', { status: 404 }),
    })

    const down = await catchError(apiRequest('/api/v1/proxy-down'))
    const notFound = await catchError(apiRequest('/api/v1/html-404'))

    expect(down.code).toBe(CLIENT_ERROR_CODES.NETWORK)
    expect(isOutcomeUnknown(down)).toBe(true)
    expect(notFound.code).toBe(CLIENT_ERROR_CODES.UNEXPECTED_RESPONSE)
    expect(isOutcomeUnknown(notFound)).toBe(false)
  })

  it('공통 형식의 5xx는 서버 코드를 유지하되 결과 모름으로 본다', async () => {
    mockFetch({ 'POST /api/v1/items': () => fail(503, 'COMMON_SERVICE_UNAVAILABLE') })

    const error = await catchError(apiRequest('/api/v1/items', { method: 'POST' }))

    expect(error.code).toBe('COMMON_SERVICE_UNAVAILABLE')
    expect(isOutcomeUnknown(error)).toBe(true)
  })

  it('성공 상태라도 공통 형식이 아니면 해석 불가 오류다', async () => {
    mockFetch({ 'GET /api/v1/items': () => new Response('{"value":1}', { status: 200 }) })

    const error = await catchError(apiRequest('/api/v1/items'))

    expect(error.code).toBe(CLIENT_ERROR_CODES.UNEXPECTED_RESPONSE)
  })

  it('204는 본문 없이 undefined를 돌려준다', async () => {
    mockFetch({ 'POST /api/v1/auth/logout': () => new Response(null, { status: 204 }) })

    await expect(apiRequest('/api/v1/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('401이면 등록된 리스너를 부른다', async () => {
    const listener = vi.fn()
    setUnauthorizedListener(listener)
    mockFetch({ 'GET /api/v1/users/me': () => fail(401, 'COMMON_UNAUTHORIZED') })

    const error = await catchError(apiRequest('/api/v1/users/me'))

    expect(error.status).toBe(401)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('요청을 취소하면 AbortError를 그대로 던진다', async () => {
    mockFetch({
      'GET /api/v1/items': () => {
        throw new DOMException('aborted', 'AbortError')
      },
    })

    await expect(apiRequest('/api/v1/items')).rejects.toMatchObject({ name: 'AbortError' })
  })
})
