import { Link, useLocation } from 'react-router'
import { Icon } from '../../components/Icon'
import { useUnreadNotifications } from './NotificationProvider'

/** 배지에 그대로 보여 줄 최대 개수. 넘으면 "99+". */
const BADGE_MAX = 99

/** 헤더 알림 아이콘. 읽지 않은 알림이 있으면 개수 배지를 붙인다. */
export function NotificationBell() {
  const { unreadCount } = useUnreadNotifications()
  const { pathname } = useLocation()
  const active = pathname === '/notifications'
  const count = unreadCount ?? 0
  const label = count > 0 ? `알림, 읽지 않은 알림 ${count}개` : '알림'
  return (
    <Link
      to="/notifications"
      className="app-bell"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <Icon name="bell" />
      {count > 0 && (
        <span className="app-bell-badge" aria-hidden="true">
          {count > BADGE_MAX ? `${BADGE_MAX}+` : count}
        </span>
      )}
    </Link>
  )
}
