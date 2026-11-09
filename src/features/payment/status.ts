import { isApiError, toUserMessage } from '../../api'
import type { BadgeTone } from '../../components/StatusBadge'
import type { PaymentStatus, RefundRequestResult, RefundStatus } from './api'

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: '처리 중', tone: 'info' },
  APPROVED: { label: '결제 완료', tone: 'success' },
  DECLINED: { label: '거절', tone: 'danger' },
  REFUND_REQUESTED: { label: '환불 신청', tone: 'warn' },
  REFUND_PENDING: { label: '환불 중', tone: 'info' },
  REFUNDED: { label: '환불 완료', tone: 'neutral' },
  MANUAL_REVIEW: { label: '확인 중', tone: 'warn' },
}

export const REFUND_STATUS: Record<RefundStatus, { label: string; tone: BadgeTone }> = {
  REQUESTED: { label: '처리 중', tone: 'info' },
  COMPLETED: { label: '완료', tone: 'success' },
  DECLINED: { label: '거절', tone: 'danger' },
  MANUAL_REVIEW: { label: '확인 중', tone: 'warn' },
}

export const REFUND_REQUEST_LABEL: Record<RefundRequestResult, string> = {
  REQUESTED: '가맹점 처리 대기',
  CANCELLED: '신청 취소',
  REJECTED: '가맹점 거절',
  ACCEPTED: '가맹점 환불 실행',
}

/** 화면에 상태와 함께 보여 줄 안내. */
export const PAYMENT_DESCRIPTION: Partial<Record<PaymentStatus, string>> = {
  PENDING: '결제 결과를 확인하고 있습니다. 서버가 자동으로 처리하니 다시 결제하지 마세요.',
  MANUAL_REVIEW: '자동 처리가 멈춰 운영자가 확인하고 있습니다. 잔액이 두 번 빠지지 않으니 다시 결제하지 마세요.',
  DECLINED: '결제가 거절되었습니다. 잔액이 빠지지 않았습니다.',
  REFUND_REQUESTED: '환불을 신청했습니다. 가맹점이 환불 금액을 정해 처리합니다.',
  REFUND_PENDING: '가맹점이 환불을 실행해 처리하고 있습니다.',
  REFUNDED: '결제 금액 전부를 환불받았습니다.',
}

/** 서버가 자동으로 다시 처리해 곧 바뀔 수 있는 상태. 상세 화면에서 다시 조회한다. */
export function isProcessingPayment(status: PaymentStatus): boolean {
  return status === 'PENDING' || status === 'REFUND_PENDING'
}

/** 서버 문구가 기술적이거나 상황 설명이 더 필요한 결제 오류만 바꾼다. */
const PAYMENT_MESSAGES: Record<string, string> = {
  PAYMENT_IDEMPOTENCY_KEY_REUSED: '이전 요청과 내용이 달라 처리하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  PAYMENT_MERCHANT_NOT_FOUND: '가맹점을 찾을 수 없습니다. 가맹점 ID를 확인해 주세요.',
  PAYMENT_MERCHANT_NOT_ACTIVE: '지금 결제를 받을 수 없는 가맹점입니다.',
  PAYMENT_CURRENCY_MISMATCH: '가맹점이 받는 통화와 다릅니다. 통화를 확인해 주세요.',
  PAYMENT_WALLET_NOT_FOUND: '결제할 지갑이 없습니다. 먼저 지갑을 만들어 주세요.',
  PAYMENT_WALLET_NOT_ACTIVE: '결제할 수 있는 지갑이 아닙니다. 지갑 상태를 확인해 주세요.',
  PAYMENT_REFUND_PERIOD_EXPIRED: '결제 승인 후 3일이 지나 환불을 신청할 수 없습니다.',
  PAYMENT_REFUND_IN_PROGRESS: '가맹점이 이미 환불을 처리하고 있습니다.',
  PAYMENT_ALREADY_REFUNDED: '이미 전액 환불된 결제입니다.',
  PAYMENT_NOT_REFUNDABLE: '지금은 환불을 신청할 수 없는 결제입니다.',
  PAYMENT_REFUND_NOT_REQUESTED: '환불 신청 중인 결제가 아닙니다.',
  COMMON_CONFLICT: '다른 요청이 먼저 처리되었습니다. 화면을 새로고침해 주세요.',
}

export function toPaymentMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    if (error.code === 'PAYMENT_DECLINED') {
      const reason = error.fieldMessages().declineReason
      return reason ? `결제가 거절되었습니다. ${reason}` : '결제가 거절되었습니다.'
    }
    if (error.code in PAYMENT_MESSAGES) {
      return PAYMENT_MESSAGES[error.code] ?? fallback
    }
  }
  return toUserMessage(error, fallback)
}
