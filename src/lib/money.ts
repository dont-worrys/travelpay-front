/**
 * 금액은 서버와 같이 통화별 최소 단위의 정수(KRW 원, JPY 엔, CNY 펀)로 다룬다.
 * 화면 입력·표시만 주 단위로 바꾸며, 변환은 문자열로 처리해 소수 연산 오차를 피한다.
 */
export const CURRENCIES = ['KRW', 'JPY', 'CNY'] as const
export type Currency = (typeof CURRENCIES)[number]

interface CurrencyInfo {
  /** 최소 단위까지의 소수 자릿수. CNY 1위안 = 100펀. */
  decimals: number
  unit: string
  label: string
}

export const CURRENCY_INFO: Record<Currency, CurrencyInfo> = {
  KRW: { decimals: 0, unit: '원', label: '원화(KRW)' },
  JPY: { decimals: 0, unit: '엔', label: '엔화(JPY)' },
  CNY: { decimals: 2, unit: '위안', label: '위안화(CNY)' },
}

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value)
}

export type ParseAmountResult = { ok: true; minor: number } | { ok: false; message: string }

/** 사용자가 입력한 주 단위 금액(예: "1,000", "12.5")을 최소 단위 정수로 바꾼다. */
export function parseAmount(input: string, currency: Currency): ParseAmountResult {
  const { decimals, unit } = CURRENCY_INFO[currency]
  const text = input.trim().replace(/,/g, '')
  if (!text) {
    return { ok: false, message: '금액을 입력해 주세요.' }
  }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text)
  if (!match) {
    return { ok: false, message: '숫자만 입력해 주세요.' }
  }
  const whole = match[1] ?? '0'
  const fraction = match[2] ?? ''
  if (fraction.length > decimals) {
    return {
      ok: false,
      message: decimals === 0 ? `${unit} 단위로 입력해 주세요.` : `소수점 아래 ${decimals}자리까지 입력할 수 있습니다.`,
    }
  }
  const minor = BigInt(whole + fraction.padEnd(decimals, '0'))
  if (minor <= 0n) {
    return { ok: false, message: '0보다 큰 금액을 입력해 주세요.' }
  }
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { ok: false, message: '금액이 너무 큽니다.' }
  }
  return { ok: true, minor: Number(minor) }
}

/** 최소 단위 정수를 "10,000원", "12.50위안"처럼 표시한다. */
export function formatAmount(minor: number, currency: string): string {
  const info = isCurrency(currency) ? CURRENCY_INFO[currency] : { decimals: 0, unit: ` ${currency}` }
  const negative = minor < 0
  const digits = String(Math.abs(Math.trunc(minor))).padStart(info.decimals + 1, '0')
  const wholeDigits = digits.slice(0, digits.length - info.decimals)
  const fraction = info.decimals > 0 ? `.${digits.slice(-info.decimals)}` : ''
  const whole = BigInt(wholeDigits).toLocaleString('ko-KR')
  return `${negative ? '-' : ''}${whole}${fraction}${info.unit}`
}
