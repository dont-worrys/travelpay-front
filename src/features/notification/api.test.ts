import { beforeEach, describe, expect, it } from 'vitest'
import { clearCsrfToken, type ApiError } from '../../api'
import { fail, mockFetch, ok } from '../../test/fetchMock'
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_NOT_FOUND,
  type UserNotification,
} from './api'

const BASE = '/api/v1/users/me/notifications'
const ID = '11111111-1111-4111-8111-111111111111'

const item: UserNotification = {
  notificationId: ID,
  type: 'TRANSFER_RECEIVED',
  transferId: '22222222-2222-4222-8222-222222222222',
  counterpartId: '33333333-3333-4333-8333-333333333333',
  counterpartName: '홍*동',
  amount: 1000,
  currency: 'KRW',
  occurredAt: '2026-11-21T03:07:48.728383Z',
  read: false,
}

beforeEach(() => {
  clearCsrfToken()
})

describe('fetchNotifications', () => {
  it('page·size를 쿼리로 보내고 페이지 응답을 그대로 돌려준다', async () => {
    const page = { items: [item], page: 1, size: 10, totalElements: 11, totalPages: 2 }
    const api = mockFetch({ [`GET ${BASE}`]: () => ok(page) })

    await expect(fetchNotifications({ page: 1, size: 10 })).resolves.toEqual(page)
    expect(api.calls('GET', BASE)[0]?.search).toBe('?page=1&size=10')
  })

  it('값을 주지 않으면 쿼리를 빼고 서버 기본값을 쓴다', async () => {
    const api = mockFetch({
      [`GET ${BASE}`]: () => ok({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
    })

    const result = await fetchNotifications()

    expect(result.totalElements).toBe(0)
    expect(api.calls('GET', BASE)[0]?.search).toBe('')
  })
})

describe('fetchUnreadNotificationCount', () => {
  it('읽지 않은 개수를 돌려준다', async () => {
    mockFetch({ [`GET ${BASE}/unread-count`]: () => ok({ count: 3 }) })

    await expect(fetchUnreadNotificationCount()).resolves.toEqual({ count: 3 })
  })

  it('MASTER 403은 ApiError로 던진다', async () => {
    mockFetch({ [`GET ${BASE}/unread-count`]: () => fail(403, 'COMMON_FORBIDDEN') })

    const error = (await fetchUnreadNotificationCount().catch((e: unknown) => e)) as ApiError
    expect(error.code).toBe('COMMON_FORBIDDEN')
  })
})

describe('markNotificationRead', () => {
  it('PATCH에 CSRF 토큰을 붙이고 본문 없이 보낸다', async () => {
    const api = mockFetch({ [`PATCH ${BASE}/${ID}/read`]: () => ok(null) })

    await expect(markNotificationRead(ID)).resolves.toBe('READ')
    const [request] = api.calls('PATCH', `${BASE}/${ID}/read`)
    expect(request?.headers['Csrf-Token']).toBe('test-csrf')
    expect(request?.body).toBeUndefined()
  })

  it('404 USER_NOTIFICATION_NOT_FOUND는 삭제된 알림으로 보고 NOT_FOUND를 돌려준다', async () => {
    mockFetch({ [`PATCH ${BASE}/${ID}/read`]: () => fail(404, NOTIFICATION_NOT_FOUND) })

    await expect(markNotificationRead(ID)).resolves.toBe('NOT_FOUND')
  })

  it('다른 코드의 404나 서버 오류는 그대로 던진다', async () => {
    mockFetch({
      [`PATCH ${BASE}/${ID}/read`]: (_request, index) =>
        index === 0 ? fail(404, 'COMMON_NOT_FOUND') : fail(500, 'COMMON_INTERNAL_ERROR'),
    })

    await expect(markNotificationRead(ID)).rejects.toMatchObject({ status: 404, code: 'COMMON_NOT_FOUND' })
    await expect(markNotificationRead(ID)).rejects.toMatchObject({ status: 500 })
  })
})

describe('markAllNotificationsRead', () => {
  it('PATCH read-all에 CSRF 토큰을 붙이고 바뀐 개수를 돌려준다', async () => {
    const api = mockFetch({ [`PATCH ${BASE}/read-all`]: () => ok({ updated: 2 }) })

    await expect(markAllNotificationsRead()).resolves.toEqual({ updated: 2 })
    const [request] = api.calls('PATCH', `${BASE}/read-all`)
    expect(request?.headers['Csrf-Token']).toBe('test-csrf')
    expect(request?.body).toBeUndefined()
  })

  it('실패는 ApiError로 던진다', async () => {
    mockFetch({ [`PATCH ${BASE}/read-all`]: () => fail(403, 'COMMON_FORBIDDEN') })

    await expect(markAllNotificationsRead()).rejects.toMatchObject({ status: 403, code: 'COMMON_FORBIDDEN' })
  })
})
