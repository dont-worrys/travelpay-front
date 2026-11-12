import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { isApiError, isOutcomeUnknown } from '../../api'
import { FieldList } from '../../features/admin/FieldList'
import { isAbortError } from '../../features/admin/input'
import { PAYMENT_REASONS, toAdminMessage, type ReviewField } from '../../features/admin/reviews'
import {
  fetchAdminTransfer,
  fetchTransferHistory,
  fetchTransferResolution,
  resolveTransfer,
  type AdminTransfer,
  type TransferHistory,
  type TransferResolutionPreview,
  type TransferResolveInput,
} from '../../features/admin/treasuryApi'
import { STATUS_LABEL } from '../../features/transfer/status'
import { TransferStatusBadge } from '../../features/transfer/TransferStatusBadge'
import { formatDateTime } from '../../lib/datetime'
import { formatAmount } from '../../lib/money'

const REASON_MAX = 255

const TRANSFER_FAILURE_LABEL: Record<string, string> = {
  INSUFFICIENT_BALANCE: '잔액 부족',
  ACCOUNT_UNAVAILABLE: '계정 사용 불가',
  NOT_PROCESSED: '원장 미수락(운영자 실패 확정)',
}

const LEDGER_TX_STATUS_LABEL: Record<string, string> = {
  POSTED: '반영됨(POSTED)',
  REJECTED: '거절됨(REJECTED)',
}

function label(map: Record<string, string>, value: string | null): string {
  return value ? (map[value] ?? value) : '-'
}

function statusLabel(status: string | null): string {
  return status ? `${STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status} (${status})` : '-'
}

/** 확정 사유 초안. 이력만 보고도 판단을 다시 확인할 수 있게 원장 결과를 적는다(가이드 예시 형식). */
function suggestReason(preview: TransferResolutionPreview): string {
  switch (preview.expectedStatus) {
    case 'COMPLETED':
      return `원장 POSTED(${preview.ledgerTransactionId ?? '-'}), 항목 일치 확인`
    case 'FAILED':
      return preview.expectedFailureReason === 'NOT_PROCESSED'
        ? `원장 REJECTED(${preview.ledger.rejectReason ?? '-'}), 원장 미수락 요청이라 NOT_PROCESSED로 확정`
        : `원장 REJECTED(${preview.ledger.rejectReason ?? '-'}), 거래 ${preview.ledgerTransactionId ?? '-'} 확인`
    case 'PROCESSING':
      return '원장 기록 없음 확인, 자동 재처리로 되돌림'
    default:
      return ''
  }
}

function transferFields(transfer: AdminTransfer): ReviewField[] {
  const fields: ReviewField[] = [
    { label: '송금 ID', value: transfer.transferId, code: true },
    { label: '보낸 분 ID', value: transfer.senderId, code: true },
    { label: '받는 분 ID', value: transfer.receiverId, code: true },
  ]
  if (transfer.sourceWalletId) {
    fields.push({ label: '보낸 지갑 ID', value: transfer.sourceWalletId, code: true })
  }
  if (transfer.targetWalletId) {
    fields.push({ label: '받는 지갑 ID', value: transfer.targetWalletId, code: true })
  }
  fields.push(
    { label: '상태', value: statusLabel(transfer.status) },
    { label: '멈춘 사유(reviewReason)', value: label(PAYMENT_REASONS, transfer.reviewReason) },
    { label: '실패 사유(failureReason)', value: label(TRANSFER_FAILURE_LABEL, transfer.failureReason) },
    { label: '결과 확인 시도(attemptCount)', value: `${transfer.attemptCount}회` },
    { label: '메모', value: transfer.memo || '-' },
    { label: '요청 시각', value: formatDateTime(transfer.createdAt) },
    { label: '마지막 변경', value: formatDateTime(transfer.updatedAt) },
  )
  return fields
}

function previewFields(preview: TransferResolutionPreview): ReviewField[] {
  const { ledger } = preview
  if (!ledger.found) {
    return [{ label: '원장 거래', value: '기록 없음' }]
  }
  const fields: ReviewField[] = [{ label: '원장 거래 상태', value: label(LEDGER_TX_STATUS_LABEL, ledger.status) }]
  if (ledger.transactionId) {
    fields.push({ label: '원장 거래 ID', value: ledger.transactionId, code: true })
  }
  if (ledger.rejectReason) {
    fields.push({ label: '원장 거절 사유', value: ledger.rejectReason })
  }
  if (ledger.entriesMatch !== null) {
    fields.push({ label: '원장 항목', value: ledger.entriesMatch ? '송금과 같음' : '송금과 다름' })
  }
  return fields
}

/**
 * 송금 상세·이력과 MANUAL_REVIEW 확정. 미리보기로 서버가 원장을 조회한 결과(확정할 상태·원장 거래 ID)를 받아
 * 그 값 그대로 확정을 요청하고, 서버는 확정 순간 원장을 다시 조회해 대조한다.
 * 확정은 멱등성 키가 없지만 같은 운영자·같은 본문의 재요청은 서버가 현재 상태로 돌려주므로,
 * 결과를 모를 때는 본문을 잠그고 같은 내용으로만 다시 보낸다.
 */
