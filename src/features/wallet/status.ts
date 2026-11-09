import { isApiError, toUserMessage } from '../../api'
import type { BadgeTone } from '../../components/StatusBadge'
import type { ChargeStatus } from './api'

export const CHARGE_STATUS: Record<ChargeStatus, { label: string; tone: BadgeTone }> = {
  REQUESTED: { label: '처리 중', tone: 'info' },
  BANK_PROCESSING: { label: '처리 중', tone: 'info' },
  CREDIT_PROCESSING: { label: '처리 중', tone: 'info' },
  REFUND_PROCESSING: { label: '환불 중', tone: 'warn' },
  COMPLETED: { label: '완료', tone: 'success' },
  FAILED: { label: '실패', tone: 'danger' },
  REFUNDED: { label: '환불됨', tone: 'neutral' },
  MANUAL_REVIEW: { label: '확인 중', tone: 'warn' },
}

export const CHARGE_DESCRIPTION: Partial<Record<ChargeStatus, string>> = {
  REQUESTED: '충전을 접수했습니다. 은행 출금을 요청하고 있습니다.',
  BANK_PROCESSING: '은행에서 출금하고 있습니다.',
  CREDIT_PROCESSING: '출금이 끝나 지갑에 넣고 있습니다.',
  REFUND_PROCESSING: '지갑에 넣지 못해 출금한 금액을 계좌로 돌려드리고 있습니다.',
  REFUNDED: '지갑에 넣지 못해 출금한 금액을 계좌로 돌려드렸습니다.',
  MANUAL_REVIEW: '자동 처리가 멈춰 운영자가 확인하고 있습니다. 다시 충전하지 말고 기다려 주세요.',
}

/** 더 이상 바뀌지 않는 상태. */
export function isFinalCharge(status: ChargeStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'REFUNDED' || status === 'MANUAL_REVIEW'
}

/** 은행 코드 3자리. 로컬 Mock Bank 시드 계좌는 004·088·020·011에 있다. */
export const BANKS: { code: string; name: string }[] = [
  { code: '004', name: 'KB국민은행' },
  { code: '088', name: '신한은행' },
  { code: '020', name: '우리은행' },
  { code: '081', name: '하나은행' },
  { code: '011', name: 'NH농협은행' },
  { code: '003', name: 'IBK기업은행' },
  { code: '090', name: '카카오뱅크' },
  { code: '092', name: '토스뱅크' },
]

export function bankName(code: string): string {
  return BANKS.find((bank) => bank.code === code)?.name ?? `은행 ${code}`
}

const WALLET_MESSAGES: Record<string, string> = {
  WALLET_NOT_FOUND: '지갑이 없습니다. 먼저 지갑을 만들어 주세요.',
  WALLET_NOT_ACTIVE: '지금은 지갑을 사용할 수 없습니다.',
  WALLET_LEDGER_UNAVAILABLE: '잔액을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  CHARGE_INVALID_IDEMPOTENCY_KEY: '요청을 처리하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  CHARGE_IDEMPOTENCY_CONFLICT: '이전 요청과 내용이 달라 처리하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  CHARGE_CURRENCY_NOT_SUPPORTED: '원화(KRW)만 충전할 수 있습니다.',
  CHARGE_USER_NOT_ACTIVE: '지금은 충전할 수 없는 회원 상태입니다.',
}

export function toWalletMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && error.code in WALLET_MESSAGES) {
    return WALLET_MESSAGES[error.code] ?? fallback
  }
  return toUserMessage(error, fallback)
}
