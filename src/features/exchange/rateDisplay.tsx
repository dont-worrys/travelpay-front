import { formatDecimalText } from '../../lib/money'
import type { ExchangeRate } from './api'

/**
 * 견적 전 화면에 보여 주는 수수료율. 서버 설정(`exchange.quote.fee-rate`)과 같은 값이다.
 * 견적 이후에는 응답의 `feeRate`를 쓴다. 서버가 견적 전에도 수수료율을 내려주면 그 값으로 바꾼다.
 */
export const PRE_QUOTE_FEE_RATE = '0.01'

/** 수수료율 소수 문자열을 퍼센트로 표시한다("0.01" → "1%"). 계산하지 않고 소수점만 두 칸 옮긴다. */
export function formatFeeRate(rate: string): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(rate.trim())
  if (!match) {
    return rate
  }
  const fraction = (match[2] ?? '').padEnd(2, '0')
  const whole = `${match[1]}${fraction.slice(0, 2)}`.replace(/^0+(?=\d)/, '')
  const rest = fraction.slice(2).replace(/0+$/, '')
  return `${whole}${rest ? `.${rest}` : ''}%`
}

export type RateDirection = 'up' | 'down' | 'flat'

/** 전일 대비 변동 문자열("2.1", "-1.31", "0")의 방향. 형식이 다르면 null. */
export function rateDirection(changeAmount: string): RateDirection | null {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(changeAmount.trim())
  if (!match) {
    return null
  }
  if (/^0+$/.test(match[2] ?? '') && /^0*$/.test(match[3] ?? '')) {
    return 'flat'
  }
  return match[1] === '-' ? 'down' : 'up'
}

const DIRECTION_TEXT: Record<RateDirection, { arrow: string; sign: string; label: string }> = {
  up: { arrow: '▲', sign: '+', label: '상승' },
  down: { arrow: '▼', sign: '-', label: '하락' },
  flat: { arrow: '', sign: '', label: '변동 없음' },
}

/** 매매기준율 전일 대비(예: "▲2.1 (+0.25%)"). 전일 환율이 없어 값이 null이면 아무것도 그리지 않는다. */
export function RateChange({ rate }: { rate: ExchangeRate }) {
  const { changeAmount, changeRate } = rate
  if (changeAmount == null || changeRate == null) {
    return null
  }
  const direction = rateDirection(changeAmount)
  if (!direction) {
    return null
  }
  const text = DIRECTION_TEXT[direction]
  const amount = formatDecimalText(changeAmount.trim().replace(/^[+-]/, ''))
  const percent = changeRate.trim().replace(/^[+-]/, '')
  const previous =
    rate.previousMidRate && rate.previousRateDate
      ? `전일(${rate.previousRateDate}) ${formatDecimalText(rate.previousMidRate)}원 대비 ${text.label}`
      : `전일 대비 ${text.label}`
  return (
    <span className={`rate-change ${direction}`} title={previous} data-direction={direction}>
      {text.arrow}
      {amount} ({text.sign}
      {percent}%)
    </span>
  )
}
