import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '../features/auth/AuthContext'
import { useAuth } from '../features/auth/useAuth'
import { fail, mockFetch, networkError, ok, type RouteHandler } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { ChargeNewPage } from './ChargeNewPage'

const CHARGE_PATH = '/api/v1/charges'
const ACCEPTED = () => ok({ chargeId: 'b3c1d2e4-5f60-4a7b-8c9d-0e1f2a3b4c5d', status: 'REQUESTED' }, 202)

function AfterLogin({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  return state.status === 'authenticated' ? children : null
}

function setup(routes: Record<string, RouteHandler>) {
  const api = mockFetch({
    'GET /api/v1/users/me': () =>
      ok({
        userId: '11111111-1111-4111-8111-111111111111',
        realName: '유재석',
        phone: '010-1234-5678',
        loginEmail: 'member@example.com',
        status: 'ACTIVE',
        role: 'USER',
        loginMethods: ['PASSWORD'],
        createdAt: '2026-11-01T00:00:00Z',
      }),
    ...routes,
  })
  const view = renderRoute(
    '/wallet/charge',
    <AuthProvider>
      <AfterLogin>
        <ChargeNewPage />
      </AfterLogin>
    </AuthProvider>,
    '/wallet/charge',
  )
  return { api, view }
}

/** 제출 버튼은 금액·은행에 따라 이름이 바뀌어 type으로 찾는다. */
function submitButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (!button) {
    throw new Error('제출 버튼이 없습니다.')
  }
  return button
}

async function fill(user: ReturnType<typeof userEvent.setup>, amount: string, account: string) {
  const amountInput = await screen.findByPlaceholderText('0')
  await user.clear(amountInput)
  await user.type(amountInput, amount)
  const accountInput = screen.getByPlaceholderText('숫자만 입력 (- 없이)')
  await user.clear(accountInput)
  await user.type(accountInput, account)
}

describe('ChargeNewPage', () => {
  it('KRW 최소 단위 금액과 하이픈을 뺀 계좌번호, 멱등성 키를 보낸다', async () => {
    const user = userEvent.setup()
    const { api, view } = setup({ [`POST ${CHARGE_PATH}`]: ACCEPTED })

    await fill(user, '50,000', '1234-0101-234567')
    await user.click(submitButton(view.container))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    const [request] = api.calls('POST', CHARGE_PATH)
    expect(request?.body).toEqual({ amount: 50000, currency: 'KRW', bankCode: '004', accountNumber: '12340101234567' })
    expect(request?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('계좌번호 형식이 틀리면 요청하지 않는다', async () => {
    const user = userEvent.setup()
    const { api, view } = setup({ [`POST ${CHARGE_PATH}`]: ACCEPTED })

    await fill(user, '10000', '123456789')
    await user.click(submitButton(view.container))

    expect(screen.getByText('계좌번호는 숫자 10~20자리로 입력해 주세요.')).toBeInTheDocument()
    expect(api.calls('POST', CHARGE_PATH)).toHaveLength(0)
  })

  it('결과를 모르면 같은 내용 재시도는 같은 키, 계좌를 바꾸면 새 키를 쓴다', async () => {
    const user = userEvent.setup()
    const { api, view } = setup({
      [`POST ${CHARGE_PATH}`]: (_request, index) => (index <= 1 ? networkError() : ACCEPTED()),
    })

    await fill(user, '10000', '12340101234567')
    await user.click(submitButton(view.container))
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    await user.click(submitButton(view.container))
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeEnabled()

    await fill(user, '10000', '12340101234568')
    await user.click(submitButton(view.container))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    const [first, second, third] = api.calls('POST', CHARGE_PATH)
    expect(second?.headers['Idempotency-Key']).toBe(first?.headers['Idempotency-Key'])
    expect(third?.headers['Idempotency-Key']).not.toBe(first?.headers['Idempotency-Key'])
  })

  it('지갑이 없으면 지갑 화면으로 안내한다', async () => {
    const user = userEvent.setup()
    const { view } = setup({ [`POST ${CHARGE_PATH}`]: () => fail(404, 'WALLET_NOT_FOUND', '지갑 없음') })

    await fill(user, '10000', '12340101234567')
    await user.click(submitButton(view.container))

    expect(await screen.findByRole('link', { name: '지갑으로 이동' })).toHaveAttribute('href', '/wallet')
  })
})
