/** 상태 계열. 화면별 상태 매핑 객체는 이 값만 고른다. */
export type BadgeTone = 'success' | 'info' | 'warn' | 'danger' | 'neutral' | 'review'

/**
 * 계열 → 표준 배지 클래스(docs/convention/style.md 2-2): 완료 emerald, 처리 중·대기 amber, 실패 rose,
 * 확인 중(MANUAL_REVIEW) indigo, 그 밖 회색.
 */
const TONE_CLASS: Record<BadgeTone, string> = {
  success: 'badge-completed',
  info: 'badge-processing',
  warn: 'badge-processing',
  danger: 'badge-failed',
  review: 'badge-manual',
  neutral: 'badge-neutral',
}

/** 색만으로 구분하지 않도록 항상 글자 라벨을 함께 보여 준다. */
export function StatusBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  return <span className={`badge ${TONE_CLASS[tone]}`}>{label}</span>
}
