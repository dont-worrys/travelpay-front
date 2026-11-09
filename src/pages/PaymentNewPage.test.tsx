import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockFetch, networkError, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { PaymentNewPage } from './PaymentNewPage'

const MERCHANT_ID = '9b2f3c1e-8a47-4d55-b0c2-7e1f6a9d3b10'
const PAYMENT = {
  paymentId: 'c7d4e2a9-5b13-4f8e-9a61-0d2b7c8e4f35',
  status: 'APPROVED',
  amount: 5000,
  currency: 'KRW',
  merchantName: 'Cafe',
  paymentInfo: 'coffee',
  declineReason: null,
  refunds: [],
  refundRequest: null,
  createdAt: '2026-11-04T01:02:03Z',
  updatedAt: '2026-11-04T01:02:03Z',
}

/** 첫 결제 요청은 연결 실패, 그다음은 201. */
function setup() {
  const api = mockFetch({
    'GET /api/v1/wallets/me/balances': () => ok([{ currency: 'KRW', balance: 100000 }]),
    'POST /api/v1/payments': (_request, index) => (index === 0 ? networkError() : ok(PAYMENT, 201)),
  })
  renderRoute('/payments/new', <PaymentNewPage />, `/payments/new?merchantId=${MERCHANT_ID}&currency=KRW`)
  return api
}

async function fillAndConfirm(user: ReturnType<typeof userEvent.setup>, amount: string, info: string) {
  const amountInput = screen.getByPlaceholderText('0')
  await user.clear(amountInput)
  await user.type(amountInput, amount)
  const infoInput = screen.getByPlaceholderText('예: 아메리카노 2잔')
  await user.clear(infoInput)
  await user.type(infoInput, info)
  await user.click(screen.getByRole('button', { name: '다음' }))
}

describe('PaymentNewPage', () => {
  it('쿼리의 가맹점 ID를 채우고 결제 본문을 최소 단위로 보낸다', async () => {
    const user = userEvent.setup()
    const api = setup()
    expect(screen.getByDisplayValue(MERCHANT_ID)).toBeInTheDocument()

    await fillAndConfirm(user, '5,000', 'coffee')
    await user.click(screen.getByRole('button', { name: '결제하기' }))

    const [first] = api.calls('POST', '/api/v1/payments')
    expect(first?.body).toEqual({ merchantId: MERCHANT_ID, currency: 'KRW', amount: 5000, paymentInfo: 'coffee' })
    expect(first?.headers['Csrf-Token']).toBe('test-csrf')
    expect(first?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('결과를 모를 때 결제 내용만 바꿔 다시 보내면 같은 키를 쓴다', async () => {
    const user = userEvent.setup()
    const api = setup()

    await fillAndConfirm(user, '5000', 'coffee')
    await user.click(screen.getByRole('button', { name: '결제하기' }))
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '수정' }))
    await fillAndConfirm(user, '5000', 'latte')
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    const [first, second] = api.calls('POST', '/api/v1/payments')
    expect(second?.headers['Idempotency-Key']).toBe(first?.headers['Idempotency-Key'])
  })

  it('결과를 모를 때 금액을 바꾸면 새 키를 쓴다', async () => {
    const user = userEvent.setup()
    const api = setup()

    await fillAndConfirm(user, '5000', 'coffee')
    await user.click(screen.getByRole('button', { name: '결제하기' }))
    await screen.findByRole('button', { name: '다시 시도' })

    await user.click(screen.getByRole('button', { name: '수정' }))
    await fillAndConfirm(user, '6000', 'coffee')
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    await screen.findByTestId('navigated')
    const [first, second] = api.calls('POST', '/api/v1/payments')
    expect(second?.body).toMatchObject({ amount: 6000 })
    expect(second?.headers['Idempotency-Key']).not.toBe(first?.headers['Idempotency-Key'])
  })
})
