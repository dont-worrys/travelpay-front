import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearCsrfToken } from '../api'
import { AuthProvider } from '../features/auth/AuthContext'
import { fail, mockFetch, networkError, ok, type RouteHandler } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { LoginPage } from './LoginPage'

const LOGIN_PATH = '/api/v1/auth/login'
const USER_ID = '11111111-1111-4111-8111-111111111111'

const meResponse = () =>
  ok({
    userId: USER_ID,
    realName: '홍길동',
    phone: '010-1234-5678',
    loginEmail: 'member@example.com',
    status: 'ACTIVE',
    role: 'USER',
    loginMethods: ['PASSWORD'],
    createdAt: '2026-11-01T00:00:00Z',
  })

/** 처음 열 때는 로그인 전(401), 로그인 뒤 다시 읽으면 내 정보. */
const meAfterLogin: RouteHandler = (_request, index) =>
  index === 0 ? fail(401, 'COMMON_UNAUTHORIZED') : meResponse()

function setup(routes: Record<string, RouteHandler>, initialEntry = '/login') {
  const api = mockFetch({ 'GET /api/v1/users/me': meAfterLogin, ...routes })
  const { router } = renderRoute(
    '/login',
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
    initialEntry,
  )
  return { api, router }
}

async function fillAndSubmit(email = 'member@example.com', password = 'Travelpay-2026!') {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('이메일'), email)
  await user.type(screen.getByLabelText('비밀번호'), password)
  await user.click(screen.getByRole('button', { name: '로그인' }))
  return user
}

describe('LoginPage', () => {
  beforeEach(() => {
    clearCsrfToken()
  })

  it('이메일·비밀번호만 보내고, 성공하면 CSRF 토큰을 새로 받은 뒤 redirect 경로로 이동한다', async () => {
    const { api, router } = setup(
      { [`POST ${LOGIN_PATH}`]: () => ok({ userId: USER_ID, role: 'USER' }) },
      '/login?redirect=%2Fwallet%3Ftab%3Dkrw',
    )
    await fillAndSubmit()

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/wallet')
    expect(router.state.location.search).toBe('?tab=krw')

    const [request] = api.calls('POST', LOGIN_PATH)
    expect(request?.body).toEqual({ loginEmail: 'member@example.com', password: 'Travelpay-2026!' })
    expect(request?.headers['Csrf-Token']).toBe('test-csrf')
    // 로그인 전 1번 + 로그인 후 재발급 1번
    expect(api.calls('GET', '/api/v1/auth/csrf')).toHaveLength(2)
    // 로그인 뒤 내 정보를 다시 읽는다.
    expect(api.calls('GET', '/api/v1/users/me')).toHaveLength(2)
  })

  it('외부 주소로 가는 redirect는 무시하고 첫 화면으로 보낸다', async () => {
    const { router } = setup(
      { [`POST ${LOGIN_PATH}`]: () => ok({ userId: USER_ID, role: 'USER' }) },
      '/login?redirect=%2F%2Fevil.example.com',
    )
    await fillAndSubmit()

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('이메일·비밀번호를 모두 넣기 전에는 로그인 버튼이 꺼져 있다', async () => {
    const api = setup({}).api
    const user = userEvent.setup()
    const button = await screen.findByRole('button', { name: '로그인' })
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText('이메일'), 'member@example.com')
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText('비밀번호'), 'x')
    expect(button).toBeEnabled()
    expect(api.calls('POST', LOGIN_PATH)).toHaveLength(0)
  })

  it('이메일·비밀번호가 틀리면 서버 문구를 보여 주고 이동하지 않는다', async () => {
    setup({
      [`POST ${LOGIN_PATH}`]: () => fail(401, 'USER_INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.'),
    })
    await fillAndSubmit()

    expect(await screen.findByRole('alert')).toHaveTextContent('이메일 또는 비밀번호가 올바르지 않습니다.')
    expect(screen.queryByTestId('navigated')).not.toBeInTheDocument()
    expect(screen.getByLabelText('이메일')).toHaveValue('member@example.com')
  })

  it('서비스 장애(503)와 연결 실패는 화면 문구로 안내한다', async () => {
    setup({
      [`POST ${LOGIN_PATH}`]: (_request, index) =>
        index === 0 ? fail(503, 'COMMON_SERVICE_UNAVAILABLE', 'unavailable') : networkError(),
    })
    const user = await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '서비스가 일시적으로 원활하지 않습니다. 잠시 후 다시 시도해 주세요.',
    )

    await user.click(screen.getByRole('button', { name: '로그인' }))
    expect(await screen.findByText('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
  })

  it('가입 직후(signedUp=1)에는 가입 완료 안내를 보여 준다', async () => {
    setup({}, '/login?signedUp=1&redirect=%2Fwallet')

    expect(await screen.findByText('가입이 완료되었습니다. 로그인해 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '회원가입' })).toHaveAttribute('href', '/signup?redirect=%2Fwallet')
  })
})
