import { describe, expect, it } from 'vitest'
import { isLoginEmail, isSignupEmail } from './email'

describe('isLoginEmail', () => {
  it.each(['member@example.com', 'a@b', '  member@example.com  ', 'first.last+tag@sub.example.co.kr'])(
    '서버가 받는 형식(%s)은 막지 않는다',
    (email) => {
      expect(isLoginEmail(email)).toBe(true)
    },
  )

  it.each(['', 'member', 'member@', '@example.com', 'a@@example.com', 'a b@example.com', 'a@exa mple.com', 'a@b\u0007'])(
    '흔한 실수(%j)는 막는다',
    (email) => {
      expect(isLoginEmail(email)).toBe(false)
    },
  )

  it('254자를 넘으면 막는다', () => {
    const local = 'a'.repeat(64)
    expect(isLoginEmail(`${local}@${'b'.repeat(254 - 65)}`)).toBe(true)
    expect(isLoginEmail(`${local}@${'b'.repeat(255 - 65)}`)).toBe(false)
  })
})

describe('isSignupEmail', () => {
  it.each(['new@example.com', 'a@b.c', 'first.last@sub.example.co.kr'])('흔한 형식(%s)은 통과한다', (email) => {
    expect(isSignupEmail(email)).toBe(true)
  })

  it.each(['name@gmail', 'name@.com', 'name@gmail.', 'name@gmail..com', 'name'])(
    '도메인에 점이 없거나 비어 있는 부분(%s)이 있으면 막는다',
    (email) => {
      expect(isSignupEmail(email)).toBe(false)
    },
  )
})
