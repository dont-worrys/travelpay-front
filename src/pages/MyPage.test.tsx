import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../features/auth/AuthContext'
import { fail, mockFetch, ok, type RouteHandler } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { MyPage } from './MyPage'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const me = () =>
  ok({
    userId: USER_ID,
    realName: '홍길동',
    phone: '010-1234-5678',
    loginEmail: null,
    status: 'ACTIVE',
    role: 'USER',
    loginMethods: ['PASSWORD'],
    createdAt: '2026-11-01T00:00:00Z',
  })

function setup(meHandler: RouteHandler = me) {
  const api = mockFetch({ 'GET /api/v1/users/me': meHandler })
  const result = renderRoute(
    '/account',
    <AuthProvider>
      <MyPage />
    </AuthProvider>,
    '/account',
  )
  return { api, ...result }
}

describe('MyPage', () => {
  it('내 정보와 회원 ID를 보여 주고, 이메일이 없으면 -로 표시한다', async () => {
    setup()

    expect(await screen.findByText(USER_ID)).toBeInTheDocument()
    expect(screen.getByText('홍길동')).toBeInTheDocument()
    expect(screen.getByText('010-1234-5678')).toBeInTheDocument()
    expect(screen.getByText('-')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '비밀번호 변경' })).toHaveAttribute('href', '/account/password')
  })

  it('복사 버튼을 누르면 회원 ID를 클립보드에 넣고 복사됨으로 바꾼다', async () => {
    setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '복사' }))

    expect(await screen.findByRole('button', { name: '복사됨' })).toBeInTheDocument()
    await expect(navigator.clipboard.readText()).resolves.toBe(USER_ID)
  })

  it('클립보드 권한이 없으면 오류 없이 버튼을 그대로 둔다', async () => {
    setup()
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    await user.click(await screen.findByRole('button', { name: '복사' }))

    expect(writeText).toHaveBeenCalledWith(USER_ID)
    expect(screen.getByRole('button', { name: '복사' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('로그인 상태가 아니면 아무것도 그리지 않는다', async () => {
    const { api, container } = setup(() => fail(401, 'COMMON_UNAUTHORIZED'))

    await vi.waitFor(() => expect(api.calls('GET', '/api/v1/users/me')).toHaveLength(1))
    expect(container.querySelector('section')).toBeNull()
  })
})
