import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { isApiError, isOutcomeUnknown } from '../../api'
import { formatDateTime } from '../../lib/datetime'
import { newIdempotencyKey } from '../../lib/idempotency'
import { CURRENCY_INFO, formatAmount, parseAmount, toAmountInput } from '../../lib/money'
import type { Payment } from '../payment/api'
import { RefundStatusBadge } from '../payment/PaymentStatusBadge'
import { REFUND_REQUEST_LABEL } from '../payment/status'
import { executeRefund, rejectRefundRequest, type RefundExecuteInput } from './api'
import { toMerchantMessage } from './status'

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
export function remainingAmount(payment: Payment): number {
  const used = payment.refunds
    .filter((refund) => refund.status !== 'DECLINED')
    .reduce((sum, refund) => sum + refund.amount, 0)
  return Math.max(0, payment.amount - used)
}

/** 최근 고객 환불 신청과 환불 내역. */
export function RefundHistory({ payment }: { payment: Payment }) {
  const request = payment.refundRequest
  return (
    <>
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
    </>
  )
}

interface RefundActionsProps {
  payment: Payment
  /** 환불 실행·거절이 끝나 서버가 돌려준 결제. */
  onPaymentChange: (payment: Payment) => void
  /** 화면 위쪽 완료 안내. 새 작업을 열면 null로 지운다. */
  onNotice: (message: string | null) => void
  /** 결제를 다시 조회한다(상태가 바뀌었을 수 있는 오류 뒤). */
  onReload: () => void
  /** 버튼 줄 맨 앞에 둘 링크(목록으로 등). */
  leading?: ReactNode
  /**
   * 고객 신청이 없는 결제 완료(`APPROVED`) 결제도 바로 환불한다. `MASTER`만 서버가 허용하는 운영 예외 통로다
   * (가맹점 주인이 보내면 422 `PAYMENT_REFUND_NOT_REQUESTED`).
   */
  allowDirectRefund?: boolean
}

/**
 * 고객이 신청한(`REFUND_REQUESTED`) 결제의 환불 실행(부분·전액)·신청 거절. 가맹점 주인·`MASTER` 화면 공통.
 * `allowDirectRefund`면 신청 없는 `APPROVED` 결제도 환불할 수 있다(거절은 신청이 있을 때만).
 * 환불 실행은 `Idempotency-Key`를 붙이고, 결과를 모르면 같은 금액이면 같은 키로 다시 보낸다.
 */
export function RefundActions({
  payment,
  onPaymentChange,
  onNotice,
  onReload,
  leading,
  allowDirectRefund = false,
}: RefundActionsProps) {
  const [mode, setMode] = useState<Mode>('none')
  const [amountInput, setAmountInput] = useState('')
  const [reason, setReason] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  /** 환불 실행 응답을 받지 못한 상태. 같은 내용으로 다시 보내면 한 번만 처리된다. */
  const [uncertain, setUncertain] = useState(false)
  /** 서버가 정산에 들어간 결제라고 거절한 상태. 응답에 정산 여부가 없어 이 오류로만 안다. */
  const [settled, setSettled] = useState(false)
  const pending = useRef<PendingRequest | null>(null)

  const remaining = remainingAmount(payment)
  const canReject = payment.status === 'REFUND_REQUESTED'
  /** 신청 없이 바로 하는 환불(관리자 운영 예외). */
  const direct = allowDirectRefund && payment.status === 'APPROVED' && remaining > 0
  const canRefund = canReject || direct

  function openMode(next: Mode) {
    setMode(next)
    setReason(payment.refundRequest?.result === 'REQUESTED' && next === 'refund' ? payment.refundRequest.requestReason : '')
    setAmountInput(next === 'refund' ? toAmountInput(remainingAmount(payment), payment.currency) : '')
    setFieldErrors({})
    setActionError(null)
    onNotice(null)
    setUncertain(false)
    pending.current = null
  }

  function afterActionError(cause: unknown, fallback: string) {
    setActionError(toMerchantMessage(cause, fallback))
    if (isApiError(cause) && cause.code === 'PAYMENT_ALREADY_SETTLED') {
      setSettled(true)
    }
    if (isApiError(cause) && RELOAD_CODES.has(cause.code)) {
      if (cause.code !== 'PAYMENT_REFUND_AMOUNT_EXCEEDED') {
        setMode('none')
      }
      onReload()
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
    const errors: Record<string, string> = {}
    const parsed = parseAmount(amountInput, payment.currency)
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
      setMode('none')
      onPaymentChange(data)
      onNotice('환불을 실행했습니다.')
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
    const errors: Record<string, string> = {}
    const trimmed = validateReason(errors)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      const data = await rejectRefundRequest(payment.paymentId, trimmed)
      setMode('none')
      onPaymentChange(data)
      onNotice('환불 신청을 거절했습니다.')
    } catch (cause) {
      if (isApiError(cause) && cause.code === 'COMMON_INVALID_REQUEST' && cause.details.length > 0) {
        setFieldErrors(cause.fieldMessages())
      }
      afterActionError(cause, '거절하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {canRefund && mode === 'refund' && (
        <form className="form" onSubmit={handleRefund} noValidate>
          <h2>환불 실행</h2>
          {direct ? (
            <p className="hint">
              고객 신청 없이 관리자가 직접 환불합니다. 환불 기간 제한은 없지만 정산에 들어간 결제는 환불할 수 없습니다.
            </p>
          ) : (
            <p className="hint">
              일부만 환불하면 결제는 결제 완료 상태로 돌아가고, 남은 금액은 고객이 다시 신청해야 환불할 수 있습니다.
            </p>
          )}
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

      {canReject && mode === 'reject' && (
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
      {canRefund && settled && mode === 'none' && (
        <p className="hint">
          정산에 들어간 결제는 환불할 수 없습니다.{canReject && ' 신청 거절만 할 수 있습니다.'}
        </p>
      )}
      <div className="actions">
        {leading}
        {canRefund && mode === 'none' && !settled && (
          <button type="button" className="primary" onClick={() => openMode('refund')}>
            {direct ? '직접 환불' : '환불 실행'}
          </button>
        )}
        {canReject && mode === 'none' && (
          <button type="button" className="secondary" onClick={() => openMode('reject')}>
            신청 거절
          </button>
        )}
      </div>
    </>
  )
}
