import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { isApiError } from '../api'
import { cancelRefundRequest, fetchPayment, requestRefund, type Payment } from '../features/payment/api'
import { PaymentStatusBadge, RefundStatusBadge } from '../features/payment/PaymentStatusBadge'
import {
  isProcessingPayment,
  PAYMENT_DESCRIPTION,
  REFUND_REQUEST_LABEL,
  toPaymentMessage,
} from '../features/payment/status'
import { formatDateTime } from '../lib/datetime'
import { formatAmount } from '../lib/money'

/** 처리 중인 결제를 다시 조회하는 간격과 최대 시간. 서버 복구 스케줄러가 자동으로 다시 처리한다. */
const POLL_INTERVAL_MS = 3000
const POLL_LIMIT_MS = 2 * 60 * 1000
const REASON_MAX = 255

/** 상태가 바뀌어 화면 정보가 낡았을 수 있는 오류. 받은 뒤 결제를 다시 조회한다. */
const STALE_CODES = new Set([
  'COMMON_CONFLICT',
  'PAYMENT_REFUND_IN_PROGRESS',
  'PAYMENT_ALREADY_REFUNDED',
  'PAYMENT_NOT_REFUNDABLE',
  'PAYMENT_REFUND_NOT_REQUESTED',
])

export function PaymentDetailPage() {
  const { paymentId = '' } = useParams()
  const location = useLocation()
  const justPaid = (location.state as { justPaid?: boolean } | null)?.justPaid === true

  const [payment, setPayment] = useState<Payment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollStopped, setPollStopped] = useState(false)
  /** 상태가 바뀐 뒤 다시 조회를 시작하기 위한 값. */
  const [reloadToken, setReloadToken] = useState(0)

  const [showRefundForm, setShowRefundForm] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const startedAt = Date.now()
    let timer: number | undefined

    async function load() {
      try {
        const data = await fetchPayment(paymentId, controller.signal)
        setPayment(data)
        setError(null)
        if (isProcessingPayment(data.status)) {
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
        setError(toPaymentMessage(cause, '결제 내역을 불러오지 못했습니다.'))
      }
    }

    setPollStopped(false)
    load()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [paymentId, reloadToken])

  useEffect(() => {
    setPayment(null)
  }, [paymentId])

  function handleActionError(cause: unknown, fallback: string) {
    setActionError(toPaymentMessage(cause, fallback))
    if (isApiError(cause) && STALE_CODES.has(cause.code)) {
      setShowRefundForm(false)
      setReloadToken((value) => value + 1)
    }
  }

  async function handleRequestRefund(event: FormEvent) {
    event.preventDefault()
    if (!payment) {
      return
    }
    const trimmed = reason.trim()
    if (!trimmed) {
      setReasonError('환불 사유를 입력해 주세요.')
      return
    }
    if (trimmed.length > REASON_MAX) {
      setReasonError(`환불 사유는 ${REASON_MAX}자 이하로 입력해 주세요.`)
      return
    }
    setReasonError(null)
    setActionBusy(true)
    setActionError(null)
    try {
      setPayment(await requestRefund(payment.paymentId, trimmed))
      setShowRefundForm(false)
      setReason('')
    } catch (cause) {
      if (isApiError(cause) && cause.code === 'COMMON_INVALID_REQUEST') {
        setReasonError(cause.fieldMessages().reason ?? null)
      }
      handleActionError(cause, '환불을 신청하지 못했습니다.')
    } finally {
      setActionBusy(false)
    }
  }

  async function handleCancelRefund() {
    if (!payment || !window.confirm('환불 신청을 취소할까요?')) {
      return
    }
    setActionBusy(true)
    setActionError(null)
    try {
      setPayment(await cancelRefundRequest(payment.paymentId))
    } catch (cause) {
      handleActionError(cause, '환불 신청을 취소하지 못했습니다.')
    } finally {
      setActionBusy(false)
    }
  }

  if (error) {
    return (
      <section>
        <h1>결제 상세</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <Link to="/payments">결제 내역으로</Link>
      </section>
    )
  }
  if (!payment) {
    return <p className="loading">불러오는 중입니다…</p>
  }

  const description = PAYMENT_DESCRIPTION[payment.status]
  const refundedAmount = payment.refunds
    .filter((refund) => refund.status === 'COMPLETED')
    .reduce((sum, refund) => sum + refund.amount, 0)
  const request = payment.refundRequest

  return (
    <section className="receipt">
      <h1>결제 상세</h1>
      {justPaid && payment.status === 'APPROVED' && <p className="notice">결제를 완료했습니다.</p>}

      <p className="amount-large">
        -{formatAmount(payment.amount, payment.currency)} <PaymentStatusBadge status={payment.status} />
      </p>
      {description && <p className="hint">{description}</p>}
      {payment.status === 'DECLINED' && payment.declineReason && (
        <p className="error">거절 사유: {payment.declineReason}</p>
      )}
      {isProcessingPayment(payment.status) && !pollStopped && (
        <p className="hint">결과를 자동으로 확인하는 중입니다…</p>
      )}
      {pollStopped && (
        <p className="hint">
          처리가 늦어지고 있습니다. 잠시 후 <Link to="/payments">결제 내역</Link>에서 확인해 주세요.
        </p>
      )}

      <dl className="info">
        <dt>가맹점</dt>
        <dd>{payment.merchantName}</dd>
        <dt>결제 내용</dt>
        <dd>{payment.paymentInfo ?? '-'}</dd>
        {refundedAmount > 0 && (
          <>
            <dt>환불받은 금액</dt>
            <dd className="amount">{formatAmount(refundedAmount, payment.currency)}</dd>
          </>
        )}
        <dt>결제 시각</dt>
        <dd>{formatDateTime(payment.createdAt)}</dd>
        <dt>결제 ID</dt>
        <dd>
          <code>{payment.paymentId}</code>
        </dd>
      </dl>

      {request && (
        <>
          <h2>최근 환불 신청</h2>
          <dl className="info">
            <dt>처리 결과</dt>
            <dd>{REFUND_REQUEST_LABEL[request.result]}</dd>
            <dt>신청 사유</dt>
            <dd>{request.requestReason}</dd>
            <dt>신청 시각</dt>
            <dd>{formatDateTime(request.requestedAt)}</dd>
            {request.processedAt && (
              <>
                <dt>처리 시각</dt>
                <dd>{formatDateTime(request.processedAt)}</dd>
              </>
            )}
            {request.rejectReason && (
              <>
                <dt>거절 사유</dt>
                <dd>{request.rejectReason}</dd>
              </>
            )}
          </dl>
        </>
      )}

      {payment.refunds.length > 0 && (
        <>
          <h2>환불 내역</h2>
          <ul className="item-list">
            {payment.refunds.map((refund) => (
              <li key={refund.refundId}>
                <div className="item">
                  <span className="item-main">
                    <span>{refund.reason ?? '환불'}</span>
                    <span className="amount received">+{formatAmount(refund.amount, refund.currency)}</span>
                  </span>
                  <span className="item-sub">
                    <span className="hint">
                      {formatDateTime(refund.createdAt)}
                      {refund.declineReason ? ` · 거절 사유: ${refund.declineReason}` : ''}
                    </span>
                    <RefundStatusBadge status={refund.status} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {showRefundForm && payment.status === 'APPROVED' && (
        <form className="form" onSubmit={handleRequestRefund} noValidate>
          <h2>환불 신청</h2>
          <p className="hint">
            결제 승인 후 3일 안에만 신청할 수 있습니다. 환불 금액은 가맹점이 확인한 뒤 정합니다.
          </p>
          <label>
            환불 사유
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={REASON_MAX}
              placeholder="예: 사이즈 변경"
              autoFocus
            />
            <span className="hint">
              {reason.trim().length}/{REASON_MAX}
            </span>
            {reasonError && <span className="field-error">{reasonError}</span>}
          </label>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setShowRefundForm(false)}
              disabled={actionBusy}
            >
              닫기
            </button>
            <button type="submit" disabled={actionBusy || !reason.trim()}>
              {actionBusy ? '신청 중…' : '환불 신청'}
            </button>
          </div>
        </form>
      )}

      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}
      <div className="actions">
        <Link to="/payments">결제 내역</Link>
        {payment.status === 'APPROVED' && !showRefundForm && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setShowRefundForm(true)
              setActionError(null)
            }}
          >
            환불 신청
          </button>
        )}
        {payment.status === 'REFUND_REQUESTED' && (
          <button type="button" className="secondary" onClick={handleCancelRefund} disabled={actionBusy}>
            {actionBusy ? '취소 중…' : '환불 신청 취소'}
          </button>
        )}
      </div>
    </section>
  )
}
