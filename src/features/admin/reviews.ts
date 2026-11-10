import { isApiError, toUserMessage, type PageResponse } from '../../api'
import { formatAmount, formatMajorAmount } from '../../lib/money'
import { EXCHANGE_STATUS, EXCHANGE_TYPE_LABEL, FAILURE_REASON_LABEL } from '../exchange/status'
import { SETTLEMENT_STATUS } from '../merchant/status'
import { PAYMENT_STATUS, REFUND_STATUS } from '../payment/status'
import {
  fetchExchangeReview,
  fetchExchangeReviews,
  fetchPaymentReview,
  fetchPaymentReviews,
  fetchRefundReview,
  fetchRefundReviews,
  fetchSettlementReview,
  fetchSettlementReviews,
  resolveExchangeReview,
  resolvePaymentReview,
  resolveRefundReview,
  resolveSettlementReview,
  type LedgerEntry,
  type ReviewLedger,
  type ReviewQuery,
} from './api'

/**
 * MANUAL_REVIEW 처리 흐름(목록 → 단건(원장 조회·예상 결과) → 처리)은 결제·환불·정산·환전이 같다.
 * 화면은 하나로 두고, 도메인별 API 형식 차이는 여기서 화면용 모양으로 바꾼다.
 * 송금은 처리 방식(미리보기 → 확정 값 대조)이 달라 이 흐름에 넣지 않는다.
 */
export type ReviewKind = 'payment' | 'refund' | 'settlement' | 'exchange'

export const REVIEW_KINDS: readonly ReviewKind[] = ['payment', 'refund', 'settlement', 'exchange']

export function isReviewKind(value: string | null | undefined): value is ReviewKind {
  return value === 'payment' || value === 'refund' || value === 'settlement' || value === 'exchange'
}

export interface ReviewField {
  label: string
  value: string
  /** ID처럼 고정폭으로 보여 줄 값. */
  code?: boolean
}

export interface ReviewRow {
  id: string
  amount: string
  summary: string
  reasonLabel: string
  attempt: string
  createdAt: string
}

export interface ReviewDetailView {
  amount: string
  reasonLabel: string
  fields: ReviewField[]
  ledgerLookupFailed: boolean
  ledger: { statusLabel: string; transactionId: string | null; declineReason: string | null } | null
  expected: { resolvable: boolean; statusLabel: string | null; description: string } | null
  /** 원장 항목 비교(환전만 내려준다). */
  entries: { expected: LedgerEntry[] | null; actual: LedgerEntry[] | null } | null
}

interface ReviewKindConfig {
  label: string
  /** 처리 대상 이름(문장용). */
  noun: string
  reasons: Record<string, string>
  list: (query: ReviewQuery, signal?: AbortSignal) => Promise<PageResponse<ReviewRow>>
  detail: (id: string, signal?: AbortSignal) => Promise<ReviewDetailView>
  /** 처리 후 결과를 화면에 보여 줄 항목으로 돌려준다. */
  resolve: (id: string, memo: string) => Promise<ReviewField[]>
}

const PAYMENT_REASONS: Record<string, string> = {
  RETRY_EXHAUSTED: '결과 확인 재시도 한도 초과',
  LEDGER_REQUEST_NOT_ACCEPTED: '원장이 요청을 받지 않음(400·409)',
}

const EXCHANGE_REASONS: Record<string, string> = {
  LEDGER_BAD_REQUEST: '원장 요청 형식 오류(400)',
  LEDGER_CONFLICT: '같은 주문의 다른 원장 거래(409)',
  LEDGER_MALFORMED_RESPONSE: '해석할 수 없는 원장 응답',
  LEDGER_UNKNOWN_REJECTION: '모르는 사유로 원장 거절',
  LEDGER_UNCONFIRMED_TOO_LONG: '24시간 넘게 결과 미확인',
}

const LEDGER_STATUS_LABEL: Record<string, string> = {
  POSTED: '반영됨',
  REJECTED: '거절됨',
  NOT_FOUND: '기록 없음',
}

const EXCHANGE_RESOLUTION_LABEL: Record<string, string> = {
  LEDGER_POSTED: '원장 반영 확인',
  LEDGER_REJECTED: '원장 거절 확인',
  LEDGER_NOT_FOUND: '원장 기록 없음',
}

function labelOf(map: Record<string, { label: string }>, value: string | null): string | null {
  if (!value) {
    return null
  }
  return map[value]?.label ?? value
}

