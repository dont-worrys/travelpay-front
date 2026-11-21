import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fail, mockFetch, ok } from '../../test/fetchMock'
import { NotificationProvider, UNREAD_COUNT_INTERVAL_MS, useUnreadNotifications } from './NotificationProvider'

const COUNT_PATH = '/api/v1/users/me/notifications/unread-count'

let visibility: DocumentVisibilityState = 'visible'

function setVisibility(next: DocumentVisibilityState) {
  visibility = next
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function Count() {
  const { unreadCount } = useUnreadNotifications()
  return <p data-testid="count">{unreadCount === null ? 'none' : unreadCount}</p>
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('NotificationProvider', () => {
  it('처음 한 번 조회하고 30초마다 다시 조회한다', async () => {
    const api = mockFetch({ [`GET ${COUNT_PATH}`]: (_request, index) => ok({ count: index + 1 }) })
    render(
      <NotificationProvider enabled>
        <Count />
      </NotificationProvider>,
    )

    await advance(0)
    expect(screen.getByTestId('count')).toHaveTextContent('1')

    await advance(UNREAD_COUNT_INTERVAL_MS - 1)
    expect(api.calls('GET', COUNT_PATH)).toHaveLength(1)
    await advance(1)
    expect(api.calls('GET', COUNT_PATH)).toHaveLength(2)
    expect(screen.getByTestId('count')).toHaveTextContent('2')
  })

  it('조회가 실패하면 마지막으로 받은 개수를 그대로 둔다', async () => {
    mockFetch({
      [`GET ${COUNT_PATH}`]: (_request, index) => (index === 0 ? ok({ count: 4 }) : fail(503, 'COMMON_SERVICE_UNAVAILABLE')),
    })
    render(
      <NotificationProvider enabled>
        <Count />
      </NotificationProvider>,
    )

    await advance(0)
    expect(screen.getByTestId('count')).toHaveTextContent('4')
    await advance(UNREAD_COUNT_INTERVAL_MS)
    expect(screen.getByTestId('count')).toHaveTextContent('4')
  })

  it('탭이 숨겨지면 조회를 멈추고, 다시 보이면 바로 조회한다', async () => {
    const api = mockFetch({ [`GET ${COUNT_PATH}`]: () => ok({ count: 0 }) })
    render(
      <NotificationProvider enabled>
        <Count />
      </NotificationProvider>,
    )
    await advance(0)
    expect(api.calls('GET', COUNT_PATH)).toHaveLength(1)

    setVisibility('hidden')
    await advance(UNREAD_COUNT_INTERVAL_MS * 3)
    expect(api.calls('GET', COUNT_PATH)).toHaveLength(1)

    setVisibility('visible')
    await advance(0)
    expect(api.calls('GET', COUNT_PATH)).toHaveLength(2)
  })

  it('enabled가 false면 조회하지 않는다', async () => {
    const api = mockFetch({})
    render(
      <NotificationProvider enabled={false}>
        <Count />
      </NotificationProvider>,
    )

    await advance(UNREAD_COUNT_INTERVAL_MS)
    expect(api.calls('GET', COUNT_PATH)).toHaveLength(0)
    expect(screen.getByTestId('count')).toHaveTextContent('none')
  })
})
