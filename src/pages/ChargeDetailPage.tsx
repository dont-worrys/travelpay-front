import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { fetchCharge, type Charge } from '../features/wallet/api'
import { ChargeStatusBadge } from '../features/wallet/ChargeStatusBadge'
import { CHARGE_DESCRIPTION, bankName, isFinalCharge, toWalletMessage } from '../features/wallet/status'
import { formatDateTime } from '../lib/datetime'
import { formatAmount } from '../lib/money'

/** 충전은 Kafka SAGA로 비동기 처리된다. 끝날 때까지 다시 조회한다. */
const POLL_INTERVAL_MS = 2000
const POLL_LIMIT_MS = 2 * 60 * 1000

export function ChargeDetailPage() {
  const { chargeId = '' } = useParams()
  const location = useLocation()
  const justRequested = (location.state as { justRequested?: boolean } | null)?.justRequested === true

  const [charge, setCharge] = useState<Charge | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollStopped, setPollStopped] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const startedAt = Date.now()
    let timer: number | undefined

    async function load() {
      try {
        const data = await fetchCharge(chargeId, controller.signal)
        setCharge(data)
        setError(null)
        if (!isFinalCharge(data.status)) {
          if (Date.now() - startedAt < POLL_LIMIT_MS) {
            timer = window.setTimeout(load, POLL_INTERVAL_MS)
          } else {
            setPollStopped(true)
          }
        }
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return
        }
        setError(toWalletMessage(cause, '충전 내역을 불러오지 못했습니다.'))
      }
    }

    setCharge(null)
    setPollStopped(false)
    load()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [chargeId])

  if (error) {
    return (
      <section>
        <h1>충전 상세</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <Link to="/wallet/charges">충전 내역으로</Link>
      </section>
    )
  }
  if (!charge) {
    return <p>불러오는 중입니다…</p>
  }

  const description = charge.status === 'FAILED' ? charge.failureMessage : CHARGE_DESCRIPTION[charge.status]
  const processing = !isFinalCharge(charge.status)

  return (
    <section>
      <h1>충전 상세</h1>
      {justRequested && charge.status === 'COMPLETED' && <p className="notice">충전을 완료했습니다.</p>}

      <p className="amount-large">
        +{formatAmount(charge.amount, charge.currency)} <ChargeStatusBadge status={charge.status} />
      </p>
      {description && <p className={charge.status === 'FAILED' ? 'error' : 'hint'}>{description}</p>}
      {processing && !pollStopped && <p className="hint">결과를 자동으로 확인하는 중입니다…</p>}
      {pollStopped && (
        <p className="hint">
          처리가 늦어지고 있습니다. 서버가 자동으로 이어서 처리하니 다시 충전하지 말고 잠시 후 확인해 주세요.
        </p>
      )}

      <dl className="info">
        <dt>출금 계좌</dt>
        <dd>
          {bankName(charge.bankCode)} {charge.accountNumberMask}
        </dd>
        <dt>요청 시각</dt>
        <dd>{formatDateTime(charge.createdAt)}</dd>
        <dt>최근 변경</dt>
        <dd>{formatDateTime(charge.updatedAt)}</dd>
        <dt>충전 ID</dt>
        <dd>
          <code>{charge.chargeId}</code>
        </dd>
      </dl>

      <div className="actions">
        <Link to="/wallet">내 지갑</Link>
        <Link to="/wallet/charges">충전 내역</Link>
      </div>
    </section>
  )
}
