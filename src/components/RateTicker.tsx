import { useId, useState } from 'react'
import { Link } from 'react-router'
import { FOREIGN_CURRENCIES, type ForeignCurrency } from '../features/exchange/api'
import { RateChange } from '../features/exchange/rateDisplay'
import { formatDecimalText } from '../lib/money'
import { useSharedRates } from './RatesProvider'

/**
 * 헤더 환율 티커(네이비 위). `[기준]` 칩 → 매매기준율 숫자 + KRW(+ 전일 대비) → 통화 선택 순서로 둔다.
 * 서버가 제공하는 통화(JPY·CNY)만 고를 수 있고, 환율은 레이아웃이 한 번 조회한 값(처음 1회 + 5분마다)을 함께 쓴다.
 * 받은 값이 없으면 그리지 않는다.
 */
export function RateTicker() {
  const selectId = useId()
  const [currency, setCurrency] = useState<ForeignCurrency>('JPY')
  const rates = useSharedRates()
  const rate = rates?.find((item) => item.currency === currency)

  if (!rates) {
    return null
  }

  return (
    <div className="rate-ticker">
      <span className="rate-ticker-chip" aria-hidden="true">
        기준
      </span>
      {rate ? (
        <>
          <Link
            to="/exchange-rates"
            className="rate-ticker-value"
            aria-label={`${rate.unit.toLocaleString('ko-KR')} ${rate.currency} = ${formatDecimalText(rate.midRate)} ${rate.priceCurrency}`}
            title="매매기준율, 환율 화면으로 이동"
          >
            <strong>{formatDecimalText(rate.midRate)}</strong>
            <span className="rate-ticker-unit">{rate.priceCurrency}</span>
          </Link>
          <RateChange rate={rate} />
        </>
      ) : (
        <span className="rate-ticker-value">환율 정보 없음</span>
      )}
      <label htmlFor={selectId} className="visually-hidden">
        환율 통화
      </label>
      <select id={selectId} value={currency} onChange={(e) => setCurrency(e.target.value as ForeignCurrency)}>
        {FOREIGN_CURRENCIES.map((code) => {
          const unit = rates.find((item) => item.currency === code)?.unit
          return (
            <option key={code} value={code}>
              {unit ? `${unit.toLocaleString('ko-KR')} ${code}` : code}
            </option>
          )
        })}
      </select>
    </div>
  )
}
