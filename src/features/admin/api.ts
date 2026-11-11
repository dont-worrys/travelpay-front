import { apiRequest, apiRequestWithStatus, type PageResponse } from '../../api'
import type { Currency } from '../../lib/money'
import type { ExchangeFailureReason, ExchangeStatus, ExchangeType } from '../exchange/api'
import type { SettlementStatus } from '../merchant/api'
import type { PaymentStatus } from '../payment/api'

/**
 * 관리자(`MASTER`) API. 백엔드 `docs/guide/payment.md`(가맹점 생성, MANUAL_REVIEW 운영자 처리)와
 * `docs/guide/exchange-service.md`(관리자 처리) 기준. 처리 결과는 관리자가 고르지 않고 서버가 원장 조회로 정한다.
 * 처리(resolve)는 멱등성 키가 없고, 이미 처리됐으면 409(`*_NOT_MANUAL_REVIEW`)라 다시 보내도 두 번 반영되지 않는다.
 */

// ---- 가맹점 ----

export type MerchantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

export interface Merchant {
  merchantId: string
  name: string
  currency: Currency
  ownerUserId: string
  status: MerchantStatus
  createdAt: string
}

export interface MerchantCreateInput {
  name: string
  currency: Currency
  ownerUserId: string
}

/** 가맹점 생성. 201 `ACTIVE`, 원장 계정을 못 만들면 202 `PENDING`. 주인이 활성 회원이 아니면 404 `PAYMENT_MERCHANT_OWNER_NOT_FOUND`. */
export function createMerchant(input: MerchantCreateInput) {
  return apiRequestWithStatus<Merchant>('/api/v1/payments/merchants', { method: 'POST', body: input })
}

/** `PENDING` 가맹점의 원장 계정 생성 재시도. 이미 `PENDING`이 아니면 원장을 부르지 않고 현재 상태로 200. */
export function retryMerchantLedgerAccount(merchantId: string): Promise<Merchant> {
  return apiRequest<Merchant>(`/api/v1/payments/merchants/${encodeURIComponent(merchantId)}/ledger-account`, {
    method: 'POST',
  })
}

// ---- 결제·환불·정산 MANUAL_REVIEW (payment-service) ----

/** 결제·환불·정산이 멈춘 사유. */
export type PaymentReviewReason = 'RETRY_EXHAUSTED' | 'LEDGER_REQUEST_NOT_ACCEPTED'
/** 원장 조회 결과. 원장 조회에 실패하면 `ledger` 자체가 null이다. */
export type LedgerLookupStatus = 'POSTED' | 'REJECTED' | 'NOT_FOUND'

export interface ReviewLedger {
  status: LedgerLookupStatus
  transactionId: string | null
  /** 원장이 거절했을 때만 있다. */
  declineReason: string | null
}

export interface ReviewQuery {
  reviewReason?: string
  page?: number
  size?: number
}

export interface PaymentManualReview {
  paymentId: string
  userId: string
  merchantId: string
  amount: number
  currency: Currency
  reviewReason: PaymentReviewReason
  attemptCount: number
  createdAt: string
  updatedAt: string
}

export interface PaymentReviewExpected {
  /** false면 원장 보정이 필요해 처리할 수 없다. 그때 `status`·`paymentStatus`는 null. */
  resolvable: boolean
  status: string | null
  paymentStatus: PaymentStatus | null
  description: string
}

export interface PaymentReviewDetail extends PaymentManualReview {
  merchantName: string
  ledgerLookupFailed: boolean
  ledger: ReviewLedger | null
  expected: PaymentReviewExpected | null
}

export interface RefundManualReview {
  refundId: string
  paymentId: string
  /** 결제한 고객. */
  customerUserId: string
  merchantId: string
  /** 환불을 실행한 가맹점 주인 또는 `MASTER`. */
  requesterUserId: string
  amount: number
  currency: Currency
  reviewReason: PaymentReviewReason
  attemptCount: number
  createdAt: string
  updatedAt: string
}

export interface RefundReviewDetail extends RefundManualReview {
  paymentAmount: number
  /** 이 환불을 뺀 완료 환불 합계. */
  refundedAmount: number
  ledgerLookupFailed: boolean
  ledger: ReviewLedger | null
  expected: PaymentReviewExpected | null
}

/** 결제·환불 처리 응답. `status`는 처리 대상(결제 또는 환불)의 바뀐 상태. */
export interface PaymentResolveResult {
  paymentId: string
  refundId: string | null
  status: string
  paymentStatus: PaymentStatus
  ledgerStatus: LedgerLookupStatus
  ledgerTransactionId: string | null
}

