import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { isApiError, toUserMessage } from '../api'
import { cancelTransfer, fetchTransfer, type Transfer } from '../features/transfer/api'
import { amountDisplay, statusDescription, toTransferMessage } from '../features/transfer/status'
import { TransferStatusBadge } from '../features/transfer/TransferStatusBadge'
import { formatDateTime } from '../lib/datetime'
import { formatAmount } from '../lib/money'

/** PROCESSING 송금을 다시 조회하는 간격과 최대 시간. 서버 복구는 30초·1분·2분…으로 재시도한다. */
const POLL_INTERVAL_MS = 3000
const POLL_LIMIT_MS = 2 * 60 * 1000

export function TransferDetailPage() {
  const { transferId = '' } = useParams()
  const location = useLocation()
  const justSent = (location.state as { justSent?: boolean } | null)?.justSent === true

  const [transfer, setTransfer] = useState<Transfer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollStopped, setPollStopped] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const startedAt = Date.now()
    let timer: number | undefined

    async function load() {
      try {
        const data = await fetchTransfer(transferId, controller.signal)
        setTransfer(data)
        setError(null)
        if (data.status === 'PROCESSING') {
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
        setError(toTransferMessage(cause, '송금 내역을 불러오지 못했습니다.'))
      }
    }

    setTransfer(null)
    setPollStopped(false)
    load()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [transferId])

  async function handleCancel() {
    if (!transfer || !window.confirm('이 송금을 취소할까요?')) {
      return
    }
    setCancelling(true)
    setCancelError(null)
    try {
      setTransfer(await cancelTransfer(transfer.transferId))
    } catch (cause) {
      if (isApiError(cause) && cause.code === 'COMMON_CONFLICT') {
        setCancelError('이미 처리 중이거나 끝난 송금이라 취소할 수 없습니다.')
        fetchTransfer(transfer.transferId).then(setTransfer, () => undefined)
      } else {
        setCancelError(toUserMessage(cause, '취소하지 못했습니다.'))
      }
    } finally {
      setCancelling(false)
    }
  }

  if (error) {
    return (
      <section>
        <h1>송금 상세</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <Link to="/transfers">송금 내역으로</Link>
      </section>
    )
  }
  if (!transfer) {
    return <p>불러오는 중입니다…</p>
  }

  const sent = transfer.direction === 'SENT'
  const description = statusDescription(transfer.direction, transfer.status)
  const amount = amountDisplay(transfer.direction, transfer.status)

  return (
    <section>
      <h1>송금 상세</h1>
      {justSent && transfer.status === 'COMPLETED' && <p className="notice">송금을 완료했습니다.</p>}

      <p className="amount-large">
        {amount.sign}
        {formatAmount(transfer.amount, transfer.currency)} <TransferStatusBadge status={transfer.status} />
      </p>
      {description && <p className="hint">{description}</p>}
      {transfer.status === 'PROCESSING' && !pollStopped && <p className="hint">결과를 자동으로 확인하는 중입니다…</p>}
      {pollStopped && (
        <p className="hint">
          처리가 늦어지고 있습니다. 잠시 후 <Link to="/transfers">송금 내역</Link>에서 확인해 주세요.
        </p>
      )}

      <dl className="info">
        <dt>구분</dt>
        <dd>{sent ? '보낸 송금' : '받은 송금'}</dd>
        <dt>{sent ? '받는 분' : '보낸 분'}</dt>
        <dd>
          <code>{sent ? transfer.receiverId : transfer.senderId}</code>
        </dd>
        <dt>메모</dt>
        <dd>{transfer.memo ?? '-'}</dd>
        <dt>요청 시각</dt>
        <dd>{formatDateTime(transfer.createdAt)}</dd>
        <dt>송금 ID</dt>
        <dd>
          <code>{transfer.transferId}</code>
        </dd>
      </dl>

      {cancelError && (
        <p className="error" role="alert">
          {cancelError}
        </p>
      )}
      <div className="actions">
        <Link to="/transfers">송금 내역</Link>
        {sent && transfer.status === 'REQUESTED' && (
          <button type="button" className="secondary" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? '취소 중…' : '송금 취소'}
          </button>
        )}
        {sent && transfer.status === 'COMPLETED' && (
          <Link to={`/transfers/new?receiverId=${transfer.receiverId}`}>같은 분에게 또 보내기</Link>
        )}
      </div>
    </section>
  )
}
