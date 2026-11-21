import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotificationProvider, UNREAD_COUNT_INTERVAL_MS } from '../features/notification/NotificationProvider'
import { fail, mockFetch, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { NotificationListPage } from './NotificationListPage'

const LIST_PATH = '/api/v1/users/me/notifications'
const COUNT_PATH = '/api/v1/users/me/notifications/unread-count'

function notification(id: string, overrides: Record<string, unknown> = {}) {
  return {
    notificationId: id,
    type: 'TRANSFER_RECEIVED',
    transferId: `t-${id}`,
    counterpartId: `c-${id}`,
    counterpartName: '홍*동',
    amount: 1000,
    currency: 'KRW',
    occurredAt: '2026-11-21T03:00:00Z',
    read: false,
    ...overrides,
  }
}

function page(items: unknown[], pageNumber = 0, totalPages = 1) {
  return { items, page: pageNumber, size: 20, totalElements: items.length, totalPages }
}

function renderPage(entry = '/notifications') {
  return renderRoute(
    '/notifications',
    <NotificationProvider enabled>
      <NotificationListPage />
    </NotificationProvider>,
    entry,
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('NotificationListPage', () => {
  it('알림 문구를 만들고 occurredAt 최신순으로 보여 주며, 읽지 않은 알림에 표시를 붙인다', async () => {
    mockFetch({
      [`GET ${COUNT_PATH}`]: () => ok({ count: 1 }),
      [`GET ${LIST_PATH}`]: () =>
        ok(
          page([
            notification('n1', { type: 'TRANSFER_SENT', counterpartName: '김*수', amount: 5000, occurredAt: '2026-11-20T01:00:00Z', read: true }),
            notification('n2', { occurredAt: '2026-11-21T03:00:00Z' }),
            notification('n3', { counterpartName: null, currency: 'JPY', amount: 300, occurredAt: '2026-11-19T01:00:00Z', read: true }),
          ]),
        ),
    })
    renderPage()

    const items = within(await screen.findByRole('list')).getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('.item-main > span')?.textContent)).toEqual([
      '홍*동님이 1,000원을 보냈어요',
      '김*수님에게 5,000원을 보냈어요',
      '알 수 없는 회원이 300엔을 보냈어요',
    ])
    expect(within(items[0]!).getByText('새 알림')).toBeInTheDocument()
    expect(within(items[1]!).queryByText('새 알림')).not.toBeInTheDocument()
    expect(items[0]).toHaveTextContent('2026. 11. 21. 12:00')
  })

  it('알림이 없으면 빈 화면 문구를 보여 준다', async () => {
    mockFetch({
      [`GET ${COUNT_PATH}`]: () => ok({ count: 0 }),
      [`GET ${LIST_PATH}`]: () => ok(page([])),
    })
    renderPage()

    expect(await screen.findByText('알림이 없습니다.')).toBeInTheDocument()
  })

  it('페이지를 넘기면 page 쿼리로 다음 페이지를 조회한다', async () => {
    const api = mockFetch({
      [`GET ${COUNT_PATH}`]: () => ok({ count: 0 }),
      [`GET ${LIST_PATH}`]: (request) =>
        request.search.includes('page=1')
          ? ok(page([notification('n21', { read: true })], 1, 2))
          : ok(page([notification('n1', { read: true })], 0, 2)),
    })
    renderPage()

    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByText('2 / 2')).toBeInTheDocument()
    expect(api.calls('GET', LIST_PATH).map((call) => call.search)).toEqual(['?page=0&size=20', '?page=1&size=20'])
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
  })

  it('읽지 않은 개수가 늘면 첫 페이지를 다시 조회한다(새 알림을 임의로 끼우지 않음)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const api = mockFetch({
      [`GET ${COUNT_PATH}`]: (_request, index) => ok({ count: index === 0 ? 1 : 2 }),
      [`GET ${LIST_PATH}`]: (_request, index) =>
        ok(
          page(
            index === 0
              ? [notification('n1')]
              : [notification('n2', { counterpartName: '이*나', occurredAt: '2026-11-21T04:00:00Z' }), notification('n1')],
          ),
        ),
    })
    renderPage()

    expect(await screen.findByText('홍*동님이 1,000원을 보냈어요')).toBeInTheDocument()
    expect(api.calls('GET', LIST_PATH)).toHaveLength(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNREAD_COUNT_INTERVAL_MS)
    })

    expect(await screen.findByText('이*나님이 1,000원을 보냈어요')).toBeInTheDocument()
    const calls = api.calls('GET', LIST_PATH)
    expect(calls).toHaveLength(2)
    expect(calls[1]?.search).toBe('?page=0&size=20')
  })

  it('개수가 그대로면 목록을 다시 조회하지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const api = mockFetch({
      [`GET ${COUNT_PATH}`]: () => ok({ count: 1 }),
      [`GET ${LIST_PATH}`]: () => ok(page([notification('n1')])),
    })
    renderPage()

    expect(await screen.findByText('홍*동님이 1,000원을 보냈어요')).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNREAD_COUNT_INTERVAL_MS)
    })

    expect(api.calls('GET', COUNT_PATH)).toHaveLength(2)
    expect(api.calls('GET', LIST_PATH)).toHaveLength(1)
  })
})

