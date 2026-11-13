import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearCsrfToken } from '../api'
import { fail, mockFetch, networkError, ok, type RouteHandler } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { SignupPage } from './SignupPage'

const SIGNUP_PATH = '/api/v1/users'

const TERMS = [
  {
    termsCode: 'SERVICE',
    termsVersion: '1.0',
    title: '서비스 이용약관',
    content: '이용약관 본문',
    isRequired: true,
    effectiveAt: '2026-01-01T00:00:00Z',
  },
  {
    termsCode: 'MARKETING',
    termsVersion: '2.0',
    title: '마케팅 수신 동의',
    content: '마케팅 본문',
    isRequired: false,
    effectiveAt: '2026-01-01T00:00:00Z',
  },
]

const FORM = {
  loginEmail: 'new@example.com',
  password: 'Travelpay-2026!',
  realName: '홍길동',
  phone: '010-1234-5678',
}

function setup(routes: Record<string, RouteHandler>, initialEntry = '/signup') {
  const api = mockFetch({ 'GET /api/v1/terms': () => ok({ terms: TERMS }), ...routes })
  const { router } = renderRoute('/signup', <SignupPage />, initialEntry)
  return { api, router }
}

async function fillForm() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('이메일'), FORM.loginEmail)
  await user.type(screen.getByLabelText(/^비밀번호/), FORM.password)
  await user.type(screen.getByLabelText('성함'), FORM.realName)
  await user.type(screen.getByLabelText('휴대폰 번호'), FORM.phone)
  return user
}

async function agreeRequiredAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('checkbox', { name: /\[필수\] 서비스 이용약관/ }))
  await user.click(screen.getByRole('button', { name: '가입하기' }))
}

describe('SignupPage', () => {
  beforeEach(() => {
    clearCsrfToken()
  })

  it('필수 약관에 동의하기 전에는 가입 버튼이 꺼져 있어 요청하지 않는다', async () => {
    const { api } = setup({})
    const user = await fillForm()
    const button = screen.getByRole('button', { name: '가입하기' })

    await user.click(await screen.findByRole('checkbox', { name: /\[선택\] 마케팅 수신 동의/ }))
    expect(button).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: /\[필수\] 서비스 이용약관/ }))
    expect(button).toBeEnabled()
    expect(api.calls('POST', SIGNUP_PATH)).toHaveLength(0)
  })

  it('입력값과 동의한 약관만 보내고, 성공하면 가입 완료 표시와 redirect를 붙여 로그인으로 보낸다', async () => {
    const { api, router } = setup(
      {
        [`POST ${SIGNUP_PATH}`]: () =>
          ok({ userId: '11111111-1111-4111-8111-111111111111', status: 'ACTIVE', loginRequired: true }, 201),
      },
      '/signup?redirect=%2Ftransfers%2Fnew',
    )
    const user = await fillForm()
    await agreeRequiredAndSubmit(user)

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    const params = new URLSearchParams(router.state.location.search)
    expect(params.get('signedUp')).toBe('1')
    expect(params.get('redirect')).toBe('/transfers/new')

    const [request] = api.calls('POST', SIGNUP_PATH)
    // 동의하지 않은 선택 약관은 빠지고, 회원 ID 같은 다른 필드는 없다.
    expect(request?.body).toEqual({ ...FORM, consents: [{ termsCode: 'SERVICE', termsVersion: '1.0' }] })
    expect(request?.headers['Csrf-Token']).toBe('test-csrf')
  })

  it('외부 주소로 가는 redirect는 로그인 링크에 넘기지 않는다', async () => {
    setup({}, '/signup?redirect=%2F%2Fevil.example.com')

    expect(await screen.findByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login?redirect=%2F')
  })

  it('이미 가입한 이메일이면 서버 문구와 필드 오류를 보여 주고 입력을 남겨 둔다', async () => {
    setup({
      [`POST ${SIGNUP_PATH}`]: () =>
        fail(409, 'USER_EMAIL_ALREADY_EXISTS', '이미 가입한 이메일입니다.', [
          { field: 'loginEmail', message: '다른 이메일을 입력해 주세요.' },
        ]),
    })
    const user = await fillForm()
    await agreeRequiredAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 가입한 이메일입니다.')
    expect(screen.getByText('다른 이메일을 입력해 주세요.')).toHaveClass('field-error')
    expect(screen.queryByTestId('navigated')).not.toBeInTheDocument()
    // 필드 오류가 label 안에 붙으므로 이름 앞부분으로 찾는다.
    expect(screen.getByLabelText(/^이메일/)).toHaveValue(FORM.loginEmail)
  })

  it('연결 실패면 연결 안내 문구를 보여 준다', async () => {
    setup({ [`POST ${SIGNUP_PATH}`]: () => networkError() })
    const user = await fillForm()
    await agreeRequiredAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')
  })

  it('약관을 불러오지 못하면(503) 안내하고 가입 버튼을 끈다', async () => {
    setup({ 'GET /api/v1/terms': () => fail(503, 'COMMON_SERVICE_UNAVAILABLE') })

    expect(
      await screen.findByText('서비스가 일시적으로 원활하지 않습니다. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '가입하기' })).toBeDisabled()
  })
})
