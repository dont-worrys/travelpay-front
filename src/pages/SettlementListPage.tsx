import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { isOutcomeUnknown, type PageResponse } from '../api'
import {
  fetchSettlementPreview,
  fetchSettlements,
  requestSettlement,
  type Settlement,
  type SettlementPreview,
} from '../features/merchant/api'
import { SettlementStatusBadge } from '../features/merchant/SettlementStatusBadge'
import { toMerchantMessage } from '../features/merchant/status'
import { formatDateTime } from '../lib/datetime'
import { newIdempotencyKey } from '../lib/idempotency'
import { formatAmount } from '../lib/money'

const PAGE_SIZE = 20

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

/** 정산 미리보기·요청·목록. */
export function SettlementListPage() {
  const { merchantId = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(0, Number.parseInt(searchParams.get('page') ?? '0', 10) || 0)

  const [preview, setPreview] = useState<SettlementPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [result, setResult] = useState<PageResponse<Settlement> | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [submitting, setSubmitting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  /** 정산 요청 응답을 받지 못한 상태. 같은 키로 다시 보내면 한 번만 정산된다. */
  const [uncertain, setUncertain] = useState(false)
  const pendingKey = useRef<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setPreview(null)
    setPreviewError(null)
    fetchSettlementPreview(merchantId, controller.signal)
      .then(setPreview)
      .catch((cause) => {
        if (!isAbort(cause)) {
          setPreviewError(toMerchantMessage(cause, '정산 금액을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [merchantId, reloadToken])

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setListError(null)
    fetchSettlements(merchantId, { page, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!isAbort(cause)) {
          setListError(toMerchantMessage(cause, '정산 내역을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [merchantId, page, reloadToken])

  async function handleRequest() {
    if (!preview) {
      return
    }
    if (
      !uncertain &&
      !window.confirm(
        `${formatAmount(preview.nextSettlement.amount, preview.currency)}(${preview.nextSettlement.count}건)을 내 지갑으로 정산할까요?`,
      )
    ) {
      return
    }
    // 정산 요청은 본문이 없다. 결과를 모를 때만 같은 키로 다시 보낸다.
    if (!pendingKey.current) {
      pendingKey.current = newIdempotencyKey()
    }
    setSubmitting(true)
    setRequestError(null)
    try {
      const { data } = await requestSettlement(merchantId, pendingKey.current)
      pendingKey.current = null
      setUncertain(false)
      navigate(`/merchant/${merchantId}/settlements/${data.settlementId}`, { state: { justRequested: true } })
    } catch (cause) {
      if (isOutcomeUnknown(cause)) {
        setUncertain(true)
        setRequestError(toMerchantMessage(cause, '정산 결과를 확인하지 못했습니다.'))
        return
      }
      pendingKey.current = null
      setUncertain(false)
      setRequestError(toMerchantMessage(cause, '정산을 요청하지 못했습니다.'))
      setReloadToken((value) => value + 1)
    } finally {
      setSubmitting(false)
    }
  }

  function goPage(next: number) {
    const params = new URLSearchParams()
    if (next) {
      params.set('page', String(next))
    }
    setSearchParams(params)
  }

  const canRequest = preview !== null && preview.available.count > 0

  return (
    <section>
      <div className="title-row">
        <h1>정산</h1>
        <Link to={`/merchant/${merchantId}`}>가맹점 관리</Link>
      </div>
      <p className="hint">
        환불 기간(승인 후 3일)이 지난 결제를 모아 가맹점 주인 회원 지갑으로 보냅니다. 부분 환불된 결제는 남은 금액만
        정산됩니다.
      </p>

      <h2>지금 정산할 수 있는 금액</h2>
      {previewError && (
        <p className="error" role="alert">
          {previewError}
        </p>
      )}
      {!preview && !previewError && <p>불러오는 중입니다…</p>}
      {preview && (
        <>
          <p className="amount-large">{formatAmount(preview.available.amount, preview.currency)}</p>
          <dl className="info">
            <dt>정산 가능</dt>
            <dd>{preview.available.count}건</dd>
            {preview.nextSettlement.count < preview.available.count && (
              <>
                <dt>이번 요청에 포함</dt>
                <dd>
                  {formatAmount(preview.nextSettlement.amount, preview.currency)} ({preview.nextSettlement.count}건) ·
                  나머지는 다음 요청에서 정산
                </dd>
              </>
            )}
            <dt>환불 기간 대기</dt>
            <dd>
              {formatAmount(preview.waiting.amount, preview.currency)} ({preview.waiting.count}건)
            </dd>
            {preview.nextAvailableAt && (
              <>
                <dt>다음 정산 가능 시각</dt>
                <dd>{formatDateTime(preview.nextAvailableAt)}</dd>
              </>
            )}
          </dl>
          <p className="hint">조회 시점 기준이라 요청하는 사이 환불이 생기면 금액이 달라질 수 있습니다.</p>
        </>
      )}

      {requestError && (
        <p className="error" role="alert">
          {requestError}
        </p>
      )}
      {uncertain && (
        <p className="hint">
          정산이 이미 요청되었을 수 있습니다. <strong>다시 시도</strong>는 같은 요청으로 보내므로 두 번 정산되지 않습니다.
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={handleRequest}
          disabled={submitting || (!canRequest && !uncertain)}
        >
          {submitting ? '요청 중…' : uncertain ? '다시 시도' : '정산 요청'}
        </button>
      </div>

      <h2>정산 내역</h2>
      {listError && (
        <p className="error" role="alert">
          {listError}
        </p>
      )}
      {!result && !listError && <p>불러오는 중입니다…</p>}
      {result && result.items.length === 0 && <p className="hint">정산 내역이 없습니다.</p>}
      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((item) => (
            <li key={item.settlementId}>
              <Link to={`/merchant/${merchantId}/settlements/${item.settlementId}`} className="item">
                <span className="item-main">
                  <span>{item.paymentCount}건</span>
                  <span className="amount">{formatAmount(item.amount, item.currency)}</span>
                </span>
                <span className="item-sub">
                  <span className="hint">{formatDateTime(item.createdAt)}</span>
                  <SettlementStatusBadge status={item.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result && result.totalPages > 1 && (
        <div className="pagination">
          <button type="button" className="secondary" disabled={page <= 0} onClick={() => goPage(page - 1)}>
            이전
          </button>
          <span>
            {result.page + 1} / {result.totalPages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page + 1 >= result.totalPages}
            onClick={() => goPage(page + 1)}
          >
            다음
          </button>
        </div>
      )}
    </section>
  )
}
