import { StatusBadge, type BadgeTone } from '../../components/StatusBadge'
import type { TransferStatus } from './api'
import { STATUS_LABEL } from './status'

const TONE: Record<TransferStatus, BadgeTone> = {
  REQUESTED: 'info',
  PROCESSING: 'info',
  COMPLETED: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  MANUAL_REVIEW: 'review',
}

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  return <StatusBadge label={STATUS_LABEL[status]} tone={TONE[status]} />
}
