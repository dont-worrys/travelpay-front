import { StatusBadge } from '../../components/StatusBadge'
import type { ReservationStatus } from './api'
import { RESERVATION_STATUS } from './status'

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const { label, tone } = RESERVATION_STATUS[status]
  return <StatusBadge label={label} tone={tone} />
}
