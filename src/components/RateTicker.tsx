import { useId, useState } from 'react'
import { Link } from 'react-router'
import { FOREIGN_CURRENCIES, type ForeignCurrency } from '../features/exchange/api'
import { formatDecimalText } from '../lib/money'
import { useSharedRates } from './RatesProvider'

/**
 * 상단 바 환율 티커. 서버가 제공하는 통화(JPY·CNY)만 고를 수 있고, 매매기준율을 보여 준다.
 * 환율은 레이아웃이 한 번 조회한 값(처음 1회 + 5분마다)을 함께 쓴다. 받은 값이 없으면 그리지 않는다.
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
      <label htmlFor={selectId} className="visually-hidden">
        환율 통화
      </label>
      <select id={selectId} value={currency} onChange={(e) => setCurrency(e.target.value as ForeignCurrency)}>
        {FOREIGN_CURRENCIES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
      {rate ? (
        <Link to="/exchange-rates" className="rate-ticker-value" title="매매기준율, 환율 화면으로 이동">
          {rate.unit.toLocaleString('ko-KR')} {rate.currency} = {formatDecimalText(rate.midRate)} {rate.priceCurrency}
        </Link>
      ) : (
        <span className="rate-ticker-value">환율 정보 없음</span>
      )}
    </div>
  )
}