function reasonLabel(reasons: Record<string, string>, value: string | null): string {
  if (!value) {
    return '-'
  }
  return reasons[value] ?? value
}

function ledgerView(ledger: ReviewLedger | null): ReviewDetailView['ledger'] {
  if (!ledger) {
    return null
  }
  return {
    statusLabel: LEDGER_STATUS_LABEL[ledger.status] ?? ledger.status,
    transactionId: ledger.transactionId,
    declineReason: ledger.declineReason,
  }
}

function mapPage<T>(page: PageResponse<T>, toRow: (item: T) => ReviewRow): PageResponse<ReviewRow> {
  return { ...page, items: page.items.map(toRow) }
}

function ledgerResultFields(ledgerStatus: string, ledgerTransactionId: string | null): ReviewField[] {
  const fields: ReviewField[] = [{ label: '원장 조회 결과', value: LEDGER_STATUS_LABEL[ledgerStatus] ?? ledgerStatus }]
  if (ledgerTransactionId) {
    fields.push({ label: '원장 거래 ID', value: ledgerTransactionId, code: true })
  }
  return fields
}

export const REVIEW_CONFIG: Record<ReviewKind, ReviewKindConfig> = {
  payment: {
    label: '결제',
    noun: '결제',
    reasons: PAYMENT_REASONS,
    list: (query, signal) =>
      fetchPaymentReviews(query, signal).then((page) =>
        mapPage(page, (item) => ({
          id: item.paymentId,
          amount: formatAmount(item.amount, item.currency),
          summary: `가맹점 ${item.merchantId.slice(0, 8)}`,
          reasonLabel: reasonLabel(PAYMENT_REASONS, item.reviewReason),
          attempt: `시도 ${item.attemptCount}회`,
          createdAt: item.createdAt,
        })),
      ),
    detail: (id, signal) =>
      fetchPaymentReview(id, signal).then((data) => ({
        amount: formatAmount(data.amount, data.currency),
        reasonLabel: reasonLabel(PAYMENT_REASONS, data.reviewReason),
        fields: [
          { label: '결제 ID', value: data.paymentId, code: true },
          { label: '가맹점', value: `${data.merchantName} (${data.merchantId})` },
          { label: '결제한 회원 ID', value: data.userId, code: true },
          { label: '시도 횟수', value: `${data.attemptCount}회` },
        ],
        ledgerLookupFailed: data.ledgerLookupFailed,
        ledger: ledgerView(data.ledger),
        expected: data.expected && {
          resolvable: data.expected.resolvable,
          statusLabel: labelOf(PAYMENT_STATUS, data.expected.paymentStatus),
          description: data.expected.description,
        },
        entries: null,
      })),
    resolve: (id, memo) =>
      resolvePaymentReview(id, memo).then((result) => [
        { label: '결제 상태', value: labelOf(PAYMENT_STATUS, result.paymentStatus) ?? '-' },
        ...ledgerResultFields(result.ledgerStatus, result.ledgerTransactionId),
      ]),
  },
  refund: {
    label: '환불',
    noun: '환불',
    reasons: PAYMENT_REASONS,
    list: (query, signal) =>
      fetchRefundReviews(query, signal).then((page) =>
        mapPage(page, (item) => ({
          id: item.refundId,
          amount: formatAmount(item.amount, item.currency),
          summary: `결제 ${item.paymentId.slice(0, 8)}`,
          reasonLabel: reasonLabel(PAYMENT_REASONS, item.reviewReason),
          attempt: `시도 ${item.attemptCount}회`,
          createdAt: item.createdAt,
        })),
      ),
    detail: (id, signal) =>
      fetchRefundReview(id, signal).then((data) => ({
        amount: formatAmount(data.amount, data.currency),
        reasonLabel: reasonLabel(PAYMENT_REASONS, data.reviewReason),
        fields: [
          { label: '환불 ID', value: data.refundId, code: true },
          { label: '결제 ID', value: data.paymentId, code: true },
          { label: '결제 금액', value: formatAmount(data.paymentAmount, data.currency) },
          { label: '완료된 다른 환불', value: formatAmount(data.refundedAmount, data.currency) },
          { label: '가맹점 ID', value: data.merchantId, code: true },
          { label: '결제한 고객 ID', value: data.customerUserId, code: true },
          { label: '환불 실행자 ID', value: data.requesterUserId, code: true },
          { label: '시도 횟수', value: `${data.attemptCount}회` },
        ],
        ledgerLookupFailed: data.ledgerLookupFailed,
        ledger: ledgerView(data.ledger),
        expected: data.expected && {
          resolvable: data.expected.resolvable,
          statusLabel: data.expected.status
            ? `환불 ${labelOf(REFUND_STATUS, data.expected.status)} · 결제 ${labelOf(PAYMENT_STATUS, data.expected.paymentStatus) ?? '-'}`
            : null,
          description: data.expected.description,
        },
        entries: null,
      })),
    resolve: (id, memo) =>
      resolveRefundReview(id, memo).then((result) => [
        { label: '환불 상태', value: labelOf(REFUND_STATUS, result.status) ?? '-' },
        { label: '결제 상태', value: labelOf(PAYMENT_STATUS, result.paymentStatus) ?? '-' },
        ...ledgerResultFields(result.ledgerStatus, result.ledgerTransactionId),
      ]),
  },
  settlement: {
    label: '정산',
    noun: '정산',
    reasons: PAYMENT_REASONS,
    list: (query, signal) =>
      fetchSettlementReviews(query, signal).then((page) =>
        mapPage(page, (item) => ({
          id: item.settlementId,
          amount: formatAmount(item.amount, item.currency),
          summary: `가맹점 ${item.merchantId.slice(0, 8)}`,
          reasonLabel: reasonLabel(PAYMENT_REASONS, item.reviewReason),
          attempt: `시도 ${item.attemptCount}회`,
          createdAt: item.createdAt,
        })),
      ),
    detail: (id, signal) =>
      fetchSettlementReview(id, signal).then((data) => ({
        amount: formatAmount(data.settlement.amount, data.settlement.currency),
        reasonLabel: reasonLabel(PAYMENT_REASONS, data.settlement.reviewReason),
        fields: [
          { label: '정산 ID', value: data.settlement.settlementId, code: true },
          { label: '가맹점 ID', value: data.settlement.merchantId, code: true },
          { label: '주인 회원 ID', value: data.settlement.ownerUserId, code: true },
          { label: '포함된 결제', value: `${data.paymentCount}건` },
          { label: '시도 횟수', value: `${data.settlement.attemptCount}회` },
        ],
        ledgerLookupFailed: data.ledgerLookupFailed,
        ledger: ledgerView(data.ledger),
        expected: data.expected && {
          resolvable: data.expected.resolvable,
          statusLabel: labelOf(SETTLEMENT_STATUS, data.expected.status),
          description: data.expected.description,
        },
        entries: null,
      })),
    resolve: (id, memo) =>
      resolveSettlementReview(id, memo).then((result) => {
        const fields: ReviewField[] = [{ label: '정산 상태', value: labelOf(SETTLEMENT_STATUS, result.status) ?? '-' }]
        if (result.failureReason) {
          fields.push({ label: '실패 사유', value: result.failureReason })
        }
        return [...fields, ...ledgerResultFields(result.ledgerStatus, result.ledgerTransactionId)]
      }),
  },
  exchange: {
    label: '환전',
    noun: '환전 주문',
    reasons: EXCHANGE_REASONS,
    list: (query, signal) =>
      fetchExchangeReviews(query, signal).then((page) =>
        mapPage(page, (item) => ({
          id: item.orderId,
          amount: `${formatMajorAmount(item.fromAmount, item.fromCurrency)} → ${formatMajorAmount(item.toAmount, item.toCurrency)}`,
          summary: EXCHANGE_TYPE_LABEL[item.type] ?? item.type,
          reasonLabel: reasonLabel(EXCHANGE_REASONS, item.reviewReason),
          attempt: `원장 확인 ${item.ledgerCheckCount}회`,
          createdAt: item.createdAt,
        })),
      ),
    detail: (id, signal) =>
      fetchExchangeReview(id, signal).then((data) => {
        const expected = data.expected
        let statusLabel = expected ? labelOf(EXCHANGE_STATUS, expected.toStatus) : null
        if (statusLabel && expected?.failureReason) {
          statusLabel = `${statusLabel} (${FAILURE_REASON_LABEL[expected.failureReason] ?? expected.failureReason})`
        }
        return {
          amount: `${formatMajorAmount(data.fromAmount, data.fromCurrency)} → ${formatMajorAmount(data.toAmount, data.toCurrency)}`,
          reasonLabel: reasonLabel(EXCHANGE_REASONS, data.reviewReason),
          fields: [
            { label: '주문 ID', value: data.orderId, code: true },
            { label: '종류', value: EXCHANGE_TYPE_LABEL[data.type] ?? data.type },
            { label: '수수료', value: formatMajorAmount(data.feeAmount, data.fromCurrency) },
            { label: '총 차감액', value: formatMajorAmount(data.totalDebitAmount, data.fromCurrency) },
            { label: '적용 환율', value: `${data.appliedRate} (${data.rateUnit} 단위)` },
            { label: '회원 ID', value: data.userId, code: true },
            { label: '지갑 ID', value: data.walletId, code: true },
            { label: '원장 확인 횟수', value: `${data.ledgerCheckCount}회` },
          ],
          ledgerLookupFailed: data.ledgerLookupFailed,
          ledger: data.ledger && {
            statusLabel: LEDGER_STATUS_LABEL[data.ledger.status] ?? data.ledger.status,
            transactionId: data.ledger.transactionId,
            declineReason: data.ledger.rejectReason,
          },
          expected: expected && {
            resolvable: expected.resolvable,
            statusLabel,
            description: expected.description,
          },
          entries:
            expected && (expected.expectedEntries || expected.actualEntries)
              ? { expected: expected.expectedEntries, actual: expected.actualEntries }
              : null,
        }
      }),
    resolve: (id, memo) =>
      resolveExchangeReview(id, memo).then((result) => {
        const fields: ReviewField[] = [
          { label: '주문 상태', value: labelOf(EXCHANGE_STATUS, result.status) ?? '-' },
          { label: '처리 근거', value: EXCHANGE_RESOLUTION_LABEL[result.reason] ?? result.reason },
        ]
        if (result.failureReason) {
          fields.push({ label: '실패 사유', value: FAILURE_REASON_LABEL[result.failureReason] ?? result.failureReason })
        }
        if (result.ledgerTransactionId) {
          fields.push({ label: '원장 거래 ID', value: result.ledgerTransactionId, code: true })
        }
        return fields
      }),
  },
}

