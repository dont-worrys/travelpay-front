import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotificationProvider, UNREAD_COUNT_INTERVAL_MS } from '../features/notification/NotificationProvider'
import { mockFetch, ok } from '../test/fetchMock'
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
