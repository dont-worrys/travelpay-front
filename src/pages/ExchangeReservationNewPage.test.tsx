import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fail, mockFetch, networkError, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { ExchangeReservationNewPage } from './ExchangeReservationNewPage'

const WALLET_ID = '4c6a0178-266b-4f1e-b811-a2767026be70'
const RESERVATION_ID = '7d2f9c40-1b3e-4a8d-9f60-3c5e8a1b2d70'
const DAY_MS = 24 * 60 * 60 * 1000

function reservation() {
  return {
    reservationId: RESERVATION_ID,
    type: 'EXCHANGE',
    status: 'WAITING',
    cancelReason: null,
    walletId: WALLET_ID,
    fromCurrency: 'KRW',
    fromAmount: '10000',
    toCurrency: 'JPY',
    targetRate: '920.5',
    rateUnit: 100,
    condition: 'AT_OR_BELOW',
    expiresAt: new Date(Date.now() + 7 * DAY_MS).toISOString(),
    orderId: null,
    orderStatus: null,
    executedAt: null,
    createdAt: new Date().toISOString(),
  }
}

function setup(reserve: Parameters<typeof mockFetch>[0][string]) {
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
          rateDate: '2026-11-10',
          collectedAt: '2026-11-10T00:00:00Z',
        },
      ]),
    'POST /api/v1/exchange-reservations': reserve,
  })
  renderRoute('/exchange-reservations/new', <ExchangeReservationNewPage />, '/exchange-reservations/new')
  return api
}

async function fill(user: ReturnType<typeof userEvent.setup>, amount: string, rate: string) {
  await screen.findByText(/지금 매매기준율 930원/)
  await user.type(screen.getByPlaceholderText('0'), amount)
  await user.type(screen.getByPlaceholderText('0.00'), rate)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ExchangeReservationNewPage', () => {
  it('한도 안내에 견적 전 고정 수수료 1%를 보여 준다', async () => {
    setup(() => ok(reservation(), 201))
    expect(await screen.findByText(/수수료\(1%\)는 체결할 때/)).toBeInTheDocument()
  })

  it('금액·목표 환율은 문자열로, 만료 시각은 고른 기간 뒤 UTC로 보낸다', async () => {
    const user = userEvent.setup()
    const api = setup(() => ok(reservation(), 201))

    await fill(user, '10,000', '920.50')
    expect(screen.getByText(/100엔당 920.5원 이하로 내려가면 10,000원을 엔화\(JPY\)로 환전합니다/)).toBeInTheDocument()
    const before = Date.now()
    await user.click(screen.getByRole('button', { name: '예약하기' }))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    const [call] = api.calls('POST', '/api/v1/exchange-reservations')
    const body = call?.body as Record<string, string>
    expect(body).toMatchObject({
      walletId: WALLET_ID,
      fromCurrency: 'KRW',
      toCurrency: 'JPY',
      amount: '10000',
      targetRate: '920.5',
    })
    const expiresIn = new Date(body.expiresAt ?? '').getTime() - before
    expect(expiresIn).toBeGreaterThan(7 * DAY_MS - 60_000)
    expect(expiresIn).toBeLessThanOrEqual(7 * DAY_MS + 60_000)
    expect(call?.headers['Idempotency-Key']).toBeTruthy()
  })

  it('목표 환율이 소수 셋째 자리면 요청하지 않는다', async () => {
    const user = userEvent.setup()
    const api = setup(() => ok(reservation(), 201))

    await fill(user, '10000', '920.555')
    await user.click(screen.getByRole('button', { name: '예약하기' }))

    expect(await screen.findByText('소수점 아래 2자리까지 입력할 수 있습니다.')).toBeInTheDocument()
    expect(api.calls('POST', '/api/v1/exchange-reservations')).toHaveLength(0)
  })

  it('현재 환율이 이미 조건을 만족하면 곧 체결될 수 있다고 알린다', async () => {
    const user = userEvent.setup()
    setup(() => ok(reservation(), 201))

    await fill(user, '10000', '935')

    expect(screen.getByText(/다음 환율 수집 때 바로 체결될 수 있습니다/)).toBeInTheDocument()
  })

  it('응답을 받지 못하면 입력을 잠그고, 시간이 지나 다시 시도해도 같은 키·같은 본문으로 보낸다', async () => {
    const user = userEvent.setup()
    let now = Date.parse('2026-11-10T03:00:00Z')
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const api = setup((_request, index) => (index === 0 ? networkError() : ok(reservation(), 201)))

    await fill(user, '10000', '920')
    await user.click(screen.getByRole('button', { name: '예약하기' }))
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('0')).toBeDisabled()

    now += 10 * 60 * 1000
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    const [first, second] = api.calls('POST', '/api/v1/exchange-reservations')
    expect(second?.body).toEqual(first?.body)
    expect(second?.headers['Idempotency-Key']).toBe(first?.headers['Idempotency-Key'])
  })

  it('서버가 판단을 끝낸 거절 뒤에는 새 키로 보낸다', async () => {
    const user = userEvent.setup()
    const api = setup((_request, index) =>
      index === 0
        ? fail(409, 'EXCHANGE_RESERVATION_TOO_MANY_WAITING', '대기 예약이 너무 많습니다.')
        : ok(reservation(), 201),
    )

    await fill(user, '10000', '920')
    await user.click(screen.getByRole('button', { name: '예약하기' }))
    expect(await screen.findByText(/대기 중인 예약은 10건까지/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '예약하기' }))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    const [first, second] = api.calls('POST', '/api/v1/exchange-reservations')
    expect(second?.headers['Idempotency-Key']).not.toBe(first?.headers['Idempotency-Key'])
  })
})
