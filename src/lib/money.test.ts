import { describe, expect, it } from 'vitest'
import { formatAmount, formatMajorAmount, majorToMinor, parseAmount, toAmountInput } from './money'

describe('parseAmount', () => {
  it('쉼표를 빼고 최소 단위 정수로 바꾼다', () => {
    expect(parseAmount('1,000', 'KRW')).toEqual({ ok: true, minor: 1000 })
    expect(parseAmount('12.5', 'CNY')).toEqual({ ok: true, minor: 1250 })
  })

  it('통화 자릿수보다 긴 소수와 0을 거절한다', () => {
    expect(parseAmount('10.5', 'KRW').ok).toBe(false)
    expect(parseAmount('1.234', 'CNY').ok).toBe(false)
    expect(parseAmount('0', 'KRW').ok).toBe(false)
  })
})

describe('환전 소수 문자열 변환', () => {
  it('주 단위 문자열을 소수 연산 없이 최소 단위로 바꾼다', () => {
    expect(majorToMinor('10.5', 'CNY')).toBe(1050)
    expect(majorToMinor('0.1', 'CNY')).toBe(10)
    expect(majorToMinor('2000000', 'KRW')).toBe(2000000)
  })

  it('형식이 다르거나 자릿수를 넘으면 null', () => {
    expect(majorToMinor('10.5', 'KRW')).toBeNull()
    expect(majorToMinor('-1', 'KRW')).toBeNull()
    expect(majorToMinor('abc', 'JPY')).toBeNull()
  })

  it('toAmountInput은 parseAmount와 왕복한다', () => {
    expect(toAmountInput(1050, 'CNY')).toBe('10.50')
    expect(toAmountInput(5, 'CNY')).toBe('0.05')
    expect(parseAmount(toAmountInput(1050, 'CNY'), 'CNY')).toEqual({ ok: true, minor: 1050 })
  })

  it('표시 형식은 최소 단위 표시와 같다', () => {
    expect(formatMajorAmount('10100', 'KRW')).toBe(formatAmount(10100, 'KRW'))
    expect(formatMajorAmount('10.5', 'CNY')).toBe('10.50위안')
  })
})
