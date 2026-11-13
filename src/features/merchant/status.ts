import { isApiError } from '../../api'
import type { BadgeTone } from '../../components/StatusBadge'
import { toPaymentMessage } from '../payment/status'
import type { Settlement, SettlementStatus } from './api'

export const SETTLEMENT_STATUS: Record<SettlementStatus, { label: string; tone: BadgeTone }> = {
  REQUESTED: { label: '처리 중', tone: 'info' },
  PAID: { label: '입금 완료', tone: 'success' },
  FAILED: { label: '실패', tone: 'danger' },
  MANUAL_REVIEW: { label: '확인 중', tone: 'review' },
}

export const SETTLEMENT_DESCRIPTION: Partial<Record<SettlementStatus, string>> = {
  REQUESTED: '정산 결과를 확인하고 있습니다. 서버가 자동으로 처리하니 다시 요청하지 마세요.',
  PAID: '주인 회원 지갑으로 입금했습니다. 포함된 결제는 더 이상 환불할 수 없습니다.',
  FAILED: '정산이 거절되었습니다. 포함됐던 결제는 다음 정산 요청 때 다시 정산됩니다.',
  MANUAL_REVIEW: '자동 처리가 멈춰 운영자가 확인하고 있습니다. 같은 결제가 두 번 정산되지 않으니 기다려 주세요.',
}

/** 정산 입금 내역의 가맹점 표시. 이름이 없는 응답(백엔드 #320 배포 전)은 가맹점 ID 앞 8자리. */
export function settlementMerchantLabel(settlement: Settlement): string {
  return settlement.merchantName || `가맹점 ${settlement.merchantId.slice(0, 8)}`
}

/** 입금 시각. `PAID`인데 `paidAt`이 비어 있으면(필드 추가 전 서버) 마지막 변경 시각으로 대신한다. */
export function settlementPaidTime(settlement: Settlement): string {
  return settlement.paidAt ?? settlement.updatedAt
}

/** 가맹점 주인 화면에서 문구를 바꿀 오류. 나머지는 결제 화면 문구를 따른다. */
const MERCHANT_MESSAGES: Record<string, string> = {
  PAYMENT_MERCHANT_NOT_FOUND: '가맹점을 찾을 수 없습니다. 내가 주인인 가맹점의 ID인지 확인해 주세요.',
  PAYMENT_MERCHANT_NOT_ACTIVE: '가맹점 준비가 끝나지 않았습니다. 관리자에게 문의해 주세요.',
  PAYMENT_NOT_FOUND: '결제를 찾을 수 없습니다.',
  PAYMENT_REFUND_IDEMPOTENCY_KEY_REUSED: '이전 요청과 금액이 달라 처리하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  PAYMENT_REFUND_AMOUNT_EXCEEDED: '환불 금액이 남은 결제 금액보다 큽니다.',
  PAYMENT_ALREADY_SETTLED: '이미 정산에 들어간 결제라 환불할 수 없습니다.',
  PAYMENT_REFUND_IN_PROGRESS: '다른 환불이 처리 중입니다. 잠시 후 다시 확인해 주세요.',
  PAYMENT_REFUND_NOT_REQUESTED: '고객이 환불을 신청한 결제가 아닙니다. 고객이 신청을 취소했을 수 있습니다.',
  PAYMENT_SETTLEMENT_NOT_FOUND: '정산을 찾을 수 없습니다.',
  PAYMENT_SETTLEMENT_IDEMPOTENCY_KEY_REUSED: '요청을 처리하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  PAYMENT_SETTLEMENT_WALLET_NOT_AVAILABLE: '정산 받을 지갑이 없거나 사용할 수 없습니다. 내 지갑 화면에서 지갑을 만들거나 상태를 확인한 뒤 다시 요청해 주세요.',
  PAYMENT_NO_SETTLEMENT_TARGET: '지금 정산할 결제가 없습니다.',
}

const DECLINED_MESSAGES: Record<string, string> = {
  PAYMENT_REFUND_DECLINED: '환불이 거절되었습니다.',
  PAYMENT_SETTLEMENT_DECLINED: '정산이 거절되었습니다.',
}

export function toMerchantMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    const declined = DECLINED_MESSAGES[error.code]
    if (declined) {
      const reason = error.fieldMessages().declineReason
      return reason ? `${declined} ${reason}` : declined
    }
    const message = MERCHANT_MESSAGES[error.code]
    if (message) {
      return message
    }
  }
  return toPaymentMessage(error, fallback)
}
