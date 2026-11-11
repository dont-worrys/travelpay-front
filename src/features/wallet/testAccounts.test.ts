import { describe, expect, it } from 'vitest'
import { parseLocalTestAccount, withLocalTestAccount, type TestAccount } from './testAccounts'

describe('parseLocalTestAccount', () => {
  it('은행코드:계좌번호:예금주를 읽고 예금주 앞뒤 공백만 정리한다', () => {
    expect(parseLocalTestAccount(' 004:77770000000001: 홍길동 ')).toEqual({
      bankCode: '004',
      accountNumber: '77770000000001',
      holder: '홍길동',
      outcome: '로컬 전용',
    })
    expect(parseLocalTestAccount('004:77770000000001:홍 길동')?.holder).toBe('홍 길동')
  })

  it('값이 없거나 형식이 틀리면 null', () => {
    expect(parseLocalTestAccount(undefined)).toBeNull()
    expect(parseLocalTestAccount('')).toBeNull()
    expect(parseLocalTestAccount('04:77770000000001:홍길동')).toBeNull()
    expect(parseLocalTestAccount('004:7777-0000-0001:홍길동')).toBeNull()
    expect(parseLocalTestAccount('004:123456789:홍길동')).toBeNull()
    expect(parseLocalTestAccount('004:77770000000001:  ')).toBeNull()
  })

  it('화면 은행 목록에 없는 은행 코드면 null', () => {
    expect(parseLocalTestAccount('999:77770000000001:홍길동')).toBeNull()
  })
})

describe('withLocalTestAccount', () => {
  const seed: TestAccount[] = [{ bankCode: '004', accountNumber: '12340101234567', holder: '유재석', outcome: '성공' }]

  it('로컬 계좌를 끝에 붙인다', () => {
    const local = parseLocalTestAccount('004:77770000000001:홍길동')
    expect(withLocalTestAccount(seed, local).map((a) => a.accountNumber)).toEqual(['12340101234567', '77770000000001'])
  })

  it('없거나 시드와 같은 계좌면 그대로 둔다', () => {
    expect(withLocalTestAccount(seed, null)).toBe(seed)
    expect(withLocalTestAccount(seed, parseLocalTestAccount('004:12340101234567:홍길동'))).toBe(seed)
  })
})
