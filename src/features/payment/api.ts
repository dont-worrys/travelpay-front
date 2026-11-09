import { apiRequest, apiRequestWithStatus, type PageResponse } from '../../api'
import type { Currency } from '../../lib/money'

/** 백엔드 `docs/guide/payment.md` 기준. */
export type PaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DECLINED'
  | 'REFUND_REQUESTED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'MANUAL_REVIEW'

export type RefundStatus = 'REQUESTED' | 'COMPLETED' | 'DECLINED' | 'MANUAL_REVIEW'

export type RefundRequestResult = 'REQUESTED' | 'CANCELLED' | 'REJECTED' | 'ACCEPTED'

export interface Refund {
  refundId: string
  status: RefundStatus
  amount: number
  currency: Currency
  reason: string | null
  declineReason: string | null
  createdAt: string
  updatedAt: string
}

/** 가장 최근 고객 환불 신청의 요약. 상세·신청·취소 응답에만 들어 있다. */
export interface RefundRequestSummary {
  result: RefundRequestResult
  requestedAt: string
  requestReason: string
  processedAt: string | null
  rejectReason: string | null
}

/** 결제 객체(결제 요청·상세·환불 신청/취소 응답). */
export interface Payment {
  paymentId: string
  status: PaymentStatus
  amount: number
  currency: Currency
  merchantName: string
  paymentInfo: string | null
  declineReason: string | null
  refunds: Refund[]
  refundRequest: RefundRequestSummary | null
  createdAt: string
  updatedAt: string
}

/** 내 결제 목록 항목. */
export interface PaymentSummary {
  paymentId: string
  status: PaymentStatus
  amount: number
  currency: Currency
  merchantName: string
  createdAt: string
}

export interface PaymentCreateInput {
  merchantId: string
  currency: Currency
  amount: number
  paymentInfo?: string
}

export interface PaymentListQuery {
  status?: PaymentStatus
  page?: number
  size?: number
}

/**
 * 결제 요청. 성공하면 201이고 결과는 `status`(`APPROVED`·`PENDING`·`MANUAL_REVIEW`)로 구분한다.
 * 거절은 422 `PAYMENT_DECLINED`로 던진다. 다시 보낼 때는 같은 `idempotencyKey`와 같은 본문을 쓴다.
 */
export function createPayment(input: PaymentCreateInput, idempotencyKey: string) {
  return apiRequestWithStatus<Payment>('/api/v1/payments', {
    method: 'POST',
    body: input,
    idempotencyKey,
  })
}

export function fetchPayment(paymentId: string, signal?: AbortSignal): Promise<Payment> {
  return apiRequest<Payment>(`/api/v1/payments/${encodeURIComponent(paymentId)}`, { signal })
}

export function fetchPayments(query: PaymentListQuery, signal?: AbortSignal): Promise<PageResponse<PaymentSummary>> {
  return apiRequest<PageResponse<PaymentSummary>>('/api/v1/payments', {
    query: { status: query.status, page: query.page, size: query.size },
    signal,
  })
}

/** 환불 신청. `APPROVED` 결제만, 승인 후 3일 안. 원장을 부르지 않으므로 멱등성 키가 없다. */
export function requestRefund(paymentId: string, reason: string): Promise<Payment> {
  return apiRequest<Payment>(`/api/v1/payments/${encodeURIComponent(paymentId)}/refund-request`, {
    method: 'POST',
    body: { reason },
  })
}

/** 가맹점이 처리하기 전(`REFUND_REQUESTED`)이면 환불 신청을 취소한다. */
export function cancelRefundRequest(paymentId: string): Promise<Payment> {
  return apiRequest<Payment>(`/api/v1/payments/${encodeURIComponent(paymentId)}/refund-request`, {
    method: 'DELETE',
  })
}
