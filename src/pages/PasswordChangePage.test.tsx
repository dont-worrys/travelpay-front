import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearCsrfToken } from '../api'
import { AuthProvider } from '../features/auth/AuthContext'
import { fail, mockFetch, networkError, ok, type RouteHandler } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { PasswordChangePage } from './PasswordChangePage'

const PASSWORD_PATH = '/api/v1/users/me/password'
const CURRENT = 'Travelpay-Old-2026!'
const NEXT = 'Travelpay-New-2026!'

const me = () =>
  ok({
    userId: '11111111-1111-4111-8111-111111111111',
    realName: '홍길동',
    phone: '010-1234-5678',
    loginEmail: 'member@example.com',
    status: 'ACTIVE',
    role: 'USER',
    loginMethods: ['PASSWORD'],
    createdAt: '2026-11-01T00:00:00Z',
  })

function setup(routes: Record<string, RouteHandler>) {
  const api = mockFetch({ 'GET /api/v1/users/me': me, ...routes })
  renderRoute(
    '/account/password',
    <AuthProvider>
      <PasswordChangePage />
    </AuthProvider>,
    '/account/password',
  )
  return api
}

async function fillAndSubmit(confirm = NEXT) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('현재 비밀번호'), CURRENT)
  await user.type(screen.getByLabelText(/^새 비밀번호(?! 확인)/), NEXT)
  await user.type(screen.getByLabelText('새 비밀번호 확인'), confirm)
  await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))
  return user
}

describe('PasswordChangePage', () => {
  beforeEach(() => {
    // CSRF 토큰은 모듈에 남으므로 테스트마다 비운다.
    clearCsrfToken()
  })

  it('현재·새 비밀번호만 보내고, 성공하면 CSRF 토큰을 새로 받는다', async () => {
    const api = setup({ [`PATCH ${PASSWORD_PATH}`]: () => new Response(null, { status: 204 }) })
    await fillAndSubmit()

    expect(await screen.findByRole('status')).toHaveTextContent('비밀번호를 바꿨습니다.')
    const [request] = api.calls('PATCH', PASSWORD_PATH)
    expect(request?.body).toEqual({ currentPassword: CURRENT, newPassword: NEXT })
    expect(request?.headers['Csrf-Token']).toBe('test-csrf')
    // 변경 전 1번 + 변경 후 재발급 1번
    expect(api.calls('GET', '/api/v1/auth/csrf')).toHaveLength(2)
    expect(screen.getByLabelText('현재 비밀번호')).toHaveValue('')
  })

  it('새 비밀번호 확인이 다르면 요청하지 않는다', async () => {
    const api = setup({})
    await fillAndSubmit('Different-2026!')

    expect(await screen.findByText('새 비밀번호가 서로 다릅니다.')).toBeInTheDocument()
    expect(api.calls('PATCH', PASSWORD_PATH)).toHaveLength(0)
  })

  it('현재 비밀번호가 틀리면 그 칸 옆에 서버 문구를 보여 준다', async () => {
    setup({
      [`PATCH ${PASSWORD_PATH}`]: () => fail(400, 'USER_CURRENT_PASSWORD_MISMATCH', '현재 비밀번호가 일치하지 않습니다.'),
    })
    await fillAndSubmit()

    expect(await screen.findByText('현재 비밀번호가 일치하지 않습니다.')).toHaveClass('field-error')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('변경 후 세션 갱신 실패(503)면 다시 로그인으로 안내하고 재시도하지 않는다', async () => {
    const api = setup({
      [`PATCH ${PASSWORD_PATH}`]: () => fail(503, 'USER_ACCOUNT_UPDATED_SESSION_UNAVAILABLE'),
      'POST /api/v1/auth/logout': () => new Response(null, { status: 204 }),
    })
    const user = await fillAndSubmit()

    expect(await screen.findByText('새 비밀번호로 다시 로그인해 주세요.', { exact: false })).toBeInTheDocument()
    expect(screen.queryByLabelText('현재 비밀번호')).not.toBeInTheDocument()
    expect(api.calls('PATCH', PASSWORD_PATH)).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: '다시 로그인' }))
    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
  })

  it('연결 실패면 변경 여부를 모른다고 안내하고 입력은 남겨 둔다', async () => {
    setup({ [`PATCH ${PASSWORD_PATH}`]: () => networkError() })
    await fillAndSubmit()

    expect(await screen.findByText('비밀번호가 바뀌었는지 확인하지 못했습니다.', { exact: false })).toBeInTheDocument()
    expect(screen.getByLabelText('현재 비밀번호')).toHaveValue(CURRENT)
  })
})
