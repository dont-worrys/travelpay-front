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

/** 최소 단위 정수를 입력란에 넣을 주 단위 문자열(예: 1250 CNY → "12.50")로 바꾼다. `parseAmount`의 반대. */
export function toAmountInput(minor: number, currency: Currency): string {
  const { decimals } = CURRENCY_INFO[currency]
  const digits = String(Math.abs(Math.trunc(minor))).padStart(decimals + 1, '0')
  return decimals > 0 ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}` : digits
}

/**
 * 서버가 주 단위 소수 문자열로 준 금액(환전 API, 예: CNY "10.5")을 최소 단위 정수로 바꾼다.
 * 문자열로만 처리하며, 형식이 다르거나 통화 자릿수보다 소수가 길면 null.
 */
export function majorToMinor(value: string, currency: Currency): number | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim())
  const { decimals } = CURRENCY_INFO[currency]
  if (!match || (match[2] ?? '').length > decimals) {
    return null
  }
  const minor = BigInt((match[1] ?? '0') + (match[2] ?? '').padEnd(decimals, '0'))
  return minor > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(minor)
}

/** 주 단위 소수 문자열 금액을 `formatAmount`와 같이 표시한다. 해석할 수 없으면 원문에 통화를 붙인다. */
export function formatMajorAmount(value: string, currency: string): string {
  const minor = isCurrency(currency) ? majorToMinor(value, currency) : null
  return minor === null ? `${value} ${currency}` : formatAmount(minor, currency)
}

/** 환율처럼 계산하지 않고 보여 주기만 하는 소수 문자열에 천 단위 쉼표를 넣는다(예: "1234.5" → "1,234.5"). */
export function formatDecimalText(value: string): string {
  const match = /^(\d+)(\.\d+)?$/.exec(value.trim())
  if (!match) {
    return value
  }
  return `${BigInt(match[1] ?? '0').toLocaleString('ko-KR')}${match[2] ?? ''}`
}

/** 예약 환전 목표 환율의 소수 자릿수와 상한(서버와 같음: 0 초과, 10^10 미만). */
const RATE_DECIMALS = 2
const RATE_MAX_WHOLE_DIGITS = 10

export type ParseRateResult = { ok: true; value: string } | { ok: false; message: string }

/**
 * 목표 환율 입력(예: "1,234.5")을 서버에 보낼 소수 문자열("1234.5")로 바꾼다. 문자열로만 검사하며 계산하지 않는다.
 */
export function parseRate(input: string): ParseRateResult {
  const text = input.trim().replace(/,/g, '')
  if (!text) {
    return { ok: false, message: '목표 환율을 입력해 주세요.' }
  }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text)
  if (!match) {
    return { ok: false, message: '숫자만 입력해 주세요.' }
  }
  const whole = (match[1] ?? '0').replace(/^0+(?=\d)/, '')
  const fraction = (match[2] ?? '').replace(/0+$/, '')
  if (fraction.length > RATE_DECIMALS) {
    return { ok: false, message: `소수점 아래 ${RATE_DECIMALS}자리까지 입력할 수 있습니다.` }
  }
  if (whole.length > RATE_MAX_WHOLE_DIGITS) {
    return { ok: false, message: '목표 환율이 너무 큽니다.' }
  }
  if (/^0*$/.test(whole + fraction)) {
    return { ok: false, message: '0보다 큰 환율을 입력해 주세요.' }
  }
  return { ok: true, value: fraction ? `${whole}.${fraction}` : whole }
}

/**
 * 음이 아닌 소수 문자열 두 개를 비교한다(-1·0·1). 화면 안내용이며, 형식이 다르면 null.
 * 자릿수를 맞춘 정수로 비교해 부동소수점을 쓰지 않는다.
 */
export function compareDecimalText(a: string, b: string): -1 | 0 | 1 | null {
  const pattern = /^(\d+)(?:\.(\d+))?$/
  const ma = pattern.exec(a.trim())
  const mb = pattern.exec(b.trim())
  if (!ma || !mb) {
    return null
  }
  const scale = Math.max((ma[2] ?? '').length, (mb[2] ?? '').length)
  const left = BigInt((ma[1] ?? '0') + (ma[2] ?? '').padEnd(scale, '0'))
  const right = BigInt((mb[1] ?? '0') + (mb[2] ?? '').padEnd(scale, '0'))
  return left === right ? 0 : left < right ? -1 : 1
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
