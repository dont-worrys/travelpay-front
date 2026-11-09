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
