import { isApiError, toUserMessage } from '../../api'
import type { TransferDirection, TransferStatus } from './api'

export const STATUS_LABEL: Record<TransferStatus, string> = {
  REQUESTED: '접수',
  PROCESSING: '처리 중',
  COMPLETED: '완료',
  FAILED: '실패',
  CANCELLED: '취소',
  MANUAL_REVIEW: '확인 중',
}

export const DIRECTION_LABEL: Record<TransferDirection, string> = {
  SENT: '보냄',
  RECEIVED: '받음',
}

/** 화면에 상태와 함께 보여 줄 안내. 보낸 분과 받는 분이 할 수 있는 일이 달라 방향별로 둔다. */
const STATUS_DESCRIPTION: Record<TransferDirection, Partial<Record<TransferStatus, string>>> = {
  SENT: {
    PROCESSING: '송금 결과를 확인하고 있습니다. 서버가 자동으로 처리하니 다시 송금하지 마세요.',
    MANUAL_REVIEW: '자동 처리가 멈춰 운영자가 확인하고 있습니다. 잔액이 두 번 빠지지 않으니 다시 송금하지 마세요.',
    FAILED: '송금이 거절되었습니다. 잔액이 빠지지 않았습니다.',
    REQUESTED: '접수만 된 송금입니다. 아직 돈이 이동하지 않았습니다.',
  },
  RECEIVED: {
    PROCESSING: '송금 결과를 확인하고 있습니다. 완료되면 잔액에 들어옵니다.',
    MANUAL_REVIEW: '자동 처리가 멈춰 운영자가 확인하고 있습니다. 확인이 끝나면 결과가 반영됩니다.',
    FAILED: '보내는 분의 송금이 거절되었습니다. 받은 돈이 없습니다.',
    CANCELLED: '보내는 분이 취소한 송금입니다. 받은 돈이 없습니다.',
    REQUESTED: '접수만 된 송금입니다. 아직 돈이 들어오지 않았습니다.',
  },
}

export function statusDescription(direction: TransferDirection, status: TransferStatus): string | undefined {
  return STATUS_DESCRIPTION[direction][status]
}

/**
 * 금액 앞 부호와 글자 모양. 수취인 내역에는 실패·처리 중인 송금도 오므로(서버가 상태로 거르지 않음)
 * 받은 송금은 완료됐을 때만 입금(`+`)으로 표시한다. 보낸 송금은 결제 내역과 같이 상태와 관계없이 `-`.
 */
export function amountDisplay(direction: TransferDirection, status: TransferStatus): { sign: string; className: string } {
  if (direction === 'SENT') {
    return { sign: '-', className: 'amount sent' }
  }
  return status === 'COMPLETED' ? { sign: '+', className: 'amount received' } : { sign: '', className: 'amount' }
}

/** 더 이상 바뀌지 않는 상태. */
export function isFinalStatus(status: TransferStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED'
}

/** 서버 문구가 기술적이거나 상황 설명이 더 필요한 송금 오류만 바꾼다. */
const TRANSFER_MESSAGES: Record<string, string> = {
  TRANSFER_INVALID_IDEMPOTENCY_KEY: '요청을 처리하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  TRANSFER_IDEMPOTENCY_KEY_REUSED: '이전 요청과 내용이 달라 처리하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  TRANSFER_RECEIVER_NOT_FOUND: '받는 분을 찾을 수 없습니다. 회원 ID를 확인해 주세요.',
  TRANSFER_SENDER_WALLET_UNAVAILABLE: '송금할 수 있는 지갑이 없습니다. 지갑 상태를 확인해 주세요.',
  TRANSFER_INSUFFICIENT_BALANCE: '잔액이 부족합니다. 충전 후 다시 시도해 주세요.',
}

export function toTransferMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && error.code in TRANSFER_MESSAGES) {
    return TRANSFER_MESSAGES[error.code] ?? fallback
  }
  return toUserMessage(error, fallback)
}
