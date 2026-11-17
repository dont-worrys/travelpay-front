import { describe, expect, it } from 'vitest'
import { formatPhoneInput } from './phone'

describe('formatPhoneInput', () => {
  it('입력한 자릿수에 맞춰 3-4-4 자리에 하이픈을 붙인다', () => {
    expect(formatPhoneInput('')).toBe('')
    expect(formatPhoneInput('0')).toBe('0')
    expect(formatPhoneInput('010')).toBe('010')
    expect(formatPhoneInput('0101')).toBe('010-1')
    expect(formatPhoneInput('0101234')).toBe('010-1234')
    expect(formatPhoneInput('01012345')).toBe('010-1234-5')
    expect(formatPhoneInput('01012345678')).toBe('010-1234-5678')
  })

  it('하이픈 바로 뒤 숫자를 지우면 끝에 하이픈을 남기지 않는다', () => {
    expect(formatPhoneInput('010-')).toBe('010')
    expect(formatPhoneInput('010-1234-')).toBe('010-1234')
  })

  it('숫자가 아닌 글자는 버리고 11자리를 넘는 숫자는 자른다', () => {
    expect(formatPhoneInput('010 1234 5678')).toBe('010-1234-5678')
    expect(formatPhoneInput('010.1234.5678')).toBe('010-1234-5678')
    expect(formatPhoneInput('abc')).toBe('')
    expect(formatPhoneInput('010123456789')).toBe('010-1234-5678')
  })

  it('이미 맞춘 번호는 그대로 둔다', () => {
    expect(formatPhoneInput('010-1234-5678')).toBe('010-1234-5678')
  })
})
