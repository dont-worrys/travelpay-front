import { apiRequest, type PageResponse } from '../../api'
import type { Currency } from '../../lib/money'
import type { TransferStatus } from '../transfer/api'
import type { ChargeStatus } from '../wallet/api'

/**
 * 관리자 자금 운영 API(송금·충전). 송금은 백엔드 `docs/guide/payment-transfer.md` "관리자 조회",
 * 충전은 wallet-service `AdminChargeController`·`AdminReconciliationController`(가이드에 보정·대사 절이 없어 코드 기준).
 */

// ---- 송금 (payment-service) ----

export type TransferReviewReason = 'RETRY_EXHAUSTED' | 'LEDGER_REQUEST_NOT_ACCEPTED'
export type TransferFailureReason = 'INSUFFICIENT_BALANCE' | 'ACCOUNT_UNAVAILABLE' | 'NOT_PROCESSED'
export type AdminTransferOrder = 'LATEST' | 'OLDEST'

/** 관리자 송금 객체. `direction`·멱등성 키는 없고 지갑 ID·사유·시도 횟수가 있다. */
export interface AdminTransfer {
  transferId: string
  senderId: string
  receiverId: string
  sourceWalletId: string | null
  targetWalletId: string | null
  amount: number
  currency: Currency
  status: TransferStatus
  /** `FAILED`일 때만. */
  failureReason: TransferFailureReason | null
  /** `MANUAL_REVIEW`일 때만. */
  reviewReason: TransferReviewReason | null
  attemptCount: number
  memo: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminTransferQuery {
  status?: TransferStatus
  currency?: Currency
  /** 송금인 또는 수취인. */
  userId?: string
  orderType?: AdminTransferOrder
  page?: number
  size?: number
}

/** 운영자 확정 이력 한 줄(확정만 남는다). */
export interface TransferHistory {
  historyId: string
  fromStatus: TransferStatus
  toStatus: TransferStatus
  reason: string
  actorType: string
  actorId: string
  /** 재처리(PROCESSING)로 돌린 경우 없음. */
  ledgerTransactionId: string | null
  createdAt: string
}

/** 확정 미리보기. 상태를 바꾸지 않으며, 확정 때 서버가 원장을 다시 조회해 대조한다. */
export interface TransferResolutionPreview {
  transferId: string
  reviewReason: TransferReviewReason | null
  ledger: {
    found: boolean
    transactionId: string | null
    status: 'POSTED' | 'REJECTED' | null
    rejectReason: string | null
    /** `POSTED`일 때만 값이 있다. */
    entriesMatch: boolean | null
  }
  /** `POSTED`인데 항목이 다르면 false(이때 `expectedStatus`·`ledgerTransactionId` 없음). */
  resolvable: boolean
  expectedStatus: TransferStatus | null
  expectedFailureReason: TransferFailureReason | null
  /** `COMPLETED`·`FAILED`만. `PROCESSING`(재처리)은 없음. */
  ledgerTransactionId: string | null
}

export interface TransferResolveInput {
  targetStatus: TransferStatus
  /** 확정 판단 근거(필수, 255자 이하). 이력에 남는다. */
  reason: string
  /** `PROCESSING`이면 보내지 않는다(undefined는 본문에서 빠진다). */
  ledgerTransactionId?: string
}

export function fetchAdminTransfers(query: AdminTransferQuery, signal?: AbortSignal) {
  return apiRequest<PageResponse<AdminTransfer>>('/api/v1/admin/transfers', { query: { ...query }, signal })
}

export function fetchAdminTransfer(transferId: string, signal?: AbortSignal) {
  return apiRequest<AdminTransfer>(`/api/v1/admin/transfers/${encodeURIComponent(transferId)}`, { signal })
}

export function fetchTransferHistory(transferId: string, signal?: AbortSignal) {
  return apiRequest<TransferHistory[]>(`/api/v1/admin/transfers/${encodeURIComponent(transferId)}/history`, { signal })
}

/** `MANUAL_REVIEW`가 아니면 409 `COMMON_CONFLICT`, 원장 조회 실패는 502·503·504. */
export function fetchTransferResolution(transferId: string, signal?: AbortSignal) {
  return apiRequest<TransferResolutionPreview>(
    `/api/v1/admin/transfers/${encodeURIComponent(transferId)}/resolution`,
    { signal },
  )
}

/**
 * 확정. `Idempotency-Key`는 받지 않는다. 같은 운영자가 같은 본문으로 다시 보내면(응답 유실 후 재시도)
 * 서버가 원장을 다시 조회하지 않고 현재 상태를 200으로 돌려준다. 원장 결과가 미리보기와 다르면 409 `TRANSFER_RESOLUTION_MISMATCH`.
 */
export function resolveTransfer(transferId: string, input: TransferResolveInput) {
  return apiRequest<AdminTransfer>(`/api/v1/admin/transfers/${encodeURIComponent(transferId)}/resolve`, {
    method: 'POST',
    body: input,
  })
}

// ---- 충전 (wallet-service) ----

export interface AdminCharge {
  chargeId: string
  userId: string
  status: ChargeStatus
  amount: number
  currency: Currency
  bankCode: string
  accountNumberMask: string
  failureCode: string | null
  failureMessage: string | null
  attemptCount: number
  createdAt: string
  updatedAt: string
}

export interface AdminChargeQuery {
  status?: ChargeStatus
  userId?: string
  page?: number
  size?: number
}

export type ChargeResolutionAction =
  | 'CONFIRM_COMPLETED'
  | 'CONFIRM_FAILED'
  | 'CONFIRM_REFUNDED'
  | 'RESUME_CREDIT'
  | 'RESUME_REFUND'

export const CHARGE_RESOLUTION_ACTIONS: readonly ChargeResolutionAction[] = [
  'CONFIRM_COMPLETED',
  'CONFIRM_FAILED',
  'CONFIRM_REFUNDED',
  'RESUME_CREDIT',
  'RESUME_REFUND',
]

/** 은행 출금·환불·원장 한 소스의 사실. 은행은 `currency`가 없다. */
export interface SourceFact {
  lookup: 'FOUND' | 'NOT_FOUND' | 'UNAVAILABLE'
  transactionId: string | null
  status: string | null
  amount: number | null
  currency: string | null
}

/** 보정 전 확인. 아무것도 바꾸지 않으며 실행 허가가 아니다(실행 때 서버가 다시 조회해 판단). */
export interface ChargeReview {
  chargeId: string
  status: ChargeStatus
  amount: number
  currency: Currency
  manualReviewAt: string
  notFoundConfirmedAt: string
  checkedAt: string
  withdrawal: SourceFact
  refund: SourceFact
  ledger: SourceFact
  availableActions: ChargeResolutionAction[]
  /** 조치와 무관하게 판정할 수 없는 이유. */
  blockers: string[]
  unavailableActions: { action: ChargeResolutionAction; reasons: string[] }[]
}

export interface ChargeResolveInput {
  action: ChargeResolutionAction
  /** 필수, 500자 이하. */
  reason: string
  /** 연결할 대사 결과(선택, 같은 충전의 결과). */
  reconciliationResultId?: string
}

/** 반영된 보정. 같은 키 재요청에도 처음 결과와 같다. */
export interface ChargeResolution {
  resolutionId: string
  chargeId: string
  action: ChargeResolutionAction
  resultStatus: ChargeStatus
  operatorId: string
  reason: string
  reconciliationResultId: string | null
  withdrawal: SourceFact
  refund: SourceFact
  ledger: SourceFact
  resolvedAt: string
}

export function fetchAdminCharges(query: AdminChargeQuery, signal?: AbortSignal) {
  return apiRequest<PageResponse<AdminCharge>>('/api/v1/admin/charges', { query: { ...query }, signal })
}

/** `MANUAL_REVIEW`가 아니면 409 `CHARGE_NOT_IN_MANUAL_REVIEW`. */
export function fetchChargeReview(chargeId: string, signal?: AbortSignal) {
  return apiRequest<ChargeReview>(`/api/v1/admin/charges/${encodeURIComponent(chargeId)}/review`, { signal })
}

/**
 * 보정. `Idempotency-Key` 필수. 결과를 모르면 같은 키·같은 본문으로 다시 보낸다.
 * 판정 불가 409 `CHARGE_RESOLUTION_REJECTED`·조회 불가 503 `CHARGE_RESOLUTION_SOURCE_UNAVAILABLE`은
 * 반영하지 않았다는 확정 응답이며 `details`에 거절 이유(`reason`)와 지금 사실이 온다.
 */
export function resolveCharge(chargeId: string, input: ChargeResolveInput, idempotencyKey: string) {
  return apiRequest<ChargeResolution>(`/api/v1/admin/charges/${encodeURIComponent(chargeId)}/resolve`, {
    method: 'POST',
    body: input,
    idempotencyKey,
  })
}

// ---- 충전 대사 ----

export type ReconciliationRunStatus = 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED'
export type ReconciliationRunType = 'AUTO' | 'MANUAL'
export type MismatchType =
  | 'BANK_DEBIT_WITHOUT_CREDIT'
  | 'CREDIT_WITHOUT_BANK_DEBIT'
  | 'CREDIT_AND_REFUND_BOTH'
  | 'AMOUNT_MISMATCH'
  | 'STATUS_MISMATCH'
  | 'BANK_ORPHAN'
  | 'LEDGER_ORPHAN'
  | 'REVIEW_REQUIRED'
  | 'SOURCE_UNAVAILABLE'

export interface ReconciliationRun {
  runId: string
  runType: ReconciliationRunType
  status: ReconciliationRunStatus
  periodFrom: string
  periodTo: string
  overlapFrom: string | null
  startedAt: string
  finishedAt: string | null
  targetCount: number
  matchedCount: number
  mismatchCount: number
  unverifiableCount: number
  failureReason: string | null
}

export interface ReconciliationResultItem {
  resultId: string
  /** 고아 결과(은행·원장에만 있음)는 없다. */
  chargeId: string | null
  sourceType: 'BANK' | 'LEDGER' | null
  sourceKey: string | null
  mismatchType: MismatchType
  detail: string | null
  /** 저장된 JSON 문자열. */
  snapshot: string | null
  detectedAt: string
  resolutionStatus: 'PENDING' | 'RESOLVED'
}

export interface ReconciliationRunDetail {
  run: ReconciliationRun
  results: PageResponse<ReconciliationResultItem>
}

/** 수동 대사. 끝까지 대사한 뒤 응답한다(동기). from·to는 둘 다 생략(스케줄러와 같은 기간)하거나 둘 다 지정한다. */
export function runReconciliation(period: { from?: string; to?: string }) {
  return apiRequest<ReconciliationRun>('/api/v1/admin/charges/reconciliations', {
    method: 'POST',
    query: { from: period.from, to: period.to },
  })
}

export function fetchReconciliationRuns(
  query: { status?: ReconciliationRunStatus; page?: number; size?: number },
  signal?: AbortSignal,
) {
  return apiRequest<PageResponse<ReconciliationRun>>('/api/v1/admin/charges/reconciliations', {
    query: { ...query },
    signal,
  })
}

export function fetchReconciliationRun(
  runId: string,
  query: { mismatchType?: MismatchType; page?: number; size?: number },
  signal?: AbortSignal,
) {
  return apiRequest<ReconciliationRunDetail>(`/api/v1/admin/charges/reconciliations/${encodeURIComponent(runId)}`, {
    query: { ...query },
    signal,
  })
}
