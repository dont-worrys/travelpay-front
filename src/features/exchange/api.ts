import { apiRequest, apiRequestWithStatus, type PageResponse } from '../../api'
import type { Currency } from '../../lib/money'

/**
 * exchange-service 컨트롤러·DTO 기준(백엔드에 환전 가이드 문서가 아직 없음).
 * 다른 서비스와 달리 금액·환율은 주 단위 소수 문자열이다(예: CNY "10.50"). 화면에서는 계산하지 않고
 * `majorToMinor`로 최소 단위 정수로 바꿔 비교·표시한다.
 */
export type ForeignCurrency = 'JPY' | 'CNY'
export const FOREIGN_CURRENCIES: readonly ForeignCurrency[] = ['JPY', 'CNY']

/** EXCHANGE: 원화 → 외화, RE_EXCHANGE: 외화 → 원화. */
export type ExchangeType = 'EXCHANGE' | 'RE_EXCHANGE'
export type ExchangeStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'MANUAL_REVIEW'
export type ExchangeFailureReason =
  | 'INSUFFICIENT_BALANCE'
  | 'WALLET_SUSPENDED'
  | 'ACCOUNT_NOT_FOUND'
  | 'NOT_PROCESSED'
  | 'PROCESSING_ERROR'
export type QuoteStatus = 'ISSUED' | 'USED' | 'EXPIRED'

/** 환율은 `unit` 단위 외화의 원화 가격이다(JPY unit=100이면 100엔당). */
export interface ExchangeRate {
  currency: ForeignCurrency
  priceCurrency: string
  unit: number
  midRate: string
  /** 고객이 외화를 살 때(환전). */
  buyRate: string
  /** 고객이 외화를 팔 때(재환전). */
  sellRate: string
  source: string
  rateDate: string
  collectedAt: string
}

/** 보내는 통화별 1회 한도와 내 지갑으로 보낼 수 있는 금액. 잔액을 못 가져오면 `balance`·`availableAmount`가 null. */
export interface ExchangeLimit {
  currency: Currency
  minAmount: string
  maxAmount: string
  balance: string | null
  availableAmount: string | null
}

export interface ExchangeQuote {
  quoteId: string
  fromCurrency: Currency
  fromAmount: string
  toCurrency: Currency
  toAmount: string
  feeRate: string
  feeAmount: string
  /** 지갑에서 빠질 금액(보내는 금액 + 수수료). */
  totalDebitAmount: string
  appliedRate: string
  rateUnit: number
  rateDate: string
  status: QuoteStatus
  expiresAt: string
  createdAt: string
}

export interface QuoteInput {
  fromCurrency: Currency
  toCurrency: Currency
  /** 보내는 금액(주 단위 문자열). 서버가 BigDecimal로 받으므로 문자열로 보내 소수 오차를 피한다. */
  amount: string
}

export interface ExchangeOrder {
  orderId: string
  type: ExchangeType
  status: ExchangeStatus
  failureReason: ExchangeFailureReason | null
  quoteId: string
  walletId: string
  fromCurrency: Currency
  fromAmount: string
  toCurrency: Currency
  toAmount: string
  feeRate: string
  feeAmount: string
  totalDebitAmount: string
  appliedRate: string
  rateUnit: number
  rateDate: string
  requestedAt: string
  settledAt: string | null
  /**
   * 예약 체결로 만들어진 주문이면 그 예약 ID, 일반 환전이면 null.
   * 이 필드가 없는 예전 서버에서도 동작하도록 없으면 일반 환전으로 본다.
   */
  reservationId?: string | null
}

export interface ExchangeOrderSummary {
  orderId: string
  type: ExchangeType
  status: ExchangeStatus
  failureReason: ExchangeFailureReason | null
  fromCurrency: Currency
  fromAmount: string
  toCurrency: Currency
  toAmount: string
  totalDebitAmount: string
  requestedAt: string
  settledAt: string | null
  /**
   * 예약 체결로 만들어진 주문이면 그 예약 ID, 일반 환전이면 null.
   * 이 필드가 없는 예전 서버에서도 동작하도록 없으면 일반 환전으로 본다.
   */
  reservationId?: string | null
}

export interface ExchangeListQuery {
  status?: ExchangeStatus
  type?: ExchangeType
  page?: number
  size?: number
}

/** 공개 API(로그인 불필요). `currency`를 지정해도 응답은 목록이다. */
export function fetchExchangeRates(currency?: ForeignCurrency, signal?: AbortSignal): Promise<ExchangeRate[]> {
  return apiRequest<ExchangeRate[]>('/api/v1/exchange-rates', { query: { currency }, signal })
}

export function fetchExchangeLimits(signal?: AbortSignal): Promise<ExchangeLimit[]> {
  return apiRequest<ExchangeLimit[]>('/api/v1/exchange-limits', { signal })
}

