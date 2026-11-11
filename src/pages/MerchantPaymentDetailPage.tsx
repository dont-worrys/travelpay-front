import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { isApiError, isOutcomeUnknown } from '../api'
import {
  executeRefund,
  fetchMerchantPayment,
  rejectRefundRequest,
  type RefundExecuteInput,
} from '../features/merchant/api'
import { toMerchantMessage } from '../features/merchant/status'
import type { Payment } from '../features/payment/api'
import { PaymentStatusBadge, RefundStatusBadge } from '../features/payment/PaymentStatusBadge'
import { isProcessingPayment, REFUND_REQUEST_LABEL } from '../features/payment/status'
import { formatDateTime } from '../lib/datetime'
import { newIdempotencyKey } from '../lib/idempotency'
import { CURRENCY_INFO, formatAmount, parseAmount, toAmountInput } from '../lib/money'

const POLL_INTERVAL_MS = 3000
const POLL_LIMIT_MS = 2 * 60 * 1000
const REASON_MAX = 255

/** 상태가 바뀌어 화면 정보가 낡았을 수 있는 오류. 받은 뒤 결제를 다시 조회한다. */
const RELOAD_CODES = new Set([
  'COMMON_CONFLICT',
  'PAYMENT_REFUND_DECLINED',
  'PAYMENT_REFUND_IN_PROGRESS',
  'PAYMENT_ALREADY_REFUNDED',
  'PAYMENT_NOT_REFUNDABLE',
  'PAYMENT_REFUND_NOT_REQUESTED',
  'PAYMENT_ALREADY_SETTLED',
  'PAYMENT_REFUND_AMOUNT_EXCEEDED',
])

type Mode = 'none' | 'refund' | 'reject'

interface PendingRequest {
  fingerprint: string
  key: string
}

/** 남은 금액 = 결제 금액 − (완료 + 처리 중 + 확인 중 환불). 서버 계산과 같은 기준. */
function remainingAmount(payment: Payment): number {
  const used = payment.refunds
    .filter((refund) => refund.status !== 'DECLINED')
    .reduce((sum, refund) => sum + refund.amount, 0)
  return Math.max(0, payment.amount - used)
}

