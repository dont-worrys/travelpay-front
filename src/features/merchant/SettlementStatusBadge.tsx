import { StatusBadge } from '../../components/StatusBadge'
import type { SettlementStatus } from './api'
import { SETTLEMENT_STATUS } from './status'

export function SettlementStatusBadge({ status }: { status: SettlementStatus }) {
  const { label, tone } = SETTLEMENT_STATUS[status]
  return <StatusBadge label={label} tone={tone} />
}
