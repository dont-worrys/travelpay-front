import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { isApiError, type PageResponse } from '../../api'
import { isAbortError, isUuid, pageParam } from '../../features/admin/input'
import { fetchMerchantPayments, type MerchantPaymentSummary } from '../../features/merchant/api'
import { toMerchantMessage } from '../../features/merchant/status'
import type { PaymentStatus } from '../../features/payment/api'
import { PaymentStatusBadge } from '../../features/payment/PaymentStatusBadge'
import { formatDateTime } from '../../lib/datetime'
import { formatAmount } from '../../lib/money'

const PAGE_SIZE = 20
const TABS: { label: string; status?: PaymentStatus }[] = [
  { label: '전체' },
  { label: '환불 신청', status: 'REFUND_REQUESTED' },
  { label: '결제 완료', status: 'APPROVED' },
  { label: '환불 완료', status: 'REFUNDED' },
]
const TAB_STATUSES = new Set<string>(TABS.flatMap((tab) => (tab.status ? [tab.status] : [])))

function toListMessage(cause: unknown): string {
  if (isApiError(cause) && cause.code === 'PAYMENT_MERCHANT_NOT_FOUND') {
    return '가맹점을 찾을 수 없습니다. 가맹점 ID를 확인해 주세요.'
  }
  return toMerchantMessage(cause, '결제를 불러오지 못했습니다.')
}

/**
 * 관리자 가맹점 결제 조회. 관리자용 결제 검색 API가 없어 가맹점 ID로 그 가맹점의 결제 목록을 본다
 * (`GET /payments/merchants/{merchantId}/payments`, 주인·`MASTER`). 결제 ID까지 알면 상세로 바로 간다.
 * 상세에서 환불 신청 처리와 신청 없는 결제의 직접 환불을 한다.
 */
export function AdminMerchantPaymentListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const merchantParam = searchParams.get('merchantId') ?? ''
  const merchantId = isUuid(merchantParam) ? merchantParam : ''
  const statusParam = searchParams.get('status') ?? ''
  const status = TAB_STATUSES.has(statusParam) ? (statusParam as PaymentStatus) : undefined
  const page = pageParam(searchParams.get('page'))

  const [merchantInput, setMerchantInput] = useState(merchantId)
  const [paymentInput, setPaymentInput] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [result, setResult] = useState<PageResponse<MerchantPaymentSummary> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!merchantId) {
      setResult(null)
      setError(null)
      return
    }
    const controller = new AbortController()
    setResult(null)
    setError(null)
    fetchMerchantPayments(merchantId, { status, page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!isAbortError(cause)) {
          setError(toListMessage(cause))
        }
      })
    return () => controller.abort()
  }, [merchantId, status, page])

  function go(next: { status?: PaymentStatus; page?: number }) {
    const params = new URLSearchParams({ merchantId })
    if (next.status) {
      params.set('status', next.status)
    }
    if (next.page) {
      params.set('page', String(next.page))
    }
    setSearchParams(params)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const merchant = merchantInput.trim()
    const payment = paymentInput.trim()
    const errors: Record<string, string> = {}
    if (!isUuid(merchant)) {
      errors.merchantId = '가맹점 ID(UUID)를 입력해 주세요.'
    }
    if (payment && !isUuid(payment)) {
      errors.paymentId = '결제 ID는 UUID 형식이어야 합니다.'
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }
    if (payment) {
      navigate(`/admin/merchants/${merchant}/payments/${payment}`)
      return
    }
    setSearchParams({ merchantId: merchant })
  }

  return (
    <section>
      <h1>가맹점 결제</h1>
      <p className="hint">
        가맹점 ID로 결제를 찾습니다. 결제 상세에서 환불 신청을 처리하거나, 신청이 없는 결제를 직접 환불할 수
        있습니다.
      </p>

      <form className="form" onSubmit={handleSubmit} noValidate>
        <label>
          가맹점 ID
          <input value={merchantInput} onChange={(e) => setMerchantInput(e.target.value)} autoComplete="off" />
          {fieldErrors.merchantId && <span className="field-error">{fieldErrors.merchantId}</span>}
        </label>
        <label>
          결제 ID (선택)
          <input value={paymentInput} onChange={(e) => setPaymentInput(e.target.value)} autoComplete="off" />
          <span className="hint">입력하면 결제 상세로 바로 갑니다.</span>
          {fieldErrors.paymentId && <span className="field-error">{fieldErrors.paymentId}</span>}
        </label>
        <button type="submit">조회</button>
      </form>

      {merchantId && (
        <>
          <div className="tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.label}
                type="button"
                role="tab"
                aria-selected={tab.status === status}
                className={tab.status === status ? 'tab active' : 'tab'}
                onClick={() => go({ status: tab.status })}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {!result && !error && <p>불러오는 중입니다…</p>}
          {result && result.items.length === 0 && <p className="hint">결제가 없습니다.</p>}
          {result && result.items.length > 0 && (
            <ul className="item-list">
              {result.items.map((item) => (
                <li key={item.paymentId}>
                  <Link to={`/admin/merchants/${merchantId}/payments/${item.paymentId}`} className="item">
                    <span className="item-main">
                      <span>{item.paymentInfo || '결제'}</span>
                      <span className="amount">{formatAmount(item.amount, item.currency)}</span>
                    </span>
                    <span className="item-sub">
                      <span className="hint">
                        {formatDateTime(item.createdAt)}
                        {item.refundedAmount > 0 ? ` · 환불 ${formatAmount(item.refundedAmount, item.currency)}` : ''}
                      </span>
                      <PaymentStatusBadge status={item.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {result && result.totalPages > 1 && (
            <div className="pagination">
              <button type="button" className="secondary" disabled={page <= 0} onClick={() => go({ status, page: page - 1 })}>
                이전
              </button>
              <span>
                {result.page + 1} / {result.totalPages}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={page + 1 >= result.totalPages}
                onClick={() => go({ status, page: page + 1 })}
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
