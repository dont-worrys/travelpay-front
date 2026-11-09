import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import type { PageResponse } from '../api'
import {
  fetchMerchantBalance,
  fetchMerchantPayments,
  fetchSettlementPreview,
  type MerchantBalance,
  type MerchantPaymentSummary,
  type SettlementPreview,
} from '../features/merchant/api'
import { rememberMerchant } from '../features/merchant/recentMerchants'
import { toMerchantMessage } from '../features/merchant/status'
import type { PaymentStatus } from '../features/payment/api'
import { PaymentStatusBadge } from '../features/payment/PaymentStatusBadge'
import { formatDateTime } from '../lib/datetime'
import { formatAmount } from '../lib/money'

const PAGE_SIZE = 20
const TABS: { label: string; status?: PaymentStatus }[] = [
  { label: '전체' },
  { label: '환불 신청', status: 'REFUND_REQUESTED' },
  { label: '결제 완료', status: 'APPROVED' },
  { label: '환불 완료', status: 'REFUNDED' },
]
const TAB_STATUSES = new Set<string>(TABS.flatMap((tab) => (tab.status ? [tab.status] : [])))

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

/** 가맹점 주인 화면: 잔액, 정산 요약, 받은 결제 목록. */
export function MerchantHomePage() {
  const { merchantId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status') ?? ''
  const status = TAB_STATUSES.has(statusParam) ? (statusParam as PaymentStatus) : undefined
  const page = Math.max(0, Number.parseInt(searchParams.get('page') ?? '0', 10) || 0)

  const [balance, setBalance] = useState<MerchantBalance | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [preview, setPreview] = useState<SettlementPreview | null>(null)
  const [payments, setPayments] = useState<PageResponse<MerchantPaymentSummary> | null>(null)
  const [paymentsError, setPaymentsError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setBalance(null)
    setBalanceError(null)
    setPreview(null)
    fetchMerchantBalance(merchantId, controller.signal)
      .then((data) => {
        setBalance(data)
        rememberMerchant({ merchantId: data.merchantId, currency: data.currency })
      })
      .catch((cause) => {
        if (!isAbort(cause)) {
          setBalanceError(toMerchantMessage(cause, '가맹점 잔액을 불러오지 못했습니다.'))
        }
      })
    // 정산 요약은 안내용이라 실패하면 표시만 뺀다.
    fetchSettlementPreview(merchantId, controller.signal).then(setPreview, () => undefined)
    return () => controller.abort()
  }, [merchantId])

  useEffect(() => {
    const controller = new AbortController()
    setPayments(null)
    setPaymentsError(null)
    fetchMerchantPayments(merchantId, { status, page, size: PAGE_SIZE }, controller.signal)
      .then(setPayments)
      .catch((cause) => {
        if (!isAbort(cause)) {
          setPaymentsError(toMerchantMessage(cause, '결제 목록을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [merchantId, status, page])

  function go(next: { status?: PaymentStatus; page?: number }) {
    const params = new URLSearchParams()
    if (next.status) {
      params.set('status', next.status)
    }
    if (next.page) {
      params.set('page', String(next.page))
    }
    setSearchParams(params)
  }

  const paymentLink = balance
    ? `${window.location.origin}/payments/new?merchantId=${balance.merchantId}&currency=${balance.currency}`
    : null

  async function copyLink() {
    if (!paymentLink) {
      return
    }
    try {
      await navigator.clipboard.writeText(paymentLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // 클립보드를 쓸 수 없으면 화면에 보이는 링크를 직접 복사한다.
    }
  }

  return (
    <section>
      <div className="title-row">
        <h1>가맹점 관리</h1>
        <div className="actions inline">
          <Link to={`/merchant/${merchantId}/settlements`} className="button-link">
            정산
          </Link>
          <Link to="/merchant">다른 가맹점</Link>
        </div>
      </div>
      <p className="hint">
        가맹점 ID <code>{merchantId}</code>
      </p>

      <h2>잔액</h2>
      {balanceError && (
        <p className="error" role="alert">
          {balanceError}
        </p>
      )}
      {!balance && !balanceError && <p>불러오는 중입니다…</p>}
      {balance && <p className="amount-large">{formatAmount(balance.balance, balance.currency)}</p>}
      {preview && (
        <p className="hint">
          지금 정산 가능: {formatAmount(preview.available.amount, preview.currency)} ({preview.available.count}건) · 환불
          기간 대기: {formatAmount(preview.waiting.amount, preview.currency)} ({preview.waiting.count}건){' '}
          <Link to={`/merchant/${merchantId}/settlements`}>정산하기</Link>
        </p>
      )}

      {paymentLink && (
        <>
          <h2>결제 링크</h2>
          <p className="hint">고객에게 이 링크를 보내면 가맹점 ID와 통화가 채워진 결제 화면이 열립니다.</p>
          <div className="input-row">
            <input value={paymentLink} readOnly onFocus={(e) => e.target.select()} />
            <button type="button" className="secondary" onClick={copyLink}>
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
        </>
      )}

      <h2>받은 결제</h2>
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

      {paymentsError && (
        <p className="error" role="alert">
          {paymentsError}
        </p>
      )}
      {!payments && !paymentsError && <p>불러오는 중입니다…</p>}
      {payments && payments.items.length === 0 && (
        <p className="hint">{status === 'REFUND_REQUESTED' ? '처리할 환불 신청이 없습니다.' : '결제가 없습니다.'}</p>
      )}

      {payments && payments.items.length > 0 && (
        <ul className="item-list">
          {payments.items.map((item) => (
            <li key={item.paymentId}>
              <Link to={`/merchant/${merchantId}/payments/${item.paymentId}`} className="item">
                <span className="item-main">
                  <span>{item.paymentInfo || '결제'}</span>
                  <span className="amount received">+{formatAmount(item.amount, item.currency)}</span>
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

      {payments && payments.totalPages > 1 && (
        <div className="pagination">
          <button type="button" className="secondary" disabled={page <= 0} onClick={() => go({ status, page: page - 1 })}>
            이전
          </button>
          <span>
            {payments.page + 1} / {payments.totalPages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page + 1 >= payments.totalPages}
            onClick={() => go({ status, page: page + 1 })}
          >
            다음
          </button>
        </div>
      )}
    </section>
  )
}
