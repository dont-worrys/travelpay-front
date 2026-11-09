import { apiRequest, apiRequestWithStatus, type PageResponse } from '../../api'
import type { Currency } from '../../lib/money'

/** 백엔드 `docs/guide/payment-transfer.md` 기준. */
export type TransferStatus = 'REQUESTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'MANUAL_REVIEW'
export type TransferDirection = 'SENT' | 'RECEIVED'

/** 송금 객체. `direction`은 요청자 기준이다. */
export interface Transfer {
  transferId: string
  direction: TransferDirection
  senderId: string
  receiverId: string
  amount: number
  currency: Currency
  status: TransferStatus
  memo: string | null
  createdAt: string
}

/** 수취인 확인 결과. 이름은 서버가 마스킹한 값이다. */
export interface RecipientCheck {
  receiverId: string
  receiverName: string
  transferable: boolean
}

export interface TransferCreateInput {
  receiverId: string
  amount: number
  currency: Currency
  memo?: string
}

export interface TransferListQuery {
  direction?: TransferDirection
  page?: number
  size?: number
}

export function checkRecipient(receiverId: string, signal?: AbortSignal): Promise<RecipientCheck> {
  return apiRequest<RecipientCheck>(`/api/v1/transfers/recipients/${encodeURIComponent(receiverId)}`, { signal })
}

/**
 * 송금 요청. 201 `COMPLETED`, 202 `PROCESSING`·`MANUAL_REVIEW`.
 * 422는 거절이며 `ApiError`로 던진다. 다시 보낼 때는 같은 `idempotencyKey`와 같은 본문을 쓴다.
 */
export function createTransfer(input: TransferCreateInput, idempotencyKey: string) {
  return apiRequestWithStatus<Transfer>('/api/v1/transfers', {
    method: 'POST',
    body: input,
    idempotencyKey,
  })
}

export function fetchTransfer(transferId: string, signal?: AbortSignal): Promise<Transfer> {
  return apiRequest<Transfer>(`/api/v1/transfers/${encodeURIComponent(transferId)}`, { signal })
}

export function fetchTransfers(query: TransferListQuery, signal?: AbortSignal): Promise<PageResponse<Transfer>> {
  return apiRequest<PageResponse<Transfer>>('/api/v1/transfers', {
    query: { direction: query.direction, page: query.page, size: query.size },
    signal,
  })
}

/** `REQUESTED` 송금만 송금인이 취소할 수 있다. 그 밖의 상태는 409 `COMMON_CONFLICT`. */
export function cancelTransfer(transferId: string): Promise<Transfer> {
  return apiRequest<Transfer>(`/api/v1/transfers/${encodeURIComponent(transferId)}/cancel`, { method: 'POST' })
}
