import { Link } from 'react-router'
import { CurrencyMark } from '../components/CurrencyMark'
import { useAuth } from '../features/auth/useAuth'
import { fetchExchangeRates } from '../features/exchange/api'
import { formatFeeRate, PRE_QUOTE_FEE_RATE, RateChange } from '../features/exchange/rateDisplay'
import { toExchangeMessage } from '../features/exchange/status'
import { formatDateTime } from '../lib/datetime'
import { CURRENCY_INFO, formatDecimalText } from '../lib/money'
import { useAutoRefresh } from '../lib/useAutoRefresh'

function loadRates(signal: AbortSignal) {
  return fetchExchangeRates(undefined, signal)
}

/** 공개 환율 조회. 로그인하지 않아도 볼 수 있다. 5초마다 다시 조회한다. */
export function ExchangeRatePage() {
  const { state } = useAuth()
  const { data: rates, error, reload } = useAutoRefresh(loadRates)

  return (
    <section>
      <div className="title-row">
        <h1>환율</h1>
        <div className="actions inline">
          {state.status === 'authenticated' ? (
            <Link to="/exchange" className="button-link">
              환전하기
            </Link>
          ) : (
            <Link to="/login">로그인하고 환전하기</Link>
          )}
        </div>
      </div>
      <p className="hint">
        원화 기준 가격입니다. 환전·재환전은 매매기준율에 수수료 {formatFeeRate(PRE_QUOTE_FEE_RATE)}가 붙습니다. 살 때·팔
        때 환율은 은행 고시 참고값입니다.
      </p>

      {error != null && !rates && (
        <p className="error" role="alert">
          {toExchangeMessage(error, '환율을 불러오지 못했습니다.')}{' '}
          <button type="button" className="link-button" onClick={reload}>
            다시 불러오기
          </button>
        </p>
      )}
      {error != null && rates && <p className="hint">최신 환율을 불러오지 못해 마지막으로 받은 환율을 보여 줍니다.</p>}
      {!rates && error == null && <p className="loading">불러오는 중입니다…</p>}
      {rates && rates.length === 0 && <p className="hint empty">제공 중인 환율이 없습니다.</p>}

      {rates && rates.length > 0 && (
        <ul className="item-list">
          {rates.map((rate) => {
            const unitLabel = `${rate.unit.toLocaleString('ko-KR')}${CURRENCY_INFO[rate.currency].unit}`
            return (
              <li key={rate.currency}>
                <div className="item">
                  <span className="item-main">
                    <strong className="rate-title">
                      <CurrencyMark currency={rate.currency} small />
                      {CURRENCY_INFO[rate.currency].label} · {unitLabel}당
                    </strong>
                    <span className="amount">
                      {formatDecimalText(rate.midRate)}원
                      <RateChange rate={rate} />
                    </span>
                  </span>
                  <span className="item-sub">
                    <span className="hint">
                      살 때 {formatDecimalText(rate.buyRate)}원 · 팔 때 {formatDecimalText(rate.sellRate)}원
                    </span>
                  </span>
                  <span className="item-sub">
                    <span className="hint">
                      기준일 {rate.rateDate} · 수집 {formatDateTime(rate.collectedAt)}
                    </span>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
