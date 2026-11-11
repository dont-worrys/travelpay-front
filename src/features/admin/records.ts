import type { PageResponse } from '../../api'
import { EXCHANGE_STATUS, FAILURE_REASON_LABEL } from '../exchange/status'
import { SETTLEMENT_STATUS } from '../merchant/status'
import { PAYMENT_STATUS, REFUND_STATUS } from '../payment/status'
import {
  fetchExchangeResolutions,
  fetchPaymentResolutions,
  fetchSettlementResolutions,
  type ExchangeResolutionRecord,
  type PaymentResolutionRecord,
  type SettlementResolutionRecord,
} from './api'
import {
  EXCHANGE_REASONS,
  EXCHANGE_RESOLUTION_LABEL,
  LEDGER_STATUS_LABEL,
  PAYMENT_REASONS,
  labelOf,
  type RecordDomain,
  type ReviewField,
} from './reviews'

/**
 * 처리 기록(결제·환불, 정산, 환전). 도메인마다 API·필드 이름이 달라 화면용 한 모양으로 바꾼다.
 * 송금 확정 이력은 송금 상세에, 충전 보정 결과는 보정 화면에 있어 여기에 넣지 않는다.
 */
export const RECORD_DOMAINS: readonly RecordDomain[] = ['payment', 'settlement', 'exchange']

export const RECORD_DOMAIN_LABEL: Record<RecordDomain, string> = {
  payment: '결제·환불',
  settlement: '정산',
  exchange: '환전',
}

/** 대상 ID 필터 이름(화면 문구). */
export const RECORD_TARGET_LABEL: Record<RecordDomain, string> = {
  payment: '결제 ID',
  settlement: '정산 ID',
  exchange: '주문 ID',
}

export function isRecordDomain(value: string | null | undefined): value is RecordDomain {
  return value === 'payment' || value === 'settlement' || value === 'exchange'
}

export type PaymentRecordType = 'PAYMENT' | 'REFUND'

export interface RecordQuery {
  /** 결제·환불만. */
  type?: PaymentRecordType
  actorId?: string
  /** 결제 ID(그 결제의 환불 포함)·정산 ID·주문 ID. */
  targetId?: string
  page?: number
  size?: number
}

export interface RecordRow {
  id: string
  /** 처리 기록 상세 화면에서 모으는 기준 ID. */
  targetId: string
  /** "결제", "환불", "정산", "환전 주문". */
  kindLabel: string
  /** 처리한 대상 ID(환불이면 환불 ID). */
  subjectId: string
  resultLabel: string
  actorId: string
  processedAt: string
  /** 상세 화면에 보여 줄 전체 항목. */
  fields: ReviewField[]
}

function reason(map: Record<string, string>, value: string | null): string {
  if (!value) {
    return '-'
  }
  return map[value] ?? value
}

function optional(label: string, value: string | null, code = false): ReviewField[] {
  return value ? [{ label, value, code }] : []
}

function paymentRow(item: PaymentResolutionRecord): RecordRow {
  const isRefund = item.refundId !== null
  const resultLabel = (isRefund ? labelOf(REFUND_STATUS, item.toStatus) : labelOf(PAYMENT_STATUS, item.toStatus)) ?? '-'
  return {
    id: item.resolutionId,
    targetId: item.paymentId,
    kindLabel: isRefund ? '환불' : '결제',
    subjectId: item.refundId ?? item.paymentId,
    resultLabel,
    actorId: item.actorId,
    processedAt: item.createdAt,
    fields: [
      { label: '처리 결과', value: resultLabel },
      { label: '처리 담당자 ID', value: item.actorId, code: true },
      ...optional('환불 ID', item.refundId, true),
      { label: '결제 ID', value: item.paymentId, code: true },
      { label: '멈췄던 사유', value: reason(PAYMENT_REASONS, item.reviewReason) },
      { label: '원장 조회 결과', value: LEDGER_STATUS_LABEL[item.ledgerStatus] ?? item.ledgerStatus },
      ...optional('원장 거래 ID', item.ledgerTransactionId, true),
      { label: '처리 설명', value: item.description },
      ...optional('운영 메모', item.memo),
    ],
  }
}

function settlementRow(item: SettlementResolutionRecord): RecordRow {
  const resultLabel = labelOf(SETTLEMENT_STATUS, item.toStatus) ?? '-'
  return {
    id: item.resolutionId,
    targetId: item.settlementId,
    kindLabel: '정산',
    subjectId: item.settlementId,
    resultLabel,
    actorId: item.actorId,
    processedAt: item.createdAt,
    fields: [
      { label: '처리 결과', value: resultLabel },
      { label: '처리 담당자 ID', value: item.actorId, code: true },
      { label: '정산 ID', value: item.settlementId, code: true },
      { label: '멈췄던 사유', value: reason(PAYMENT_REASONS, item.reviewReason) },
      { label: '원장 조회 결과', value: LEDGER_STATUS_LABEL[item.ledgerStatus] ?? item.ledgerStatus },
      ...optional('원장 거래 ID', item.ledgerTransactionId, true),
      { label: '처리 설명', value: item.description },
      ...optional('운영 메모', item.memo),
    ],
  }
}

function exchangeRow(item: ExchangeResolutionRecord): RecordRow {
  let resultLabel = labelOf(EXCHANGE_STATUS, item.toStatus) ?? '-'
  if (item.failureReason) {
    const failure = (FAILURE_REASON_LABEL as Record<string, string>)[item.failureReason] ?? item.failureReason
    resultLabel = `${resultLabel} (${failure})`
  }
  return {
    id: item.historyId,
    targetId: item.orderId,
    kindLabel: '환전 주문',
    subjectId: item.orderId,
    resultLabel,
    actorId: item.actorId,
    processedAt: item.resolvedAt,
    fields: [
      { label: '처리 결과', value: resultLabel },
      { label: '처리 담당자 ID', value: item.actorId, code: true },
      { label: '주문 ID', value: item.orderId, code: true },
      { label: '이전 상태', value: labelOf(EXCHANGE_STATUS, item.fromStatus) ?? '-' },
      { label: '처리 근거', value: EXCHANGE_RESOLUTION_LABEL[item.resolutionReason] ?? item.resolutionReason },
      { label: '멈췄던 사유', value: reason(EXCHANGE_REASONS, item.reviewReason) },
      ...optional('원장 거래 ID', item.ledgerTransactionId, true),
      ...optional('운영 메모', item.memo),
    ],
  }
}

function mapPage<T>(page: PageResponse<T>, toRow: (item: T) => RecordRow): PageResponse<RecordRow> {
  return { ...page, items: page.items.map(toRow) }
}

/** 처리 기록 목록(최신순). 필터는 도메인별 API 파라미터로 바꿔 보낸다. */
export function fetchRecords(
  domain: RecordDomain,
  query: RecordQuery,
  signal?: AbortSignal,
): Promise<PageResponse<RecordRow>> {
  const common = { actorId: query.actorId, page: query.page, size: query.size }
  switch (domain) {
    case 'payment':
      return fetchPaymentResolutions({ ...common, type: query.type, paymentId: query.targetId }, signal).then((page) =>
        mapPage(page, paymentRow),
      )
    case 'settlement':
      return fetchSettlementResolutions({ ...common, settlementId: query.targetId }, signal).then((page) =>
        mapPage(page, settlementRow),
      )
    case 'exchange':
      return fetchExchangeResolutions({ ...common, orderId: query.targetId }, signal).then((page) =>
        mapPage(page, exchangeRow),
      )
  }
}