/** 견적 발급(5분 유효). 돈이 움직이지 않으므로 멱등성 키가 없다. 환율이 없으면 503 `EXCHANGE_RATE_UNAVAILABLE`. */
export function issueQuote(input: QuoteInput): Promise<ExchangeQuote> {
  return apiRequest<ExchangeQuote>('/api/v1/exchange-quotes', { method: 'POST', body: input })
}

/**
 * 환전 신청. 200 `COMPLETED`, 202 `PROCESSING`·`MANUAL_REVIEW`. 실패(`FAILED`)는 422로 던진다.
 * 견적 하나는 한 번만 쓸 수 있으므로 견적마다 키를 하나 만들고, 다시 보낼 때는 같은 키를 쓴다.
 */
export function placeExchange(quoteId: string, walletId: string, idempotencyKey: string) {
  return apiRequestWithStatus<ExchangeOrder>('/api/v1/exchanges', {
    method: 'POST',
    body: { quoteId, walletId },
    idempotencyKey,
  })
}

export function fetchExchanges(query: ExchangeListQuery, signal?: AbortSignal): Promise<PageResponse<ExchangeOrderSummary>> {
  return apiRequest<PageResponse<ExchangeOrderSummary>>('/api/v1/exchanges', {
    query: { status: query.status, type: query.type, page: query.page, size: query.size },
    signal,
  })
}

export function fetchExchange(orderId: string, signal?: AbortSignal): Promise<ExchangeOrder> {
  return apiRequest<ExchangeOrder>(`/api/v1/exchanges/${encodeURIComponent(orderId)}`, { signal })
}

/** 예약 환전. 목표 매매기준율에 닿으면 서버가 환전 주문을 만든다. 예약할 때는 잔액을 묶지 않는다. */
export type ReservationStatus = 'WAITING' | 'EXECUTED' | 'CANCELED' | 'EXPIRED'
export type ReservationCancelReason = 'USER_REQUESTED' | 'WALLET_UNAVAILABLE' | 'EXECUTION_REJECTED'
/** 원화 → 외화는 목표 이하(`AT_OR_BELOW`), 외화 → 원화는 목표 이상(`AT_OR_ABOVE`)일 때 체결. */
export type ReservationCondition = 'AT_OR_BELOW' | 'AT_OR_ABOVE'

export interface ExchangeReservationSummary {
  reservationId: string
  type: ExchangeType
  status: ReservationStatus
  cancelReason: ReservationCancelReason | null
  fromCurrency: Currency
  fromAmount: string
  toCurrency: Currency
  targetRate: string
  rateUnit: number
  condition: ReservationCondition
  expiresAt: string
  orderId: string | null
  createdAt: string
}

export interface ExchangeReservation extends ExchangeReservationSummary {
  walletId: string
  /** 체결로 만든 주문의 현재 상태. 체결 전이면 null. */
  orderStatus: ExchangeStatus | null
  executedAt: string | null
}

export interface ReservationInput {
  walletId: string
  fromCurrency: Currency
  toCurrency: Currency
  /** 보내는 금액(주 단위 문자열). */
  amount: string
  /** 목표 매매기준율(환율 조회와 같은 단위, 소수 둘째 자리까지). */
  targetRate: string
  /** 만료 시각(UTC ISO-8601). */
  expiresAt: string
}

/**
 * 예약 등록(201). 같은 키·같은 본문이면 처음 예약을 돌려주고 본문이 다르면 409
 * `EXCHANGE_RESERVATION_IDEMPOTENCY_KEY_REUSED`이므로, 재시도는 처음 본문(만료 시각 포함)을 그대로 보낸다.
 */
export function createReservation(input: ReservationInput, idempotencyKey: string): Promise<ExchangeReservation> {
  return apiRequest<ExchangeReservation>('/api/v1/exchange-reservations', {
    method: 'POST',
    body: input,
    idempotencyKey,
  })
}

export function fetchReservations(
  query: { status?: ReservationStatus; page?: number; size?: number },
  signal?: AbortSignal,
): Promise<PageResponse<ExchangeReservationSummary>> {
  return apiRequest<PageResponse<ExchangeReservationSummary>>('/api/v1/exchange-reservations', {
    query: { status: query.status, page: query.page, size: query.size },
    signal,
  })
}

export function fetchReservation(reservationId: string, signal?: AbortSignal): Promise<ExchangeReservation> {
  return apiRequest<ExchangeReservation>(`/api/v1/exchange-reservations/${encodeURIComponent(reservationId)}`, {
    signal,
  })
}

/** 대기 중인 예약만 취소할 수 있다. 이미 체결·취소·만료됐으면 409 `EXCHANGE_RESERVATION_NOT_WAITING`. */
export function cancelReservation(reservationId: string): Promise<ExchangeReservation> {
  return apiRequest<ExchangeReservation>(
    `/api/v1/exchange-reservations/${encodeURIComponent(reservationId)}/cancel`,
    { method: 'POST' },
  )
}
