import { describe, expect, it } from 'vitest'
import {
  compareDecimalText,
  formatAmount,
  formatMajorAmount,
  majorToMinor,
  parseAmount,
  parseRate,
  toAmountInput,
} from './money'

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

describe('예약 환전 목표 환율', () => {
  it('쉼표·앞뒤 0을 정리한 소수 문자열로 바꾼다', () => {
    expect(parseRate('1,234.50')).toEqual({ ok: true, value: '1234.5' })
    expect(parseRate('0830.00')).toEqual({ ok: true, value: '830' })
    expect(parseRate('0.5')).toEqual({ ok: true, value: '0.5' })
    expect(parseRate('9999999999.99')).toEqual({ ok: true, value: '9999999999.99' })
  })

  it('0, 소수 셋째 자리, 상한 이상, 숫자가 아닌 값을 거절한다', () => {
    expect(parseRate('0.00').ok).toBe(false)
    expect(parseRate('830.555').ok).toBe(false)
    expect(parseRate('10000000000').ok).toBe(false)
    expect(parseRate('-1').ok).toBe(false)
    expect(parseRate('').ok).toBe(false)
  })

  it('소수 문자열을 자릿수를 맞춰 비교한다', () => {
    expect(compareDecimalText('930', '930.00')).toBe(0)
    expect(compareDecimalText('929.99', '930')).toBe(-1)
    expect(compareDecimalText('930.1', '930.09')).toBe(1)
    expect(compareDecimalText('abc', '1')).toBeNull()
  })
})