/** 가맹점 주인용 결제 상세: 고객 환불 신청을 실행(부분·전액)하거나 거절한다. */
export function MerchantPaymentDetailPage() {
  const { merchantId = '', paymentId = '' } = useParams()

  const [payment, setPayment] = useState<Payment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollStopped, setPollStopped] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  const [mode, setMode] = useState<Mode>('none')
  const [amountInput, setAmountInput] = useState('')
  const [reason, setReason] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** 환불 실행 응답을 받지 못한 상태. 같은 내용으로 다시 보내면 한 번만 처리된다. */
  const [uncertain, setUncertain] = useState(false)
  const pending = useRef<PendingRequest | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const startedAt = Date.now()
    let timer: number | undefined

    async function load() {
      try {
        const data = await fetchMerchantPayment(merchantId, paymentId, controller.signal)
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
        setError(toMerchantMessage(cause, '결제를 불러오지 못했습니다.'))
      }
    }

    setPollStopped(false)
    load()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [merchantId, paymentId, reloadToken])

  useEffect(() => {
    setPayment(null)
  }, [merchantId, paymentId])

  function openMode(next: Mode) {
    if (!payment) {
      return
    }
    setMode(next)
    setReason(payment.refundRequest?.result === 'REQUESTED' && next === 'refund' ? payment.refundRequest.requestReason : '')
    setAmountInput(next === 'refund' ? toAmountInput(remainingAmount(payment), payment.currency) : '')
    setFieldErrors({})
    setActionError(null)
    setNotice(null)
    setUncertain(false)
    pending.current = null
  }

  function afterActionError(cause: unknown, fallback: string) {
    setActionError(toMerchantMessage(cause, fallback))
    if (isApiError(cause) && RELOAD_CODES.has(cause.code)) {
      if (cause.code !== 'PAYMENT_REFUND_AMOUNT_EXCEEDED') {
        setMode('none')
      }
      setReloadToken((value) => value + 1)
    }
  }

  function validateReason(errors: Record<string, string>): string {
    const trimmed = reason.trim()
    if (!trimmed) {
      errors.reason = '사유를 입력해 주세요.'
    } else if (trimmed.length > REASON_MAX) {
      errors.reason = `사유는 ${REASON_MAX}자 이하로 입력해 주세요.`
    }
    return trimmed
  }

  async function handleRefund(event: FormEvent) {
    event.preventDefault()
    if (!payment) {
      return
    }
    const errors: Record<string, string> = {}
    const parsed = parseAmount(amountInput, payment.currency)
    const remaining = remainingAmount(payment)
    if (!parsed.ok) {
      errors.amount = parsed.message
    } else if (parsed.minor > remaining) {
      errors.amount = `남은 금액(${formatAmount(remaining, payment.currency)})보다 클 수 없습니다.`
    }
    const trimmed = validateReason(errors)
    setFieldErrors(errors)
    if (!parsed.ok || Object.keys(errors).length > 0) {
      return
    }
    if (!window.confirm(`${formatAmount(parsed.minor, payment.currency)}을 환불할까요? 실행하면 되돌릴 수 없습니다.`)) {
      return
    }

    const input: RefundExecuteInput = { amount: parsed.minor, reason: trimmed }
    // 서버는 paymentId·amount로 같은 요청인지 본다. 사유만 고쳐 다시 보내도 같은 키를 써야 두 번 환불되지 않는다.
    const fingerprint = JSON.stringify([payment.paymentId, input.amount])
    if (pending.current?.fingerprint !== fingerprint) {
      pending.current = { fingerprint, key: newIdempotencyKey() }
    }

    setBusy(true)
    setActionError(null)
    try {
      const data = await executeRefund(payment.paymentId, input, pending.current.key)
      pending.current = null
      setUncertain(false)
      setPayment(data)
      setMode('none')
      setNotice('환불을 실행했습니다.')
      if (isProcessingPayment(data.status)) {
        setReloadToken((value) => value + 1)
      }
    } catch (cause) {
      if (isOutcomeUnknown(cause)) {
        setUncertain(true)
        setActionError(toMerchantMessage(cause, '환불 결과를 확인하지 못했습니다.'))
        return
      }
      pending.current = null
      setUncertain(false)
      if (isApiError(cause) && cause.code === 'COMMON_INVALID_REQUEST' && cause.details.length > 0) {
        setFieldErrors(cause.fieldMessages())
      }
      afterActionError(cause, '환불하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function handleReject(event: FormEvent) {
    event.preventDefault()
    if (!payment) {
      return
    }
    const errors: Record<string, string> = {}
    const trimmed = validateReason(errors)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      setPayment(await rejectRefundRequest(payment.paymentId, trimmed))
      setMode('none')
      setNotice('환불 신청을 거절했습니다.')
    } catch (cause) {
      if (isApiError(cause) && cause.code === 'COMMON_INVALID_REQUEST' && cause.details.length > 0) {
        setFieldErrors(cause.fieldMessages())
      }
      afterActionError(cause, '거절하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const backLink = `/merchant/${merchantId}`

  if (error) {
    return (
      <section>
        <h1>결제 상세</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <Link to={backLink}>가맹점 관리로</Link>
      </section>
    )
  }
  if (!payment) {
    return <p>불러오는 중입니다…</p>
  }

  const request = payment.refundRequest
  const remaining = remainingAmount(payment)
  const canAct = payment.status === 'REFUND_REQUESTED'

  return (
    <section>
      <h1>결제 상세</h1>
      {notice && <p className="notice">{notice}</p>}

      <p className="amount-large">
        +{formatAmount(payment.amount, payment.currency)} <PaymentStatusBadge status={payment.status} />
      </p>
      {canAct && <p className="hint">고객이 환불을 신청했습니다. 환불 금액을 정해 실행하거나 신청을 거절해 주세요.</p>}
      {payment.status === 'REFUND_PENDING' && <p className="hint">환불을 처리하고 있습니다.</p>}
      {isProcessingPayment(payment.status) && !pollStopped && (
        <p className="hint">결과를 자동으로 확인하는 중입니다…</p>
      )}
      {pollStopped && <p className="hint">처리가 늦어지고 있습니다. 잠시 후 다시 확인해 주세요.</p>}

      <dl className="info">
        <dt>결제 내용</dt>
        <dd>{payment.paymentInfo ?? '-'}</dd>
        <dt>환불 가능 남은 금액</dt>
        <dd className="amount">{formatAmount(remaining, payment.currency)}</dd>
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
            <dt>고객 사유</dt>
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
                    <span className="amount sent">-{formatAmount(refund.amount, refund.currency)}</span>
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

      {canAct && mode === 'refund' && (
        <form className="form" onSubmit={handleRefund} noValidate>
          <h2>환불 실행</h2>
          <p className="hint">
            일부만 환불하면 결제는 결제 완료 상태로 돌아가고, 남은 금액은 고객이 다시 신청해야 환불할 수 있습니다.
          </p>
          <label>
            환불 금액
            <div className="input-row">
              <input
                inputMode={CURRENCY_INFO[payment.currency].decimals > 0 ? 'decimal' : 'numeric'}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                autoComplete="off"
              />
              <span>{CURRENCY_INFO[payment.currency].unit}</span>
            </div>
            <span className="hint">최대 {formatAmount(remaining, payment.currency)}</span>
            {fieldErrors.amount && <span className="field-error">{fieldErrors.amount}</span>}
          </label>
          <label>
            환불 사유
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON_MAX} />
            {fieldErrors.reason && <span className="field-error">{fieldErrors.reason}</span>}
          </label>
          {uncertain && (
            <p className="hint">
              환불이 이미 처리되었을 수 있습니다. 같은 금액으로 <strong>다시 시도</strong>하면 두 번 환불되지 않습니다.
              금액을 바꾸기 전에 화면을 새로고침해 결과를 먼저 확인해 주세요.
            </p>
          )}
          <div className="actions">
            <button type="button" className="secondary" onClick={() => setMode('none')} disabled={busy}>
              닫기
            </button>
            <button type="submit" disabled={busy}>
              {busy ? '환불 중…' : uncertain ? '다시 시도' : '환불 실행'}
            </button>
          </div>
        </form>
      )}

      {canAct && mode === 'reject' && (
        <form className="form" onSubmit={handleReject} noValidate>
          <h2>환불 신청 거절</h2>
          <p className="hint">거절 사유는 고객에게 보입니다.</p>
          <label>
            거절 사유
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={REASON_MAX}
              placeholder="예: 이미 사용한 상품"
              autoFocus
            />
            {fieldErrors.reason && <span className="field-error">{fieldErrors.reason}</span>}
          </label>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => setMode('none')} disabled={busy}>
              닫기
            </button>
            <button type="submit" disabled={busy || !reason.trim()}>
              {busy ? '거절 중…' : '신청 거절'}
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
        <Link to={backLink}>가맹점 관리</Link>
        {canAct && mode === 'none' && (
          <>
            <button type="button" className="primary" onClick={() => openMode('refund')}>
              환불 실행
            </button>
            <button type="button" className="secondary" onClick={() => openMode('reject')}>
              신청 거절
            </button>
          </>
        )}
      </div>
    </section>
  )
}