/** 관리자 화면 오류 문구. 서버 문구가 기술적이거나 다음 행동 안내가 필요한 것만 바꾼다. */
const ADMIN_MESSAGES: Record<string, string> = {
  COMMON_FORBIDDEN: '관리자만 사용할 수 있습니다.',
  PAYMENT_NOT_MANUAL_REVIEW: '이미 처리됐거나 처리 대상이 아닙니다. 목록을 새로고침해 주세요.',
  EXCHANGE_NOT_MANUAL_REVIEW: '이미 처리됐거나 처리 대상이 아닙니다. 목록을 새로고침해 주세요.',
  PAYMENT_LEDGER_CORRECTION_REQUIRED: '원장 거래 내용이 기록과 달라 처리하지 않았습니다. 원장 보정과 원인 조사가 필요합니다.',
  EXCHANGE_LEDGER_CORRECTION_REQUIRED: '원장 거래 내용이 주문과 달라 처리하지 않았습니다. 원장 보정과 원인 조사가 필요합니다.',
  PAYMENT_LEDGER_LOOKUP_UNAVAILABLE: '원장 결과를 확인하지 못해 처리하지 않았습니다(상태 그대로). 잠시 후 다시 시도해 주세요.',
  EXCHANGE_LEDGER_LOOKUP_UNAVAILABLE: '원장 결과를 확인하지 못해 처리하지 않았습니다(상태 그대로). 잠시 후 다시 시도해 주세요.',
  PAYMENT_NOT_FOUND: '결제를 찾을 수 없습니다.',
  PAYMENT_REFUND_NOT_FOUND: '환불을 찾을 수 없습니다.',
  PAYMENT_SETTLEMENT_NOT_FOUND: '정산을 찾을 수 없습니다.',
  EXCHANGE_ORDER_NOT_FOUND: '환전 주문을 찾을 수 없습니다.',
  PAYMENT_MERCHANT_OWNER_NOT_FOUND: '주인으로 지정할 활성 회원을 찾을 수 없습니다. 회원 ID를 확인해 주세요.',
  PAYMENT_MERCHANT_NOT_FOUND: '가맹점을 찾을 수 없습니다.',
}

/** 서버가 처리하지 않았다고 확정해 준 503(원장 조회 실패). 결과 모름과 구분한다. */
export function isLedgerLookupUnavailable(error: unknown): boolean {
  return (
    isApiError(error) &&
    (error.code === 'PAYMENT_LEDGER_LOOKUP_UNAVAILABLE' || error.code === 'EXCHANGE_LEDGER_LOOKUP_UNAVAILABLE')
  )
}

export function toAdminMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    const message = ADMIN_MESSAGES[error.code]
    if (message) {
      return message
    }
  }
  return toUserMessage(error, fallback)
}
