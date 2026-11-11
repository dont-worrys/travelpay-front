import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fail, mockFetch, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { ExchangeReservationDetailPage } from './ExchangeReservationDetailPage'

const RESERVATION_ID = '7d2f9c40-1b3e-4a8d-9f60-3c5e8a1b2d70'
const ORDER_ID = 'a1b2c3d4-0000-4000-8000-000000000000'
const PATH = `/api/v1/exchange-reservations/${RESERVATION_ID}`

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    reservationId: RESERVATION_ID,
    type: 'RE_EXCHANGE',
    status: 'WAITING',
    cancelReason: null,
    walletId: '4c6a0178-266b-4f1e-b811-a2767026be70',
    fromCurrency: 'JPY',
    fromAmount: '5000',
    toCurrency: 'KRW',
    targetRate: '950',
    rateUnit: 100,
    condition: 'AT_OR_ABOVE',
    expiresAt: '2026-11-17T03:00:00Z',
    orderId: null,
    orderStatus: null,
    executedAt: null,
    createdAt: '2026-11-10T03:00:00Z',
    ...overrides,
  }
}

function renderDetail() {
  renderRoute('/exchange-reservations/:reservationId', <ExchangeReservationDetailPage />, `/exchange-reservations/${RESERVATION_ID}`)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ExchangeReservationDetailPage', () => {
  it('대기 예약은 체결 조건을 보여 주고 취소할 수 있다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = mockFetch({
      [`GET ${PATH}`]: () => ok(reservation()),
      [`POST ${PATH}/cancel`]: () => ok(reservation({ status: 'CANCELED', cancelReason: 'USER_REQUESTED' })),
    })
    renderDetail()

    expect(await screen.findByText(/매매기준율이 100엔당 950원 이상으로 올라가면 자동으로 환전합니다/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '예약 취소' }))

    expect(await screen.findByText('예약을 취소했습니다.')).toBeInTheDocument()
    expect(screen.getByText('직접 취소한 예약입니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '예약 취소' })).not.toBeInTheDocument()
    expect(api.calls('POST', `${PATH}/cancel`)).toHaveLength(1)
  })

  it('그사이 체결돼 취소가 거절되면 안내하고 체결 결과로 다시 보여 준다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockFetch({
      [`GET ${PATH}`]: (_request, index) =>
        ok(index === 0 ? reservation() : reservation({ status: 'EXECUTED', orderId: ORDER_ID, orderStatus: 'COMPLETED' })),
      [`POST ${PATH}/cancel`]: () => fail(409, 'EXCHANGE_RESERVATION_NOT_WAITING', '대기 중인 예약이 아닙니다.'),
    })
    renderDetail()

    await user.click(await screen.findByRole('button', { name: '예약 취소' }))

    expect(await screen.findByText('이미 체결·취소·만료된 예약이라 취소할 수 없습니다.')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: '환전 결과 보기' })).toHaveAttribute('href', `/exchanges/${ORDER_ID}`)
    expect(screen.queryByRole('button', { name: '예약 취소' })).not.toBeInTheDocument()
  })
})