export interface SettlementManualReview {
  settlementId: string
  merchantId: string
  ownerUserId: string
  amount: number
  currency: Currency
  reviewReason: PaymentReviewReason
  attemptCount: number
  createdAt: string
  updatedAt: string
}

export interface SettlementReviewDetail {
  settlement: SettlementManualReview
  paymentCount: number
  ledgerLookupFailed: boolean
  ledger: ReviewLedger | null
  expected: { resolvable: boolean; status: SettlementStatus | null; description: string } | null
}

export interface SettlementResolveResult {
  settlementId: string
  status: SettlementStatus
  failureReason: string | null
  ledgerStatus: LedgerLookupStatus
  ledgerTransactionId: string | null
}

/** 처리 본문. 메모는 운영 기록용이며 고객에게 보이지 않는다(255자 이하). 비어 있으면 본문을 보내지 않는다. */
function resolveBody(memo: string): { memo: string } | undefined {
  const trimmed = memo.trim()
  return trimmed ? { memo: trimmed } : undefined
}

export function fetchPaymentReviews(query: ReviewQuery, signal?: AbortSignal) {
  return apiRequest<PageResponse<PaymentManualReview>>('/api/v1/admin/payments/manual-reviews', { query: { ...query }, signal })
}

export function fetchPaymentReview(paymentId: string, signal?: AbortSignal) {
  return apiRequest<PaymentReviewDetail>(`/api/v1/admin/payments/${encodeURIComponent(paymentId)}`, { signal })
}

export function resolvePaymentReview(paymentId: string, memo: string) {
  return apiRequest<PaymentResolveResult>(`/api/v1/admin/payments/${encodeURIComponent(paymentId)}/resolve`, {
    method: 'POST',
    body: resolveBody(memo),
  })
}

export function fetchRefundReviews(query: ReviewQuery, signal?: AbortSignal) {
  return apiRequest<PageResponse<RefundManualReview>>('/api/v1/admin/payments/refunds/manual-reviews', {
    query: { ...query },
    signal,
  })
}

export function fetchRefundReview(refundId: string, signal?: AbortSignal) {
  return apiRequest<RefundReviewDetail>(`/api/v1/admin/payments/refunds/${encodeURIComponent(refundId)}`, { signal })
}

export function resolveRefundReview(refundId: string, memo: string) {
  return apiRequest<PaymentResolveResult>(`/api/v1/admin/payments/refunds/${encodeURIComponent(refundId)}/resolve`, {
    method: 'POST',
    body: resolveBody(memo),
  })
}

export function fetchSettlementReviews(query: ReviewQuery, signal?: AbortSignal) {
  return apiRequest<PageResponse<SettlementManualReview>>('/api/v1/admin/payments/settlements/manual-reviews', {
    query: { ...query },
    signal,
  })
}

export function fetchSettlementReview(settlementId: string, signal?: AbortSignal) {
  return apiRequest<SettlementReviewDetail>(`/api/v1/admin/payments/settlements/${encodeURIComponent(settlementId)}`, {
    signal,
  })
}

export function resolveSettlementReview(settlementId: string, memo: string) {
  return apiRequest<SettlementResolveResult>(
    `/api/v1/admin/payments/settlements/${encodeURIComponent(settlementId)}/resolve`,
    { method: 'POST', body: resolveBody(memo) },
  )
}

// ---- 환전 MANUAL_REVIEW (exchange-service) ----

export type ExchangeReviewReason =
  | 'LEDGER_BAD_REQUEST'
  | 'LEDGER_CONFLICT'
  | 'LEDGER_MALFORMED_RESPONSE'
  | 'LEDGER_UNKNOWN_REJECTION'
  | 'LEDGER_UNCONFIRMED_TOO_LONG'

/** 환전 API만 금액·환율이 주 단위 소수 문자열이다. */
export interface ExchangeManualReview {
  orderId: string
  userId: string
  walletId: string
  type: ExchangeType
  status: ExchangeStatus
  fromCurrency: Currency
  fromAmount: string
  toCurrency: Currency
  toAmount: string
  totalDebitAmount: string
  reviewReason: ExchangeReviewReason | null
  ledgerCheckCount: number
  requestedAt: string
  createdAt: string
}

/** 원장 거래 항목. `amount`는 최소 단위 정수. */
export interface LedgerEntry {
  ownerType: string
  walletId: string
  accountType: string
  currency: string
  direction: string
  amount: number
  entryType: string
}

