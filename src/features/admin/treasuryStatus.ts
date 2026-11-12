import type { BadgeTone } from '../../components/StatusBadge'
import type { MismatchType, ReconciliationRunStatus } from './treasuryApi'

export const RUN_STATUS: Record<ReconciliationRunStatus, { label: string; tone: BadgeTone }> = {
  RUNNING: { label: '진행 중', tone: 'info' },
  COMPLETED: { label: '완료', tone: 'success' },
  PARTIAL: { label: '일부 판정 보류', tone: 'warn' },
  FAILED: { label: '실패', tone: 'danger' },
}

/** 대사 어긋남 종류(wallet-service `MismatchType` 주석 기준). */
export const MISMATCH_LABEL: Record<MismatchType, string> = {
  BANK_DEBIT_WITHOUT_CREDIT: '은행 출금됐는데 적립·환불 없음',
  CREDIT_WITHOUT_BANK_DEBIT: '적립됐는데 은행 출금 성공 없음',
  CREDIT_AND_REFUND_BOTH: '적립과 은행 환불이 모두 있음',
  AMOUNT_MISMATCH: '금액(통화) 불일치',
  STATUS_MISMATCH: '충전 상태·저장 ID 불일치',
  BANK_ORPHAN: '충전 없는 은행 거래',
  LEDGER_ORPHAN: '충전 없는 원장 거래',
  REVIEW_REQUIRED: '확인 중(MANUAL_REVIEW) 충전',
  SOURCE_UNAVAILABLE: '조회 실패로 판정 보류',
}

export function runStatusBadge(status: string): { label: string; tone: BadgeTone } {
  return RUN_STATUS[status as ReconciliationRunStatus] ?? { label: status, tone: 'neutral' }
}

/** 대사 요약 아래 안내. 어긋남에는 충전이 없는 은행·원장 거래도 들어가 대상·일치·어긋남·보류 합계가 맞지 않을 수 있다. */
export const RECONCILIATION_SUM_NOTE = '어긋남에는 충전 없는 은행·원장 거래도 포함되어 합계가 맞지 않을 수 있습니다.'
