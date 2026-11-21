import { apiRequest, isApiError, type PageResponse } from '../../api'
import type { Currency } from '../../lib/money'

/**
 * 회원 화면 알림(송금 완료). 백엔드 user-service `UserNotificationController` 기준.
 * 회원(USER)만 쓰며 MASTER는 403이다. 읽음 표시(PATCH)는 CSRF 토큰이 필요하다(`apiRequest`가 붙인다).
 */
export type NotificationType = 'TRANSFER_SENT' | 'TRANSFER_RECEIVED'

/** 알림 한 건. 문구는 프런트가 `type`·`amount`·`counterpartName`으로 만든다. */
export interface UserNotification {
  notificationId: string
  type: NotificationType
  /** 송금 상세 조회(`GET /api/v1/transfers/{transferId}`)에 쓴다. */
  transferId: string
  /** `TRANSFER_SENT`면 받는 분, `TRANSFER_RECEIVED`면 보낸 분. */
  counterpartId: string
  /** 상대방 마스킹 이름(예: 홍*동). 회원을 찾지 못하면 null. */
  counterpartName: string | null
  /** 통화 최소 단위 정수. */
  amount: number
  currency: Currency
  /** 송금 완료 시각(UTC ISO-8601). 목록은 이 값 최신순이다. */
  occurredAt: string
  read: boolean
}

export interface NotificationListQuery {
  /** 0부터. */
  page?: number
  /** 기본 20, 100을 넘으면 서버가 100으로 조회한다. */
  size?: number
}

export interface UnreadNotificationCount {
  count: number
}

/** 읽음 처리 결과. `NOT_FOUND`는 이미 삭제된(읽은 지 90일 지난) 알림이다 → 목록을 다시 조회한다. */
export type MarkReadResult = 'READ' | 'NOT_FOUND'

export const NOTIFICATION_NOT_FOUND = 'USER_NOTIFICATION_NOT_FOUND'

const BASE = '/api/v1/users/me/notifications'

/**
 * 내 알림 목록(`occurredAt` 최신순). 늦게 도착한 알림이 중간에 끼일 수 있고 읽은 알림은 삭제될 수 있어
 * `totalElements`·항목 수가 조회마다 달라질 수 있다.
 */
export function fetchNotifications(
  query: NotificationListQuery = {},
  signal?: AbortSignal,
): Promise<PageResponse<UserNotification>> {
  return apiRequest<PageResponse<UserNotification>>(BASE, {
    query: { page: query.page, size: query.size },
    signal,
  })
}

/** 읽지 않은 알림 개수. 배지 폴링 대상. */
export function fetchUnreadNotificationCount(signal?: AbortSignal): Promise<UnreadNotificationCount> {
  return apiRequest<UnreadNotificationCount>(`${BASE}/unread-count`, { signal })
}

/**
 * 알림 읽음 표시. 이미 읽은 알림도 성공이다.
 * 404 `USER_NOTIFICATION_NOT_FOUND`는 오류로 던지지 않고 `NOT_FOUND`로 돌려준다(그 사이 삭제된 알림).
 * 그 밖의 실패는 `ApiError`로 던진다.
 */
export async function markNotificationRead(notificationId: string): Promise<MarkReadResult> {
  try {
    await apiRequest<null>(`${BASE}/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH' })
    return 'READ'
  } catch (error) {
    if (isNotificationNotFound(error)) {
      return 'NOT_FOUND'
    }
    throw error
  }
}

export interface MarkAllReadResult {
  /** 이번 요청으로 읽음으로 바뀐 개수. 이미 모두 읽었으면 0. */
  updated: number
}

/** 읽지 않은 본인 알림을 모두 읽음으로 바꾼다. 다시 보내도 안전하다(이미 읽은 알림은 건너뜀). */
export function markAllNotificationsRead(): Promise<MarkAllReadResult> {
  return apiRequest<MarkAllReadResult>(`${BASE}/read-all`, { method: 'PATCH' })
}

export function isNotificationNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404 && error.code === NOTIFICATION_NOT_FOUND
}
