import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../features/auth/useAuth'
import { fetchExchangeRates, type ExchangeRate } from '../features/exchange/api'
import { toExchangeMessage } from '../features/exchange/status'
import { formatDateTime } from '../lib/datetime'
import { CURRENCY_INFO, formatDecimalText } from '../lib/money'

/** 공개 환율 조회. 로그인하지 않아도 볼 수 있다. */
export function ExchangeRatePage() {
  const { state } = useAuth()
  const [rates, setRates] = useState<ExchangeRate[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((signal?: AbortSignal) => {
    setError(null)
    fetchExchangeRates(undefined, signal)
      .then(setRates)
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(toExchangeMessage(cause, '환율을 불러오지 못했습니다.'))
        }
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

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
      <p className="hint">원화 기준 가격입니다. 환전할 때는 살 때 환율, 재환전할 때는 팔 때 환율이 적용됩니다.</p>

      {error && (
        <p className="error" role="alert">
          {error}{' '}
          <button type="button" className="link-button" onClick={() => load()}>
            다시 불러오기
          </button>
        </p>
      )}
      {!rates && !error && <p>불러오는 중입니다…</p>}
      {rates && rates.length === 0 && <p className="hint">제공 중인 환율이 없습니다.</p>}

      {rates && rates.length > 0 && (
        <ul className="item-list">
          {rates.map((rate) => {
            const unitLabel = `${rate.unit.toLocaleString('ko-KR')}${CURRENCY_INFO[rate.currency].unit}`
            return (
              <li key={rate.currency}>
                <div className="item">
                  <span className="item-main">
                    <strong>
                      {CURRENCY_INFO[rate.currency].label} · {unitLabel}당
                    </strong>
                    <span className="amount">{formatDecimalText(rate.midRate)}원</span>
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
