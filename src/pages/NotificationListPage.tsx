import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toUserMessage, type PageResponse } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { fetchNotifications, markNotificationRead, type UserNotification } from '../features/notification/api'
import { notificationMessage } from '../features/notification/message'
import { useUnreadNotifications } from '../features/notification/NotificationProvider'
import { formatDateTime } from '../lib/datetime'

const PAGE_SIZE = 20

/** 서버도 `occurredAt` 최신순으로 주지만, 한 페이지 안의 순서를 화면에서도 같은 기준으로 맞춘다. */
function newestFirst(items: UserNotification[]): UserNotification[] {
  return [...items].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
}

/**
 * 알림 목록(송금 완료). 항목을 누르면 읽음 처리한 뒤 송금 상세로 간다(이미 읽은 알림은 바로 이동).
 * 그 사이 삭제된 알림(404 `USER_NOTIFICATION_NOT_FOUND`)이면 오류 화면 대신 목록·개수를 다시 조회한다.
 * 송금이 있는지는 알림이 아니라 송금 상세 API가 판단한다(상세 화면이 조회).
 * 읽지 않은 개수가 늘면 새 알림을 맨 위에 끼우지 않고 첫 페이지를 다시 조회한다.
 * 늦게 도착한 알림은 `occurredAt` 순서상 목록 중간에 들어갈 수 있기 때문이다(백엔드 안내).
 * 다른 페이지를 보는 중이면 그 페이지는 그대로 두고, 첫 페이지로 돌아오면 새로 조회한다.
 */
export function NotificationListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(0, Number.parseInt(searchParams.get('page') ?? '0', 10) || 0)
  const navigate = useNavigate()
  const { unreadCount, reloadUnreadCount } = useUnreadNotifications()

  const [result, setResult] = useState<PageResponse<UserNotification> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const lastCount = useRef(unreadCount)
  /** 읽음 처리 중인 알림. 처리 중에는 다른 항목을 눌러도 무시한다(두 번 누름 방지). */
  const [opening, setOpening] = useState<string | null>(null)
  const openingRef = useRef(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [removedNotice, setRemovedNotice] = useState(false)

  // 읽지 않은 개수가 늘면 첫 페이지를 다시 조회한다(보던 목록은 새 응답이 올 때까지 둔다).
  useEffect(() => {
    const previous = lastCount.current
    lastCount.current = unreadCount
    if (page === 0 && previous !== null && unreadCount !== null && unreadCount > previous) {
      setReloadKey((key) => key + 1)
    }
  }, [unreadCount, page])

  // 페이지가 바뀌면 이전 페이지 목록을 지우고 새로 불러온다.
  useEffect(() => {
    setResult(null)
    setError(null)
    setActionError(null)
    setRemovedNotice(false)
  }, [page])

  useEffect(() => {
    const controller = new AbortController()
    fetchNotifications({ page, size: PAGE_SIZE }, controller.signal)
      .then((next) => {
        setResult(next)
        setError(null)
      })
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(toUserMessage(cause, '알림을 불러오지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [page, reloadKey])

  async function openNotification(event: MouseEvent<HTMLAnchorElement>, item: UserNotification) {
    const detailPath = `/transfers/${item.transferId}`
    // 새 탭·창으로 여는 누름은 브라우저에 맡긴다(읽음 처리 없이 상세만 열림).
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return
    }
    event.preventDefault()
    if (openingRef.current) {
      return
    }
    if (item.read) {
      navigate(detailPath)
      return
    }
    openingRef.current = true
    setOpening(item.notificationId)
    setActionError(null)
    setRemovedNotice(false)
    try {
      const outcome = await markNotificationRead(item.notificationId)
      reloadUnreadCount()
      if (outcome === 'NOT_FOUND') {
        setRemovedNotice(true)
        setReloadKey((key) => key + 1)
        return
      }
      navigate(detailPath)
    } catch (cause) {
      setActionError(toUserMessage(cause, '알림을 읽음으로 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.'))
    } finally {
      openingRef.current = false
      setOpening(null)
    }
  }

  function go(nextPage: number) {
    setSearchParams(nextPage > 0 ? { page: String(nextPage) } : {})
  }

  return (
    <section>
      <div className="title-row">
        <h1>알림</h1>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}
      {removedNotice && <p className="hint">삭제된 알림이라 목록을 새로 불러왔습니다.</p>}
      {!result && !error && <p className="loading">불러오는 중입니다…</p>}
      {result && result.items.length === 0 && <p className="hint empty">알림이 없습니다.</p>}

      {result && result.items.length > 0 && (
        <ul className="item-list">
          {newestFirst(result.items).map((item) => (
            <li key={item.notificationId}>
              <Link
                to={`/transfers/${item.transferId}`}
                className="item"
                aria-busy={opening === item.notificationId || undefined}
                onClick={(event) => void openNotification(event, item)}
              >
                <span className="item-main">
                  <span>{notificationMessage(item)}</span>
                  {!item.read && <StatusBadge label="새 알림" tone="info" />}
                </span>
                <span className="item-sub">
                  <span className="hint">{formatDateTime(item.occurredAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result && result.totalPages > 1 && (
        <div className="pagination">
          <button type="button" className="secondary" disabled={page <= 0} onClick={() => go(page - 1)}>
            이전
          </button>
          <span>
            {result.page + 1} / {result.totalPages}
          </span>
          <button type="button" className="secondary" disabled={page + 1 >= result.totalPages} onClick={() => go(page + 1)}>
            다음
          </button>
        </div>
      )}
    </section>
  )
}
