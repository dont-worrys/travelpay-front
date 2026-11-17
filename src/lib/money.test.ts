import { describe, expect, it } from 'vitest'
import {
  compareDecimalText,
  formatAmount,
  formatMajorAmount,
  groupAmountInput,
  majorToMinor,
  parseAmount,
  parseRate,
  sanitizeAmountInput,
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

describe('금액 칸 입력 거르기·쉼표', () => {
  it('숫자만 남기고 마이너스·문자·쉼표는 들어가지 않는다', () => {
    expect(sanitizeAmountInput('-5000', 'KRW')).toBe('5000')
    expect(sanitizeAmountInput('1,000원', 'KRW')).toBe('1000')
    expect(sanitizeAmountInput('abc', 'KRW')).toBe('')
    expect(sanitizeAmountInput('1e5', 'JPY')).toBe('15')
  })

  it('소수가 없는 통화는 소수점을 받지 않고, 붙여 넣은 소수는 소수점 앞만 남긴다', () => {
    expect(sanitizeAmountInput('125', 'KRW')).toBe('125')
    expect(sanitizeAmountInput('12.50', 'KRW')).toBe('12')
    expect(sanitizeAmountInput('12.', 'JPY')).toBe('12')
  })

  it('소수가 있는 통화(CNY)는 소수점 하나와 둘째 자리까지 둔다', () => {
    expect(sanitizeAmountInput('12.345', 'CNY')).toBe('12.34')
    expect(sanitizeAmountInput('1.2.3', 'CNY')).toBe('1.23')
    expect(sanitizeAmountInput('.5', 'CNY')).toBe('0.5')
    expect(sanitizeAmountInput('12.', 'CNY')).toBe('12.')
  })

  it('앞쪽 0은 하나만 두고, 정수는 15자리에서 자른다', () => {
    expect(sanitizeAmountInput('000120', 'KRW')).toBe('120')
    expect(sanitizeAmountInput('0', 'KRW')).toBe('0')
    expect(sanitizeAmountInput('00.5', 'CNY')).toBe('0.5')
    expect(sanitizeAmountInput('1'.repeat(20), 'KRW')).toHaveLength(15)
  })

  it('보일 때는 정수 부분에 세 자리마다 쉼표를 넣고 소수는 그대로 둔다', () => {
    expect(groupAmountInput('')).toBe('')
    expect(groupAmountInput('100')).toBe('100')
    expect(groupAmountInput('1000')).toBe('1,000')
    expect(groupAmountInput('1000000')).toBe('1,000,000')
    expect(groupAmountInput('1234.5')).toBe('1,234.5')
    expect(groupAmountInput('1234.')).toBe('1,234.')
  })

  it('거른 값은 parseAmount가 그대로 읽는다', () => {
    expect(parseAmount(sanitizeAmountInput('1,000원', 'KRW'), 'KRW')).toEqual({ ok: true, minor: 1000 })
    expect(parseAmount(sanitizeAmountInput('12.5', 'CNY'), 'CNY')).toEqual({ ok: true, minor: 1250 })
  })
})
