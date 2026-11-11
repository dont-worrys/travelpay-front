import { StatusBadge } from '../../components/StatusBadge'
import type { ExchangeStatus } from './api'
import { EXCHANGE_STATUS } from './status'

export function ExchangeStatusBadge({ status }: { status: ExchangeStatus }) {
  const { label, tone } = EXCHANGE_STATUS[status]
  return <StatusBadge label={label} tone={tone} />
}
