import { isApiError, toUserMessage } from '../../api'
import type { BadgeTone } from '../../components/StatusBadge'
import type { ExchangeFailureReason, ExchangeStatus, ExchangeType } from './api'

export const EXCHANGE_STATUS: Record<ExchangeStatus, { label: string; tone: BadgeTone }> = {
  PROCESSING: { label: '처리 중', tone: 'info' },
  COMPLETED: { label: '완료', tone: 'success' },
  FAILED: { label: '실패', tone: 'danger' },
  MANUAL_REVIEW: { label: '확인 중', tone: 'warn' },
}

export const EXCHANGE_TYPE_LABEL: Record<ExchangeType, string> = {
  EXCHANGE: '환전',
  RE_EXCHANGE: '재환전',
}

export const EXCHANGE_DESCRIPTION: Partial<Record<ExchangeStatus, string>> = {
  PROCESSING: '환전 결과를 확인하고 있습니다. 서버가 자동으로 처리하니 다시 환전하지 마세요.',
  MANUAL_REVIEW: '자동 처리가 멈춰 운영자가 확인하고 있습니다. 잔액이 두 번 빠지지 않으니 다시 환전하지 마세요.',
}

export const FAILURE_REASON_LABEL: Record<ExchangeFailureReason, string> = {
  INSUFFICIENT_BALANCE: '잔액이 부족해 환전하지 못했습니다. 잔액이 빠지지 않았습니다.',
  WALLET_SUSPENDED: '사용할 수 없는 지갑 계정이라 환전하지 못했습니다.',
  ACCOUNT_NOT_FOUND: '지갑에 해당 통화 계정이 없어 환전하지 못했습니다.',
  NOT_PROCESSED: '처리 시간이 초과되어 취소되었습니다. 잔액이 빠지지 않았습니다.',
  PROCESSING_ERROR: '처리 중 오류로 취소되었습니다.',
}

/** 서버 문구(대부분 사용자용 한국어)에 상황 설명이 더 필요한 코드만 바꾼다. */
const EXCHANGE_MESSAGES: Record<string, string> = {
  EXCHANGE_INVALID_AMOUNT: '환전할 수 있는 금액 범위를 벗어났습니다.',
  EXCHANGE_INVALID_IDEMPOTENCY_KEY: '요청을 처리하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  EXCHANGE_IDEMPOTENCY_KEY_REUSED: '요청을 처리하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  EXCHANGE_WALLET_NOT_FOUND: '환전하려면 지갑이 필요합니다.',
}

export function toExchangeMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && error.code in EXCHANGE_MESSAGES) {
    return EXCHANGE_MESSAGES[error.code] ?? fallback
  }
  return toUserMessage(error, fallback)
}