export function AdminTransferDetailPage() {
  const { transferId = '' } = useParams()

  const [transfer, setTransfer] = useState<AdminTransfer | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [history, setHistory] = useState<TransferHistory[] | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [preview, setPreview] = useState<TransferResolutionPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  /** 응답을 받지 못한 확정 본문. 다시 보낼 때 이 값을 그대로 쓴다. */
  const [pendingBody, setPendingBody] = useState<TransferResolveInput | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoadError(null)
    setHistoryError(null)
    fetchAdminTransfer(transferId, controller.signal)
      .then((data) => {
        setTransfer(data)
        if (data.status !== 'MANUAL_REVIEW') {
          // 확정됐으면 미리보기·결과 모름 상태는 더 이상 의미가 없다.
          setPreview(null)
          setPendingBody(null)
        }
      })
      .catch((cause) => {
        if (!isAbortError(cause)) {
          setLoadError(toAdminMessage(cause, '송금을 불러오지 못했습니다.'))
        }
      })
    fetchTransferHistory(transferId, controller.signal)
      .then(setHistory)
      .catch((cause) => {
        if (!isAbortError(cause)) {
          setHistoryError(toAdminMessage(cause, '이력을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [transferId, reloadToken])

  const reload = useCallback(() => setReloadToken((value) => value + 1), [])

  async function handlePreview() {
    setPreviewing(true)
    setPreviewError(null)
    setResolveError(null)
    setNotice(null)
    setPendingBody(null)
    setPreview(null)
    try {
      const data = await fetchTransferResolution(transferId)
      setPreview(data)
      setReason(suggestReason(data))
      setReasonError(null)
    } catch (cause) {
      if (isApiError(cause) && cause.code === 'COMMON_CONFLICT') {
        setPreviewError('처리 대기(MANUAL_REVIEW) 상태가 아니라 미리볼 수 없습니다. 최신 상태를 불러왔습니다.')
        reload()
      } else if (isOutcomeUnknown(cause)) {
        setPreviewError('원장을 조회하지 못했습니다(상태 그대로). 잠시 후 다시 미리보기 해 주세요.')
      } else {
        setPreviewError(toAdminMessage(cause, '미리보기를 불러오지 못했습니다.'))
      }
    } finally {
      setPreviewing(false)
    }
  }

  async function send(body: TransferResolveInput) {
    setSubmitting(true)
    setResolveError(null)
    try {
      const result = await resolveTransfer(transferId, body)
      setTransfer(result)
      setPreview(null)
      setPendingBody(null)
      setNotice(`${statusLabel(result.status)}(으)로 확정했습니다. 아래 상태 변경 이력에 확정 내용이 남았습니다.`)
      reload()
    } catch (cause) {
      if (isApiError(cause) && cause.code === 'TRANSFER_RESOLUTION_MISMATCH') {
        // 미리보기 뒤 원장 결과가 바뀌었다. 지난 미리보기 값으로는 다시 보내지 않는다.
        setPreview(null)
        setPendingBody(null)
        setResolveError(toAdminMessage(cause, '확정하지 못했습니다.'))
      } else if (isApiError(cause) && cause.code === 'COMMON_CONFLICT') {
        setPreview(null)
        setPendingBody(null)
        setResolveError('처리 대기(MANUAL_REVIEW) 상태가 아니어서 확정하지 않았습니다. 다른 운영자가 먼저 확정했을 수 있어 최신 상태를 불러왔습니다.')
        reload()
      } else if (isOutcomeUnknown(cause)) {
        setPendingBody(body)
        setResolveError(
          '확정 결과를 확인하지 못했습니다. 원장 조회 실패(502·503·504)로 반영되지 않았거나, 응답만 받지 못했을 수 있습니다.',
        )
      } else {
        setResolveError(toAdminMessage(cause, '확정하지 못했습니다.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleResolve(event: FormEvent) {
    event.preventDefault()
    if (!preview?.resolvable || !preview.expectedStatus) {
      return
    }
    const trimmed = reason.trim()
    if (!trimmed) {
      setReasonError('확정 근거를 입력해 주세요.')
      return
    }
    if (trimmed.length > REASON_MAX) {
      setReasonError(`확정 근거는 ${REASON_MAX}자 이하로 입력해 주세요.`)
      return
    }
    setReasonError(null)
    const body: TransferResolveInput = {
      targetStatus: preview.expectedStatus,
      reason: trimmed,
      ledgerTransactionId: preview.ledgerTransactionId ?? undefined,
    }
    if (!window.confirm(`이 송금을 "${statusLabel(body.targetStatus)}"(으)로 확정할까요?`)) {
      return
    }
    void send(body)
  }

  if (loadError && !transfer) {
    return (
      <section>
        <h1>송금 상세</h1>
        <p className="error" role="alert">
          {loadError}
        </p>
        <Link to="/admin/transfers">송금 목록</Link>
      </section>
    )
  }
  if (!transfer) {
    return <p className="loading">불러오는 중입니다…</p>
  }

  const isReview = transfer.status === 'MANUAL_REVIEW'
  const locked = submitting || pendingBody !== null

  return (
    <section>
      <div className="title-row">
        <h1>송금 상세</h1>
        <button type="button" className="link-button" onClick={reload} disabled={submitting}>
          새로고침
        </button>
      </div>
      <p className="amount-large">{formatAmount(transfer.amount, transfer.currency)}</p>
      <p>
        <TransferStatusBadge status={transfer.status} />
      </p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {loadError && <p className="error">{loadError}</p>}
      <FieldList fields={transferFields(transfer)} />

      {isReview && (
        <>
          <h2>확정 (MANUAL_REVIEW)</h2>
          <p className="hint">
            미리보기는 서버가 원장을 조회해 확정할 상태를 알려 줄 뿐 상태를 바꾸지 않습니다. 확정할 때 서버가 원장을 다시
            조회해 원장 거래 ID와 확정 상태를 대조합니다.
          </p>
          {!pendingBody && (
            <div className="actions">
              <button type="button" className="secondary" onClick={handlePreview} disabled={previewing || submitting}>
                {previewing ? '원장 조회 중…' : preview || resolveError ? '다시 미리보기' : '미리보기'}
              </button>
            </div>
          )}
          {preview && (
            <>
              <h3>원장 조회 결과</h3>
              <FieldList fields={previewFields(preview)} />
              <h3>확정하면</h3>
              {preview.resolvable && preview.expectedStatus ? (
                <>
                  <p className="amount-large">{statusLabel(preview.expectedStatus)}</p>
                  {preview.expectedFailureReason && (
                    <p className="hint">실패 사유: {label(TRANSFER_FAILURE_LABEL, preview.expectedFailureReason)}</p>
                  )}
                  {preview.expectedStatus === 'PROCESSING' && (
                    <p className="hint">시도 횟수를 0으로 되돌려 복구 스케줄러가 약 30초 뒤 다시 처리합니다.</p>
                  )}
                  <form className="form" onSubmit={handleResolve} noValidate>
                    <label>
                      확정 근거 (필수, {REASON_MAX}자 이하 · 이력에 남음)
                      <input
                        value={pendingBody ? pendingBody.reason : reason}
                        maxLength={REASON_MAX}
                        onChange={(event) => setReason(event.target.value)}
                        disabled={locked}
                      />
                      {reasonError && <span className="field-error">{reasonError}</span>}
                    </label>
                    <p className="hint">
                      보낼 값: 확정 상태 <code>{preview.expectedStatus}</code>
                      {preview.ledgerTransactionId && (
                        <>
                          {' '}
                          · 원장 거래 ID <code>{preview.ledgerTransactionId}</code>
                        </>
                      )}
                    </p>
                    {!pendingBody && (
                      <button type="submit" disabled={submitting}>
                        {submitting ? '확정 중…' : '확정'}
                      </button>
                    )}
                  </form>
                </>
              ) : (
                <p className="error">
                  확정할 수 없습니다. 원장에 반영됐지만 항목이 송금과 달라 원장 보정과 원인 조사가 필요합니다.
                </p>
              )}
            </>
          )}

        </>
      )}
      {(previewError || resolveError) && (
        <p className="error" role="alert">
          {resolveError ?? previewError}
        </p>
      )}
      {pendingBody && (
        <>
          <p className="hint">
            <strong>새로고침</strong>으로 상태를 확인하거나 <strong>같은 내용으로 다시 확정</strong>해 주세요. 같은
            운영자가 같은 내용으로 다시 보내면 서버가 두 번 반영하지 않고 현재 상태를 돌려줍니다.
          </p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => void send(pendingBody)} disabled={submitting}>
              {submitting ? '확정 중…' : '같은 내용으로 다시 확정'}
            </button>
          </div>
        </>
      )}

      <h2>상태 변경 이력</h2>
      {historyError && <p className="error">{historyError}</p>}
      {!history && !historyError && <p className="loading">불러오는 중입니다…</p>}
      {history && history.length === 0 && <p className="hint empty">운영자 확정 이력이 없습니다.</p>}
      {history && history.length > 0 && (
        <ul className="item-list">
          {history.map((item) => (
            <li key={item.historyId} className="item">
              <span className="item-main">
                <span>
                  {statusLabel(item.fromStatus)} → {statusLabel(item.toStatus)}
                </span>
                <span className="hint">{formatDateTime(item.createdAt)}</span>
              </span>
              <span className="item-sub">
                <span>{item.reason}</span>
              </span>
              <span className="item-sub">
                <span className="hint">
                  처리 담당자 <code>{item.actorId}</code>
                </span>
                {item.ledgerTransactionId && (
                  <span className="hint">
                    원장 거래 <code>{item.ledgerTransactionId}</code>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <Link to="/admin/transfers">송금 목록</Link>
      </div>
    </section>
  )
}