describe('NotificationListPage 알림 누르기', () => {
  it('읽지 않은 알림을 누르면 읽음 처리하고 헤더 개수를 다시 조회한 뒤 송금 상세로 간다', async () => {
    const api = mockFetch({
      [`GET ${COUNT_PATH}`]: (_request, index) => ok({ count: index === 0 ? 1 : 0 }),
      [`GET ${LIST_PATH}`]: () => ok(page([notification('n1')])),
      [`PATCH ${LIST_PATH}/n1/read`]: () => ok(null),
    })
    const { router } = renderPage()

    fireEvent.click(await screen.findByRole('link', { name: /홍\*동님이 1,000원을 보냈어요/ }))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/transfers/t-n1')
    expect(api.calls('PATCH', `${LIST_PATH}/n1/read`)).toHaveLength(1)
    expect(api.calls('GET', COUNT_PATH)).toHaveLength(2)
  })

  it('이미 읽은 알림은 읽음 처리 없이 바로 송금 상세로 간다', async () => {
    const api = mockFetch({
      [`GET ${COUNT_PATH}`]: () => ok({ count: 0 }),
      [`GET ${LIST_PATH}`]: () => ok(page([notification('n1', { read: true })])),
    })
    const { router } = renderPage()

    fireEvent.click(await screen.findByRole('link', { name: /홍\*동님이/ }))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/transfers/t-n1')
    expect(api.requests.filter((request) => request.method === 'PATCH')).toHaveLength(0)
  })

  it('삭제된 알림(404 USER_NOTIFICATION_NOT_FOUND)이면 오류 없이 목록과 개수를 다시 조회하고 머문다', async () => {
    const api = mockFetch({
      [`GET ${COUNT_PATH}`]: () => ok({ count: 1 }),
      [`GET ${LIST_PATH}`]: (_request, index) =>
        ok(page(index === 0 ? [notification('n1'), notification('n2', { counterpartName: '이*나', occurredAt: '2026-11-20T00:00:00Z' })] : [notification('n2', { counterpartName: '이*나', occurredAt: '2026-11-20T00:00:00Z' })])),
      [`PATCH ${LIST_PATH}/n1/read`]: () => fail(404, 'USER_NOTIFICATION_NOT_FOUND', '알림을 찾을 수 없습니다.'),
    })
    const { router } = renderPage()

    fireEvent.click(await screen.findByRole('link', { name: /홍\*동님이/ }))

    expect(await screen.findByText('삭제된 알림이라 목록을 새로 불러왔습니다.')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /이\*나님이/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /홍\*동님이/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/notifications')
    expect(api.calls('GET', LIST_PATH)).toHaveLength(2)
    expect(api.calls('GET', COUNT_PATH)).toHaveLength(2)
  })

  it('그 밖의 실패는 오류 문구를 보여 주고 이동하지 않는다', async () => {
    mockFetch({
      [`GET ${COUNT_PATH}`]: () => ok({ count: 1 }),
      [`GET ${LIST_PATH}`]: () => ok(page([notification('n1')])),
      [`PATCH ${LIST_PATH}/n1/read`]: () => fail(503, 'COMMON_SERVICE_UNAVAILABLE'),
    })
    const { router } = renderPage()

    fireEvent.click(await screen.findByRole('link', { name: /홍\*동님이/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('서비스가 일시적으로 원활하지 않습니다.')
    expect(router.state.location.pathname).toBe('/notifications')
  })
})
