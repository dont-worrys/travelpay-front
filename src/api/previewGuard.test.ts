import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockFetch, ok } from '../test/fetchMock'
import type { ApiError } from './ApiError'

// apiDisabled는 모듈을 읽을 때 정해지므로 환경 값을 바꾼 뒤 모듈을 새로 불러온다.
async function loadClient(disabled: string) {
  vi.stubEnv('VITE_API_DISABLED', disabled)
  vi.resetModules()
  const client = await import('./client')
  const errors = await import('./ApiError')
  return { ...client, ...errors }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Preview 빌드 API 차단', () => {
  it('막힌 빌드는 GET·POST 모두 fetch 없이 실패하고 결과 모름으로 보지 않는다', async () => {
    const api = mockFetch({
      'GET /api/v1/users/me': () => ok({}),
      'POST /api/v1/auth/login': () => ok({}),
    })
    const { apiRequest, CLIENT_ERROR_CODES, isOutcomeUnknown } = await loadClient('true')

    for (const request of [
      apiRequest('/api/v1/users/me'),
      apiRequest('/api/v1/auth/login', { method: 'POST', body: { email: 'a', password: 'b' } }),
    ]) {
      const error = (await request.catch((e: unknown) => e)) as ApiError
      expect(error.code).toBe(CLIENT_ERROR_CODES.API_DISABLED)
      expect(error.message).toContain('미리보기')
      expect(isOutcomeUnknown(error)).toBe(false)
    }
    expect(api.requests).toHaveLength(0)
  })

  it('막히지 않은 빌드는 그대로 요청한다', async () => {
    const api = mockFetch({ 'GET /api/v1/users/me': () => ok({ id: 'u' }) })
    const { apiRequest } = await loadClient('false')

    await expect(apiRequest('/api/v1/users/me')).resolves.toEqual({ id: 'u' })
    expect(api.calls('GET', '/api/v1/users/me')).toHaveLength(1)
  })
})
