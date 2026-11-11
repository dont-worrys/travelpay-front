import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '../features/auth/AuthContext'
import { useAuth } from '../features/auth/useAuth'
import { fail, mockFetch, networkError, ok, type RouteHandler } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { TransferNewPage } from './TransferNewPage'

const MY_ID = '11111111-1111-4111-8111-111111111111'
const RECEIVER_ID = '4c6a0178-266b-4f1e-b811-a2767026be70'
const TRANSFER_PATH = '/api/v1/transfers'
const RECIPIENT_PATH = `/api/v1/transfers/recipients/${RECEIVER_ID}`

const TRANSFER = {
  transferId: '7d1e5b2a-9c43-4f6e-8a10-3b2c4d5e6f70',
  direction: 'SENT',
  senderId: MY_ID,
  receiverId: RECEIVER_ID,
  amount: 3000,
  currency: 'KRW',
  status: 'COMPLETED',
  memo: null,
  createdAt: '2026-11-11T00:00:00Z',
}

/** 로그인 상태가 정해진 뒤에 화면을 그린다(본인 ID 비교에 필요). */
function AfterLogin({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  return state.status === 'authenticated' ? children : null
}

function setup(routes: Record<string, RouteHandler> = {}) {
  const api = mockFetch({
    'GET /api/v1/users/me': () =>
      ok({
        userId: MY_ID,
        realName: '유재석',
        phone: '010-1234-5678',
        loginEmail: 'member@example.com',
        status: 'ACTIVE',
        role: 'USER',
        loginMethods: ['PASSWORD'],
        createdAt: '2026-11-01T00:00:00Z',
      }),
    'GET /api/v1/wallets/me/balances': () => ok([{ currency: 'KRW', balance: 100000 }]),
    [`GET ${RECIPIENT_PATH}`]: () => ok({ receiverId: RECEIVER_ID, receiverName: '박*현', transferable: true }),
    ...routes,
  })
  renderRoute(
    '/transfers/new',
    <AuthProvider>
      <AfterLogin>
        <TransferNewPage />
      </AfterLogin>
    </AuthProvider>,
    '/transfers/new',
  )
  return api
}

async function fillAndConfirm(user: ReturnType<typeof userEvent.setup>, amount: string, memo = '') {
  await user.type(await screen.findByPlaceholderText(/^예: /), RECEIVER_ID)
  await user.click(screen.getByRole('button', { name: '확인' }))
  expect(await screen.findByText('받는 분: 박*현')).toBeInTheDocument()
  await user.type(screen.getByPlaceholderText('0'), amount)
  if (memo) {
    await user.type(screen.getByLabelText(/메모/), memo)
  }
  await user.click(screen.getByRole('button', { name: '다음' }))
  expect(await screen.findByRole('heading', { name: '송금 확인' })).toBeInTheDocument()
}

describe('TransferNewPage', () => {
  it('본인 회원 ID는 수취인 조회 없이 막는다', async () => {
    const user = userEvent.setup()
    const api = setup()

    await user.type(await screen.findByPlaceholderText(/^예: /), MY_ID.toUpperCase())
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(screen.getByText('본인에게는 송금할 수 없습니다.')).toBeInTheDocument()
    expect(api.calls('GET', `/api/v1/transfers/recipients/${MY_ID.toUpperCase()}`)).toHaveLength(0)
  })

  it('송금을 받을 수 없는 회원이면 다음으로 넘어가지 못한다', async () => {
    const user = userEvent.setup()
    setup({
      [`GET ${RECIPIENT_PATH}`]: () => ok({ receiverId: RECEIVER_ID, receiverName: '박*현', transferable: false }),
    })

    await user.type(await screen.findByPlaceholderText(/^예: /), RECEIVER_ID)
    await user.click(screen.getByRole('button', { name: '확인' }))
    await user.type(screen.getByPlaceholderText('0'), '3000')

    expect(await screen.findByText('박*현님은 지금 송금을 받을 수 없습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
  })

  it('본문에 보내는 사람 ID 없이 최소 단위 금액·정리한 메모와 멱등성 키를 보낸다', async () => {
    const user = userEvent.setup()
    const api = setup({ [`POST ${TRANSFER_PATH}`]: () => ok(TRANSFER, 201) })

    await fillAndConfirm(user, '3,000', '  점심값 ')
    await user.click(screen.getByRole('button', { name: '송금하기' }))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    const [request] = api.calls('POST', TRANSFER_PATH)
    expect(request?.body).toEqual({ receiverId: RECEIVER_ID, amount: 3000, currency: 'KRW', memo: '점심값' })
    expect(request?.headers['Csrf-Token']).toBe('test-csrf')
    expect(request?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('결과를 모르면 다시 시도할 때 같은 키를 쓴다', async () => {
    const user = userEvent.setup()
    const api = setup({
      [`POST ${TRANSFER_PATH}`]: (_request, index) => (index === 0 ? networkError() : ok(TRANSFER, 201)),
    })

    await fillAndConfirm(user, '3000')
    await user.click(screen.getByRole('button', { name: '송금하기' }))
    await user.click(await screen.findByRole('button', { name: '다시 시도' }))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    const [first, second] = api.calls('POST', TRANSFER_PATH)
    expect(second?.headers['Idempotency-Key']).toBe(first?.headers['Idempotency-Key'])
    expect(second?.body).toEqual(first?.body)
  })

  it('결과를 모를 때 금액을 바꾸면 새 송금이라 새 키를 쓴다', async () => {
    const user = userEvent.setup()
    const api = setup({
      [`POST ${TRANSFER_PATH}`]: (_request, index) => (index === 0 ? networkError() : ok(TRANSFER, 201)),
    })

    await fillAndConfirm(user, '3000')
    await user.click(screen.getByRole('button', { name: '송금하기' }))
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '수정' }))
    const amount = screen.getByPlaceholderText('0')
    await user.clear(amount)
    await user.type(amount, '4000')
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.click(await screen.findByRole('button', { name: '다시 시도' }))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    const [first, second] = api.calls('POST', TRANSFER_PATH)
    expect(second?.body).toMatchObject({ amount: 4000 })
    expect(second?.headers['Idempotency-Key']).not.toBe(first?.headers['Idempotency-Key'])
  })

  it('서버가 거절(4xx)하면 다음 송금은 새 키로 보낸다', async () => {
    const user = userEvent.setup()
    const api = setup({
      [`POST ${TRANSFER_PATH}`]: (_request, index) =>
        index === 0 ? fail(422, 'TRANSFER_INSUFFICIENT_BALANCE', '잔액 부족') : ok(TRANSFER, 201),
    })

    await fillAndConfirm(user, '3000')
    await user.click(screen.getByRole('button', { name: '송금하기' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '송금하기' }))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    const [first, second] = api.calls('POST', TRANSFER_PATH)
    expect(second?.headers['Idempotency-Key']).not.toBe(first?.headers['Idempotency-Key'])
  })
})
