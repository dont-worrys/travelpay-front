import { StatusBadge } from '../../components/StatusBadge'
import type { PaymentStatus, RefundStatus } from './api'
import { PAYMENT_STATUS, REFUND_STATUS } from './status'

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { label, tone } = PAYMENT_STATUS[status]
  return <StatusBadge label={label} tone={tone} />
}

export function RefundStatusBadge({ status }: { status: RefundStatus }) {
  const { label, tone } = REFUND_STATUS[status]
  return <StatusBadge label={label} tone={tone} />
}
