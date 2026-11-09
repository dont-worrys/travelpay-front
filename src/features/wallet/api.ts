import { apiRequest, apiRequestWithStatus, type PageResponse } from '../../api'
import type { Currency } from '../../lib/money'

/** 백엔드 `docs/guide/wallet-service.md` 기준. */
export type WalletStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED'

export interface Wallet {
  walletId: string
  status: WalletStatus
  currencies: Currency[]
}

export interface Balance {
  currency: Currency
  balance: number
}

/** 충전 내부 상태 8개를 그대로 받는다. */
export type ChargeStatus =
  | 'REQUESTED'
  | 'BANK_PROCESSING'
  | 'CREDIT_PROCESSING'
  | 'REFUND_PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUNDED'
  | 'MANUAL_REVIEW'

export interface Charge {
  chargeId: string
  status: ChargeStatus
  amount: number
  currency: Currency
  bankCode: string
  /** 뒤 4자리만 남긴 계좌번호. */
  accountNumberMask: string
  failureCode: string | null
  /** 실패 코드별 사용자용 문구. */
  failureMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface ChargeCreateInput {
  amount: number
  /** 원장 충전 원천 계정이 KRW뿐이라 KRW만 충전할 수 있다. */
  currency: 'KRW'
  bankCode: string
  accountNumber: string
}

export interface ChargeListQuery {
  status?: ChargeStatus
  page?: number
  size?: number
}

/** 지갑이 없으면 404 `WALLET_NOT_FOUND`. 상태와 관계없이 돌려준다. */
export function fetchMyWallet(signal?: AbortSignal): Promise<Wallet> {
  return apiRequest<Wallet>('/api/v1/wallets/me', { signal })
}

/** 지갑 개설. 회원당 하나이고 재요청이 멱등이라 `PENDING`에서 멈췄으면 같은 요청으로 마저 연다. */
export function openWallet(): Promise<Wallet> {
  return apiRequest<Wallet>('/api/v1/wallets', { method: 'POST' })
}

/** `ACTIVE`가 아니면 409 `WALLET_NOT_ACTIVE`, 원장 장애면 503 `WALLET_LEDGER_UNAVAILABLE`. */
export function fetchMyBalances(signal?: AbortSignal): Promise<Balance[]> {
  return apiRequest<Balance[]>('/api/v1/wallets/me/balances', { signal })
}

/** 202 처리 중, 200 같은 키로 이미 끝난 충전. 다시 보낼 때는 같은 키와 같은 본문을 쓴다. */
export function createCharge(input: ChargeCreateInput, idempotencyKey: string) {
  return apiRequestWithStatus<{ chargeId: string; status: ChargeStatus }>('/api/v1/charges', {
    method: 'POST',
    body: input,
    idempotencyKey,
  })
}

export function fetchCharge(chargeId: string, signal?: AbortSignal): Promise<Charge> {
  return apiRequest<Charge>(`/api/v1/charges/${encodeURIComponent(chargeId)}`, { signal })
}

export function fetchCharges(query: ChargeListQuery, signal?: AbortSignal): Promise<PageResponse<Charge>> {
  return apiRequest<PageResponse<Charge>>('/api/v1/charges', {
    query: { status: query.status, page: query.page, size: query.size },
    signal,
  })
}
