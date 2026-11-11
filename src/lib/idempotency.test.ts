import { describe, expect, it, vi } from 'vitest'
import { newIdempotencyKey } from './idempotency'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newIdempotencyKey', () => {
  it('UUID v4를 만들고 부를 때마다 다른 값을 준다', () => {
    const first = newIdempotencyKey()
    const second = newIdempotencyKey()

    expect(first).toMatch(UUID_V4)
    expect(second).toMatch(UUID_V4)
    expect(first).not.toBe(second)
  })

  it('randomUUID가 없는 환경(보안 컨텍스트 밖)에서도 같은 형식으로 만든다', () => {
    const original = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: original.getRandomValues.bind(original) })

    const keys = new Set(Array.from({ length: 20 }, () => newIdempotencyKey()))

    expect(keys.size).toBe(20)
    for (const key of keys) {
      expect(key).toMatch(UUID_V4)
    }
  })
})