export interface ExchangeReviewDetail extends ExchangeManualReview {
  feeAmount: string
  appliedRate: string
  rateUnit: number
  updatedAt: string
  ledgerLookupFailed: boolean
  ledger: {
    status: LedgerLookupStatus
    transactionId: string | null
    rejectReason: string | null
    entries: LedgerEntry[]
  } | null
  expected: {
    resolvable: boolean
    toStatus: ExchangeStatus | null
    failureReason: ExchangeFailureReason | null
    reason: string | null
    description: string
    expectedEntries: LedgerEntry[] | null
    actualEntries: LedgerEntry[] | null
  } | null
}

export interface ExchangeResolveResult {
  orderId: string
  status: ExchangeStatus
  failureReason: ExchangeFailureReason | null
  /** 처리 근거: `LEDGER_POSTED`·`LEDGER_REJECTED`·`LEDGER_NOT_FOUND`. */
  reason: string
  ledgerTransactionId: string | null
  settledAt: string | null
}

export function fetchExchangeReviews(query: ReviewQuery, signal?: AbortSignal) {
  return apiRequest<PageResponse<ExchangeManualReview>>('/api/v1/admin/exchanges/manual-reviews', {
    query: { ...query },
    signal,
  })
}

export function fetchExchangeReview(orderId: string, signal?: AbortSignal) {
  return apiRequest<ExchangeReviewDetail>(`/api/v1/admin/exchanges/${encodeURIComponent(orderId)}`, { signal })
}

export function resolveExchangeReview(orderId: string, memo: string) {
  return apiRequest<ExchangeResolveResult>(`/api/v1/admin/exchanges/${encodeURIComponent(orderId)}/resolve`, {
    method: 'POST',
    body: resolveBody(memo),
  })
}

// ---- 처리 기록·지연 환불 신청 ----

/** 결제·환불 처리 기록(`payment_review_resolutions`). 한 줄에 모든 정보가 있어 단건 조회는 없다. */
export interface PaymentResolutionRecord {
  resolutionId: string
  paymentId: string
  /** 환불 처리 기록일 때만. */
  refundId: string | null
  reviewReason: string
  ledgerStatus: string
  ledgerTransactionId: string | null
  toStatus: string
  actorId: string
  description: string
  memo: string | null
  createdAt: string
}

export interface SettlementResolutionRecord {
  resolutionId: string
  settlementId: string
  reviewReason: string
  ledgerStatus: string
  ledgerTransactionId: string | null
  toStatus: string
  actorId: string
  description: string
  memo: string | null
  createdAt: string
}

export interface ExchangeResolutionRecord {
  historyId: string
  orderId: string
  actorId: string
  fromStatus: string
  toStatus: string
  /** 처리 근거: `LEDGER_POSTED`·`LEDGER_REJECTED`·`LEDGER_NOT_FOUND`. */
  resolutionReason: string
  reviewReason: string | null
  failureReason: string | null
  ledgerTransactionId: string | null
  memo: string | null
  resolvedAt: string
}

/** 최신순, `size` 최대 100. `paymentId`는 그 결제와 그 결제의 환불 기록을 모두 돌려준다. */
export function fetchPaymentResolutions(
  query: { type?: 'PAYMENT' | 'REFUND'; actorId?: string; paymentId?: string; page?: number; size?: number },
  signal?: AbortSignal,
) {
  return apiRequest<PageResponse<PaymentResolutionRecord>>('/api/v1/admin/payments/resolutions', {
    query: { ...query },
    signal,
  })
}

export function fetchSettlementResolutions(
  query: { actorId?: string; settlementId?: string; page?: number; size?: number },
  signal?: AbortSignal,
) {
  return apiRequest<PageResponse<SettlementResolutionRecord>>('/api/v1/admin/payments/settlements/resolutions', {
    query: { ...query },
    signal,
  })
}

export function fetchExchangeResolutions(
  query: { actorId?: string; orderId?: string; page?: number; size?: number },
  signal?: AbortSignal,
) {
  return apiRequest<PageResponse<ExchangeResolutionRecord>>('/api/v1/admin/exchanges/resolutions', {
    query: { ...query },
    signal,
  })
}

/** 신청 후 3일 넘게 가맹점이 처리하지 않은 환불 신청. 오래된 순, `size` 최대 100. */
export interface OverdueRefundRequest {
  paymentId: string
  userId: string
  merchantId: string
  amount: number
  currency: Currency
  requestedAt: string
  requestReason: string | null
}

export function fetchOverdueRefundRequests(query: { page?: number; size?: number }, signal?: AbortSignal) {
  return apiRequest<PageResponse<OverdueRefundRequest>>('/api/v1/admin/payments/refund-requests/overdue', {
    query: { ...query },
    signal,
  })
}
