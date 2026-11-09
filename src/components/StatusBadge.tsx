export type BadgeTone = 'success' | 'info' | 'warn' | 'danger' | 'neutral'

export function StatusBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  return <span className={`badge badge-${tone}`}>{label}</span>
}
