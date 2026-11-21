import { formatAmount } from '../../lib/money'
import type { UserNotification } from './api'

/**
 * 알림 문구. 서버는 문구를 주지 않아 `type`·금액·상대방 이름으로 만든다.
 * 통화 단위(원·엔·위안)가 모두 받침으로 끝나 조사는 "을"로 고정한다.
 */
export function notificationMessage(item: UserNotification): string {
  const who = item.counterpartName ? `${item.counterpartName}님` : '알 수 없는 회원'
  const amount = formatAmount(item.amount, item.currency)
  return item.type === 'TRANSFER_RECEIVED' ? `${who}이 ${amount}을 보냈어요` : `${who}에게 ${amount}을 보냈어요`
}
