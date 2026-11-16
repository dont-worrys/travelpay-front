import { useId } from 'react'
import { Link } from 'react-router'
import { CURRENCY_TEXT, CurrencyMark } from '../../components/CurrencyMark'
import { Icon } from '../../components/Icon'
import { CURRENCY_INFO, formatDecimalText } from '../../lib/money'
import type { ExchangeRate } from './api'
import { formatFeeRate, PRE_QUOTE_FEE_RATE, RateChange } from './rateDisplay'

/** 비로그인이 환전하기를 누르면 로그인 화면으로 보내고, 로그인하면 해당 통화 환전 화면으로 이어진다. */
function loginThenExchange(currency: string): string {
  return `/login?redirect=${encodeURIComponent(`/exchange?currency=${currency}`)}`
}

/**
 * 홈 환율표(xe의 환율 표를 참고). 머리 줄 → 통화별 한 줄(통화 · 환율 · 전일 대비 · 환전하기) → 수수료 안내.
 * 그래프는 서버가 과거 시세를 주지 않아 두지 않는다. 값은 서버 응답 문자열 그대로 쓰고 계산하지 않는다.
 * 폭이 넓으면 한 줄, 좁으면(모바일·히어로 옆 카드) 두 줄로 접히며, 기준은 화면이 아니라 이 표의 폭이다(CSS 컨테이너 쿼리).
 */
export function RateTable({
  rates,
  anonymous = false,
  className,
}: {
  rates: ExchangeRate[]
  anonymous?: boolean
  className?: string
}) {
  const titleId = useId()
  return (
    <section className={className ? `rate-table card raised ${className}` : 'rate-table card raised'} aria-labelledby={titleId}>
      <div className="rate-table-head">
        <div>
          <h2 id={titleId}>오늘의 환율</h2>
          <p className="card-sub">기준일 {rates[0]?.rateDate}</p>
        </div>
        <Link to="/exchange-rates" className="link-more">
          환율 전체
        </Link>
      </div>

      <div className="rate-table-columns" aria-hidden="true">
        <span>통화</span>
        <span>원화 기준 환율</span>
        <span>전일 대비</span>
      </div>

      <ul className="rate-table-list">
        {rates.map((rate) => {
          const unit = `${rate.unit.toLocaleString('ko-KR')}${CURRENCY_INFO[rate.currency].unit}`
          const value = formatDecimalText(rate.midRate)
          return (
            <li key={rate.currency} className="rate-table-row">
              <span className="rate-table-name">
                <CurrencyMark currency={rate.currency} small />
                <span>
                  <strong>{rate.currency}</strong>
                  <span>
                    {CURRENCY_TEXT[rate.currency].name} · {unit}당
                  </span>
                </span>
              </span>
              <span className="rate-table-rate">
                <span className="visually-hidden">
                  {unit}당 {value}원
                </span>
                <span aria-hidden="true">
                  <strong>{value}</strong>
                  <span>원</span>
                </span>
              </span>
              <span className="rate-table-change">
                <RateChange rate={rate} />
              </span>
              <Link
                to={anonymous ? loginThenExchange(rate.currency) : `/exchange?currency=${rate.currency}`}
                className="button-link rate-table-cta"
                aria-label={`${rate.currency} 환전하기`}
              >
                환전하기
                <Icon name="arrowRight" />
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="rate-meta">환전 수수료는 {formatFeeRate(PRE_QUOTE_FEE_RATE)}입니다.</p>
    </section>
  )
}
