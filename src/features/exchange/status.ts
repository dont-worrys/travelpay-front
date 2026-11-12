import { isApiError, toUserMessage } from '../../api'
import type { BadgeTone } from '../../components/StatusBadge'
import { CURRENCY_INFO, formatDecimalText, type Currency } from '../../lib/money'
import type {
  ExchangeFailureReason,
  ExchangeStatus,
  ExchangeType,
  ReservationCancelReason,
  ReservationCondition,
  ReservationStatus,
} from './api'

export const EXCHANGE_STATUS: Record<ExchangeStatus, { label: string; tone: BadgeTone }> = {
  PROCESSING: { label: '처리 중', tone: 'info' },
  COMPLETED: { label: '완료', tone: 'success' },
  FAILED: { label: '실패', tone: 'danger' },
  MANUAL_REVIEW: { label: '확인 중', tone: 'review' },
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

export const RESERVATION_STATUS: Record<ReservationStatus, { label: string; tone: BadgeTone }> = {
  WAITING: { label: '대기', tone: 'info' },
  EXECUTED: { label: '체결', tone: 'success' },
  CANCELED: { label: '취소', tone: 'neutral' },
  EXPIRED: { label: '만료', tone: 'neutral' },
}

export const RESERVATION_CANCEL_REASON_LABEL: Record<ReservationCancelReason, string> = {
  USER_REQUESTED: '직접 취소한 예약입니다.',
  WALLET_UNAVAILABLE: '체결할 때 지갑이나 통화 계정을 쓸 수 없어 취소되었습니다.',
  EXECUTION_REJECTED: '체결할 때 환전 조건(1회 한도 등)이 맞지 않아 취소되었습니다.',
}

/** "100엔당 830원 이하"처럼 체결 조건을 문장으로 만든다. 단위는 환율 조회와 같다. */
export function reservationConditionText(reservation: {
  fromCurrency: Currency
  toCurrency: Currency
  targetRate: string
  rateUnit: number
  condition: ReservationCondition
}): string {
  const foreign = reservation.toCurrency === 'KRW' ? reservation.fromCurrency : reservation.toCurrency
  const unit = `${reservation.rateUnit.toLocaleString('ko-KR')}${CURRENCY_INFO[foreign].unit}`
  const direction = reservation.condition === 'AT_OR_BELOW' ? '이하' : '이상'
  return `${unit}당 ${formatDecimalText(reservation.targetRate)}원 ${direction}`
}

/** "매매기준율이 …" 뒤에 붙일 체결 조건 문장. "100엔당 830원 이하로 내려가면"처럼 조사 없이 이어 쓸 수 있다. */
export function reservationTriggerText(reservation: Parameters<typeof reservationConditionText>[0]): string {
  const movement = reservation.condition === 'AT_OR_BELOW' ? '로 내려가면' : '으로 올라가면'
  return `${reservationConditionText(reservation)}${movement}`
}

/** 서버 문구(대부분 사용자용 한국어)에 상황 설명이 더 필요한 코드만 바꾼다. */
const EXCHANGE_MESSAGES: Record<string, string> = {
  EXCHANGE_INVALID_AMOUNT: '환전할 수 있는 금액 범위를 벗어났습니다.',
  EXCHANGE_INVALID_IDEMPOTENCY_KEY: '요청을 처리하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  EXCHANGE_IDEMPOTENCY_KEY_REUSED: '요청을 처리하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  EXCHANGE_WALLET_NOT_FOUND: '환전하려면 지갑이 필요합니다.',
  EXCHANGE_RESERVATION_INVALID_TARGET_RATE: '목표 환율은 0보다 크고 소수점 아래 둘째 자리까지 입력할 수 있습니다.',
  EXCHANGE_RESERVATION_INVALID_EXPIRY: '만료 기간을 다시 선택해 주세요. 기기 시계가 맞지 않으면 거절될 수 있습니다.',
  EXCHANGE_RESERVATION_NOT_FOUND: '예약을 찾을 수 없습니다.',
  EXCHANGE_RESERVATION_TOO_MANY_WAITING:
    '대기 중인 예약은 10건까지 걸어 둘 수 있습니다. 기존 예약을 취소한 뒤 다시 시도해 주세요.',
  EXCHANGE_RESERVATION_IDEMPOTENCY_KEY_REUSED: '요청을 처리하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  EXCHANGE_RESERVATION_NOT_WAITING: '이미 체결·취소·만료된 예약이라 취소할 수 없습니다.',
}

export function toExchangeMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && error.code in EXCHANGE_MESSAGES) {
    return EXCHANGE_MESSAGES[error.code] ?? fallback
  }
  return toUserMessage(error, fallback)
}
