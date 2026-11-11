import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockFetch, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { ExchangeDetailPage } from './ExchangeDetailPage'
import { ExchangeListPage } from './ExchangeListPage'

const RESERVED_ORDER = 'bbbbbbbb-0000-4000-8000-000000000001'
const NORMAL_ORDER = 'bbbbbbbb-0000-4000-8000-000000000002'
const RESERVATION = 'cccccccc-0000-4000-8000-000000000001'

function summary(orderId: string, reservationId: string | null | undefined) {
  const item: Record<string, unknown> = {
    orderId,
    type: 'EXCHANGE',
    status: 'COMPLETED',
    failureReason: null,
    fromCurrency: 'KRW',
    fromAmount: '5000',
    toCurrency: 'JPY',
    toAmount: '590',
    totalDebitAmount: '5050',
    requestedAt: '2026-11-10T01:00:00Z',
    settledAt: '2026-11-10T01:00:01Z',
  }
  if (reservationId !== undefined) {
    item.reservationId = reservationId
  }
  return item
}

function order(reservationId: string | null | undefined) {
  return {
    ...summary(RESERVED_ORDER, reservationId),
    quoteId: 'dddddddd-0000-4000-8000-000000000001',
    walletId: 'eeeeeeee-0000-4000-8000-000000000001',
    feeRate: '0.01',
    feeAmount: '50',
    appliedRate: '847.06',
    rateUnit: 100,
    rateDate: '2026-11-10',
  }
}

describe('예약 체결 주문 표시', () => {
  it('환전 내역에서 예약 체결 주문에만 "예약 체결" 배지를 붙인다', async () => {
    mockFetch({
      'GET /api/v1/exchanges': () =>
        ok({
          items: [summary(RESERVED_ORDER, RESERVATION), summary(NORMAL_ORDER, null)],
          page: 0,
          size: 20,
          totalElements: 2,
          totalPages: 1,
        }),
    })
    renderRoute('/exchanges', <ExchangeListPage />, '/exchanges')

    const links = await screen.findAllByRole('link', { name: /KRW → JPY/ })
    const reserved = links.find((link) => link.getAttribute('href') === `/exchanges/${RESERVED_ORDER}`)
    const normal = links.find((link) => link.getAttribute('href') === `/exchanges/${NORMAL_ORDER}`)
    expect(within(reserved!).getByText('예약 체결')).toHaveClass('badge')
    expect(within(normal!).queryByText('예약 체결')).not.toBeInTheDocument()
  })

  it('예약 체결 주문 상세는 예약 상세로 가는 링크를 보여 준다', async () => {
    mockFetch({ [`GET /api/v1/exchanges/${RESERVED_ORDER}`]: () => ok(order(RESERVATION)) })
    renderRoute('/exchanges/:orderId', <ExchangeDetailPage />, `/exchanges/${RESERVED_ORDER}`)

    const link = await screen.findByRole('link', { name: '예약 상세 보기' })
    expect(link).toHaveAttribute('href', `/exchange-reservations/${RESERVATION}`)
  })

  it.each([
    ['null', null],
    ['필드 없음(서버 반영 전)', undefined],
  ])('일반 환전 주문(reservationId %s)은 예약 표시가 없다', async (_label, reservationId) => {
    mockFetch({ [`GET /api/v1/exchanges/${RESERVED_ORDER}`]: () => ok(order(reservationId)) })
    renderRoute('/exchanges/:orderId', <ExchangeDetailPage />, `/exchanges/${RESERVED_ORDER}`)

    expect(await screen.findByText('지갑에서 빠진 금액')).toBeInTheDocument()
    expect(screen.queryByText('예약 체결 주문', { exact: false })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '예약 상세 보기' })).not.toBeInTheDocument()
  })
})
