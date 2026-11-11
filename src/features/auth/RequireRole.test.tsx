import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import { fail, mockFetch, ok } from '../../test/fetchMock'
import { AuthProvider } from './AuthContext'
import { loginPathFor, safeRedirectPath } from './redirect'
import { RequireAuth } from './RequireAuth'
import { RequireRole } from './RequireRole'

function Where({ name }: { name: string }) {
  const location = useLocation()
  return <p data-testid="where">{`${name} ${location.pathname}${location.search}`}</p>
}

function meAs(role: 'USER' | 'MASTER') {
  return () =>
    ok({
      userId: '11111111-1111-4111-8111-111111111111',
      realName: '홍길동',
      phone: '010-1234-5678',
      loginEmail: 'member@example.com',
      status: 'ACTIVE',
      role,
      loginMethods: ['PASSWORD'],
      createdAt: '2026-11-01T00:00:00Z',
    })
}

/** 앱(`router.tsx`)과 같은 모양: 로그인 필요 → 역할별 구역. */
function renderApp(initialEntry: string) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <Where name="login" /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <RequireRole role="USER" />,
            children: [
              { path: '/', element: <Where name="user-home" /> },
              { path: '/wallet', element: <Where name="wallet" /> },
            ],
          },
          {
            element: <RequireRole role="MASTER" />,
            children: [{ path: '/admin', element: <Where name="admin-home" /> }],
          },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  )
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
}

describe('RequireAuth·RequireRole', () => {
  it('로그인하지 않았으면 지금 주소를 redirect에 담아 로그인 화면으로 보낸다', async () => {
    mockFetch({ 'GET /api/v1/users/me': () => fail(401, 'COMMON_UNAUTHORIZED') })
    renderApp('/wallet?tab=charges')

    expect(await screen.findByTestId('where')).toHaveTextContent(
      `login /login?redirect=${encodeURIComponent('/wallet?tab=charges')}`,
    )
  })

  it('일반회원은 자기 화면을 보고, 관리자 경로는 일반회원 첫 화면으로 보낸다', async () => {
    mockFetch({ 'GET /api/v1/users/me': meAs('USER') })
    renderApp('/admin')

    expect(await screen.findByTestId('where')).toHaveTextContent('user-home /')
  })

  it('관리자는 일반회원 화면(지갑 등)에 들어가면 관리자 첫 화면으로 보낸다', async () => {
    mockFetch({ 'GET /api/v1/users/me': meAs('MASTER') })
    renderApp('/wallet')

    expect(await screen.findByTestId('where')).toHaveTextContent('admin-home /admin')
  })

  it('역할에 맞는 경로는 그대로 보여 준다', async () => {
    mockFetch({ 'GET /api/v1/users/me': meAs('USER') })
    renderApp('/wallet')

    expect(await screen.findByTestId('where')).toHaveTextContent('wallet /wallet')
  })
})

describe('safeRedirectPath·loginPathFor', () => {
  it('앱 내부 경로만 허용하고 외부로 가는 값은 기본 경로로 바꾼다', () => {
    expect(safeRedirectPath('/payments/new?merchantId=1')).toBe('/payments/new?merchantId=1')
    expect(safeRedirectPath('//evil.example')).toBe('/')
    expect(safeRedirectPath('/\\evil.example')).toBe('/')
    expect(safeRedirectPath('https://evil.example')).toBe('/')
    expect(safeRedirectPath('')).toBe('/')
    expect(safeRedirectPath(null, '/admin')).toBe('/admin')
  })

  it('경로와 쿼리를 인코딩해 redirect 쿼리로 만든다', () => {
    expect(loginPathFor('/transfers', '?direction=SENT&page=1')).toBe(
      '/login?redirect=%2Ftransfers%3Fdirection%3DSENT%26page%3D1',
    )
  })
})
