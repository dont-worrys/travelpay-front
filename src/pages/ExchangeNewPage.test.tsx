import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fail, mockFetch, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { ExchangeNewPage } from './ExchangeNewPage'

const WALLET_ID = '4c6a0178-266b-4f1e-b811-a2767026be70'
const QUOTE_ID = '0f3a8c21-6d4e-4b7a-9c15-2e8d7f1b4a60'

function quote() {
  return {
    quoteId: QUOTE_ID,
    fromCurrency: 'KRW',
    fromAmount: '10000',
    toCurrency: 'JPY',
    toAmount: '1063',
    feeRate: '0.01',
    feeAmount: '100',
    totalDebitAmount: '10100',
    appliedRate: '940.5',
    rateUnit: 100,
    rateDate: '2026-11-09',
    status: 'ISSUED',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  }
}

function setup(placeExchange: Parameters<typeof mockFetch>[0][string]) {
  const api = mockFetch({
    'GET /api/v1/wallets/me': () => ok({ walletId: WALLET_ID, status: 'ACTIVE', currencies: ['KRW', 'JPY', 'CNY'] }),
    'GET /api/v1/exchange-limits': () =>
      ok([{ currency: 'KRW', minAmount: '1000', maxAmount: '2000000', balance: '50000', availableAmount: '49504' }]),
    'GET /api/v1/exchange-rates': () =>
      ok([
        {
          currency: 'JPY',
          priceCurrency: 'KRW',
          unit: 100,
          midRate: '930',
          buyRate: '940.5',
          sellRate: '919.5',
          source: 'MOCK',
          rateDate: '2026-11-09',
          collectedAt: '2026-11-09T00:00:00Z',
        },
      ]),
    'POST /api/v1/exchange-quotes': () => ok(quote(), 201),
    'POST /api/v1/exchanges': placeExchange,
  })
  renderRoute('/exchange', <ExchangeNewPage />, '/exchange')
  return api
}

async function requestQuote(user: ReturnType<typeof userEvent.setup>, amount: string) {
  await screen.findByText(/매매기준율 930원/)
  await user.type(screen.getByPlaceholderText('0'), amount)
  await user.click(screen.getByRole('button', { name: '견적 받기' }))
  await screen.findByRole('heading', { name: '환전 확인' })
}

describe('ExchangeNewPage', () => {
  it('한도를 벗어난 금액은 견적을 요청하지 않는다', async () => {
    const user = userEvent.setup()
    const api = setup(() => ok({}))
    await screen.findByText(/매매기준율 930원/)

    await user.type(screen.getByPlaceholderText('0'), '500')
    await user.click(screen.getByRole('button', { name: '견적 받기' }))

    expect(await screen.findByText('최소 1,000원부터 환전할 수 있습니다.')).toBeInTheDocument()
    expect(api.calls('POST', '/api/v1/exchange-quotes')).toHaveLength(0)
  })

  it('견적 금액은 문자열로 보내고 받은 소수 문자열을 표시한다', async () => {
    const user = userEvent.setup()
    const api = setup(() => ok({}))

    await requestQuote(user, '10000')

    expect(api.calls('POST', '/api/v1/exchange-quotes')[0]?.body).toEqual({
      fromCurrency: 'KRW',
      toCurrency: 'JPY',
      amount: '10000',
    })
    expect(screen.getByText('1,063엔')).toBeInTheDocument()
    expect(screen.getByText('10,100원')).toBeInTheDocument()
    expect(screen.getByText(/100엔당 940.5원/)).toBeInTheDocument()
    expect(screen.getByText(/수수료율 1%/)).toBeInTheDocument()
    expect(screen.getByText(/^\d:\d{2} 남음$/)).toHaveClass('badge', 'badge-processing')
  })

  it('견적 전에는 살 때 환율이 아니라 매매기준율과 고정 수수료 1%를 참고로 보여 준다', async () => {
    setup(() => ok({}))

    expect(await screen.findByText(/100엔당 매매기준율 930원 \(기준일 2026-11-09\), 수수료 1%/)).toBeInTheDocument()
    expect(screen.queryByText(/살 때/)).not.toBeInTheDocument()
    expect(await screen.findByText(/수수료\(1%\)는 보내는 통화로/)).toBeInTheDocument()
  })

  it('5xx 뒤 다시 시도하면 같은 견적·같은 키로 보낸다', async () => {
    const user = userEvent.setup()
    const api = setup((_request, index) =>
      index === 0
        ? fail(503, 'EXCHANGE_LEDGER_UNAVAILABLE', '지금은 환전할 수 없습니다.')
        : ok({ orderId: 'a1b2c3d4-0000-4000-8000-000000000000', status: 'COMPLETED' }),
    )

    await requestQuote(user, '10000')
    await user.click(screen.getByRole('button', { name: '환전하기' }))
    await user.click(await screen.findByRole('button', { name: '다시 시도' }))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    const [first, second] = api.calls('POST', '/api/v1/exchanges')
    expect(first?.body).toEqual({ quoteId: QUOTE_ID, walletId: WALLET_ID })
    expect(second?.body).toEqual(first?.body)
    expect(second?.headers['Idempotency-Key']).toBe(first?.headers['Idempotency-Key'])
  })

  it('서버가 견적 만료로 거절하면 견적을 다시 받게 한다', async () => {
    const user = userEvent.setup()
    setup(() => fail(409, 'EXCHANGE_QUOTE_EXPIRED', '견적이 만료되었습니다. 견적을 다시 받아 주세요.'))

    await requestQuote(user, '10000')
    await user.click(screen.getByRole('button', { name: '환전하기' }))

    expect(await screen.findByRole('button', { name: '견적 다시 받기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '환전하기' })).not.toBeInTheDocument()
  })
})
