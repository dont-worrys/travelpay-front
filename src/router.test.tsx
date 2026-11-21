import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from './features/auth/AuthContext'
import { routes } from './router'
import { fail, mockFetch, ok } from './test/fetchMock'

const RATES = [
  {
    currency: 'JPY',
    priceCurrency: 'KRW',
    unit: 100,
    midRate: '900.2',
    buyRate: '909.2',
    sellRate: '891.2',
    source: 'MOCK',
    rateDate: '2026-11-12',
    collectedAt: '2026-11-12T00:00:00Z',
  },
]

/** 실제 라우트 표(router.tsx)를 메모리 라우터로 그린다. 주소창에 직접 입력하거나 새로고침한 것과 같다. */
function renderApp(initialEntry: string) {
  mockFetch({
    'GET /api/v1/users/me': () => fail(401, 'COMMON_UNAUTHORIZED'),
    'GET /api/v1/exchange-rates': () => ok(RATES),
  })
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] })
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
  return router
}

describe('라우트 코드 스플리팅', () => {
  it('화면 코드를 내려받는 동안 본문에 공통 로딩을 보이고, 받은 뒤 화면을 그린다', async () => {
    renderApp('/exchange-rates')

    expect(screen.getByRole('status')).toHaveTextContent('화면을 불러오는 중입니다…')
    expect(await screen.findByRole('heading', { name: '환율' })).toBeInTheDocument()
    expect(screen.queryByText('화면을 불러오는 중입니다…')).not.toBeInTheDocument()
  })

  it('로그인이 필요한 주소에 바로 들어오면 로그인 화면(별도 청크)으로 보낸다', async () => {
    const router = renderApp('/wallet')

    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('없는 주소는 찾을 수 없음 화면을 그린다', async () => {
    renderApp('/no-such-page')

    expect(await screen.findByRole('heading', { name: '페이지를 찾을 수 없습니다' })).toBeInTheDocument()
  })

  it('메뉴로 다른 화면으로 이동하면 그 화면 코드를 받아 그린다', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    await user.click(screen.getByRole('link', { name: '환율' }))

    expect(await screen.findByRole('heading', { name: '환율' })).toBeInTheDocument()
  })
})

describe('관리자(MASTER) 알림', () => {
  it('MASTER가 알림 주소에 들어오면 관리자 첫 화면으로 보내고, 알림 아이콘·개수 조회가 없다', async () => {
    const api = mockFetch({
      'GET /api/v1/users/me': () =>
        ok({
          userId: 'm-1',
          realName: '관리자',
          phone: '010-0000-0000',
          loginEmail: 'admin@example.com',
          status: 'ACTIVE',
          role: 'MASTER',
          loginMethods: ['PASSWORD'],
          createdAt: '2026-11-01T00:00:00Z',
        }),
    })
    const router = createMemoryRouter(routes, { initialEntries: ['/notifications'] })
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'))
    expect(screen.queryByRole('link', { name: /^알림/ })).not.toBeInTheDocument()
    expect(api.calls('GET', '/api/v1/users/me/notifications/unread-count')).toHaveLength(0)
  })
})
