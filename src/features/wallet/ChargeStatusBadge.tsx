import { StatusBadge } from '../../components/StatusBadge'
import type { ChargeStatus } from './api'
import { CHARGE_STATUS } from './status'

export function ChargeStatusBadge({ status }: { status: ChargeStatus }) {
  const { label, tone } = CHARGE_STATUS[status]
  return <StatusBadge label={label} tone={tone} />
}
