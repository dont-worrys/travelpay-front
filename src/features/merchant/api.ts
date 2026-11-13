import { apiRequest, apiRequestWithStatus, type PageResponse } from '../../api'
import type { Currency } from '../../lib/money'
import type { Payment, PaymentStatus } from '../payment/api'

/** 백엔드 `docs/guide/payment.md` 기준(가맹점 주인·`MASTER` API). */
export type SettlementStatus = 'REQUESTED' | 'PAID' | 'FAILED' | 'MANUAL_REVIEW'

export interface MerchantBalance {
  merchantId: string
  currency: Currency
  balance: number
}

/** 가맹점 결제 목록 항목. `refundedAmount`는 완료된 환불 합계다. */
export interface MerchantPaymentSummary {
  paymentId: string
  status: PaymentStatus
  amount: number
  refundedAmount: number
  currency: Currency
  paymentInfo: string | null
  createdAt: string
}

export interface MerchantPaymentListQuery {
  status?: PaymentStatus
  page?: number
  size?: number
}

export interface SettlementSummaryAmount {
  count: number
  amount: number
}

export interface SettlementPreview {
  currency: Currency
  /** 지금 정산할 수 있는 결제 전체. */
  available: SettlementSummaryAmount
  /** `available` 중 다음 정산 요청 한 번에 들어갈 몫(최대 1,000건). */
  nextSettlement: SettlementSummaryAmount
  /** 환불 기간이 아직 지나지 않아 기다리는 결제. */
  waiting: SettlementSummaryAmount
  nextAvailableAt: string | null
}

export interface Settlement {
  settlementId: string
  merchantId: string
  status: SettlementStatus
  amount: number
  currency: Currency
  ownerUserId: string
  paymentCount: number
  cutoffAt: string
  ledgerTransactionId: string | null
  failureReason: string | null
  /** `PAID`를 확정한 시각(입금 시각). `PAID`가 아니면 null. */
  paidAt: string | null
  /** 결제 담당이 추가하기로 한 필드(2026-11-13). 오기 전 서버에는 없다. */
  merchantName?: string | null
  createdAt: string
  updatedAt: string
}

export interface SettlementDetail {
  settlement: Settlement
  items: { paymentId: string; amount: number }[]
}

export interface RefundExecuteInput {
  amount: number
  reason: string
}

function merchantPath(merchantId: string): string {
  return `/api/v1/payments/merchants/${encodeURIComponent(merchantId)}`
}

/** 가맹점 잔액. 주인·`MASTER`가 아니면 404 `PAYMENT_MERCHANT_NOT_FOUND`, `PENDING` 가맹점은 422. */
export function fetchMerchantBalance(merchantId: string, signal?: AbortSignal): Promise<MerchantBalance> {
  return apiRequest<MerchantBalance>(`${merchantPath(merchantId)}/balance`, { signal })
}

export function fetchMerchantPayments(
  merchantId: string,
  query: MerchantPaymentListQuery,
  signal?: AbortSignal,
): Promise<PageResponse<MerchantPaymentSummary>> {
  return apiRequest<PageResponse<MerchantPaymentSummary>>(`${merchantPath(merchantId)}/payments`, {
    query: { status: query.status, page: query.page, size: query.size },
    signal,
  })
}

export function fetchMerchantPayment(merchantId: string, paymentId: string, signal?: AbortSignal): Promise<Payment> {
  return apiRequest<Payment>(`${merchantPath(merchantId)}/payments/${encodeURIComponent(paymentId)}`, { signal })
}

/**
 * 환불 실행. 가맹점 주인은 고객이 신청한(`REFUND_REQUESTED`) 결제만 할 수 있다.
 * 원장이 거절하면 422 `PAYMENT_REFUND_DECLINED`. 다시 보낼 때는 같은 `idempotencyKey`와 같은 금액을 쓴다.
 */
export function executeRefund(paymentId: string, input: RefundExecuteInput, idempotencyKey: string): Promise<Payment> {
  return apiRequest<Payment>(`/api/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
    method: 'POST',
    body: input,
    idempotencyKey,
  })
}

/** 고객의 환불 신청 거절. 원장을 부르지 않으므로 멱등성 키가 없다. */
export function rejectRefundRequest(paymentId: string, reason: string): Promise<Payment> {
  return apiRequest<Payment>(`/api/v1/payments/${encodeURIComponent(paymentId)}/refund-request/reject`, {
    method: 'POST',
    body: { reason },
  })
}

export function fetchSettlementPreview(merchantId: string, signal?: AbortSignal): Promise<SettlementPreview> {
  return apiRequest<SettlementPreview>(`${merchantPath(merchantId)}/settlements/preview`, { signal })
}

/**
 * 정산 요청. 201 `PAID`·`REQUESTED`·`MANUAL_REVIEW`. 정산할 결제가 없으면 422 `PAYMENT_NO_SETTLEMENT_TARGET`,
 * 원장이 거절하면 422 `PAYMENT_SETTLEMENT_DECLINED`. 본문은 없다.
 */
export function requestSettlement(merchantId: string, idempotencyKey: string) {
  return apiRequestWithStatus<Settlement>(`${merchantPath(merchantId)}/settlements`, {
    method: 'POST',
    idempotencyKey,
  })
}

export function fetchSettlements(
  merchantId: string,
  query: { page?: number; size?: number },
  signal?: AbortSignal,
): Promise<PageResponse<Settlement>> {
  return apiRequest<PageResponse<Settlement>>(`${merchantPath(merchantId)}/settlements`, {
    query: { page: query.page, size: query.size },
    signal,
  })
}

export function fetchSettlement(merchantId: string, settlementId: string, signal?: AbortSignal): Promise<SettlementDetail> {
  return apiRequest<SettlementDetail>(`${merchantPath(merchantId)}/settlements/${encodeURIComponent(settlementId)}`, {
    signal,
  })
}

/**
 * 내 정산 목록. 내가 주인인 모든 가맹점의 정산을 합친 페이지로, 서버 정렬은 요청 시각(`createdAt`) 최신순이다.
 * 가맹점이 없으면 빈 페이지.
 */
export function fetchMySettlements(
  query: { status?: SettlementStatus; page?: number; size?: number },
  signal?: AbortSignal,
): Promise<PageResponse<Settlement>> {
  return apiRequest<PageResponse<Settlement>>('/api/v1/payments/settlements/me', {
    query: { status: query.status, page: query.page, size: query.size },
    signal,
  })
}
