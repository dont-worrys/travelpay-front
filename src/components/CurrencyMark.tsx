import type { Currency } from '../lib/money'

/** 통화 코드 원형 배지. 색은 CSS(`.currency-mark.krw` 등)에 있고, 상태 색과 겹치지 않는다. 글자와 함께 쓰므로 읽기 프로그램에서는 숨긴다. */
export function CurrencyMark({ currency, small }: { currency: Currency; small?: boolean }) {
  return (
    <span className={`currency-mark ${currency.toLowerCase()}${small ? ' small' : ''}`} aria-hidden="true">
      {currency}
    </span>
  )
}

/** 통화별 이름과 쓰임(홈·지갑 보유 통화 목록). */
export const CURRENCY_TEXT: Record<Currency, { name: string; use: string }> = {
  KRW: { name: '대한민국 원', use: '충전·송금·결제' },
  JPY: { name: '일본 엔', use: '환전으로 보유' },
  CNY: { name: '중국 위안', use: '환전으로 보유' },
}
