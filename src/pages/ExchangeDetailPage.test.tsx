import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fail, mockFetch, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { ExchangeDetailPage } from './ExchangeDetailPage'

const ID = 'eeeeeeee-0000-4000-8000-000000000001'
const RESERVATION_ID = '7d2f9c40-1b3e-4a8d-9f60-3c5e8a1b2d70'
const PATH = `/api/v1/exchanges/${ID}`

/** 금액·환율은 주 단위 소수 문자열이다. */
function order(overrides: Record<string, unknown> = {}) {
  return {
    orderId: ID,
    type: 'EXCHANGE',
    status: 'COMPLETED',
    failureReason: null,
    quoteId: 'q-1',
    walletId: 'w-1',
    fromCurrency: 'KRW',
    fromAmount: '100000',
    toCurrency: 'JPY',
    toAmount: '10420',
    feeRate: '0.01',
    feeAmount: '1000',
    totalDebitAmount: '101000',
    appliedRate: '959.5',
    rateUnit: 100,
    rateDate: '2026-11-12',
    requestedAt: '2026-11-12T01:00:00Z',
    settledAt: '2026-11-12T01:00:02Z',
    reservationId: null,
    ...overrides,
  }
}

function renderDetail() {
  renderRoute('/exchanges/:orderId', <ExchangeDetailPage />, `/exchanges/${ID}`)
}

describe('ExchangeDetailPage', () => {
  it('완료된 환전은 받은 금액·보낸 금액·수수료·적용 환율을 주 단위 문자열 그대로 보여 준다', async () => {
    mockFetch({ [`GET ${PATH}`]: () => ok(order()) })
    renderDetail()

    expect(await screen.findByRole('heading', { name: '환전 상세' })).toBeInTheDocument()
    expect(screen.getByText('+10,420엔')).toBeInTheDocument()
    expect(screen.getByText('완료')).toHaveClass('badge')
    expect(screen.getByText('100,000원')).toBeInTheDocument()
    expect(screen.getByText('1,000원 (수수료율 1%)')).toBeInTheDocument()
    expect(screen.getByText('101,000원')).toBeInTheDocument()
    expect(screen.getByText('100엔당 959.5원 (기준일 2026-11-12)')).toBeInTheDocument()
    expect(screen.queryByText(/예약 체결 주문/)).not.toBeInTheDocument()
  })

  it('예약 체결로 만들어진 재환전은 예약 체결 주문임을 표시하고 예약 상세로 연결한다', async () => {
    mockFetch({
      [`GET ${PATH}`]: () =>
        ok(
          order({
            type: 'RE_EXCHANGE',
            fromCurrency: 'CNY',
            fromAmount: '10.5',
            toCurrency: 'KRW',
            toAmount: '1980',
            feeAmount: '0.11',
            totalDebitAmount: '10.61',
            appliedRate: '190.48',
            rateUnit: 1,
            reservationId: RESERVATION_ID,
          }),
        ),
    })
    renderDetail()

    expect(await screen.findByRole('heading', { name: '재환전 상세' })).toBeInTheDocument()
    expect(screen.getByText(/예약 체결 주문/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '예약 상세 보기' })).toHaveAttribute(
      'href',
      `/exchange-reservations/${RESERVATION_ID}`,
    )
    expect(screen.getByText('+1,980원')).toBeInTheDocument()
    expect(screen.getByText('10.50위안')).toBeInTheDocument()
    expect(screen.getByText('0.11위안 (수수료율 1%)')).toBeInTheDocument()
    expect(screen.getByText('1위안당 190.48원 (기준일 2026-11-12)')).toBeInTheDocument()
  })

  it('실패한 환전은 실패 사유를 보여 주고 다시 환전하기를 연결한다', async () => {
    mockFetch({
      [`GET ${PATH}`]: () => ok(order({ status: 'FAILED', failureReason: 'INSUFFICIENT_BALANCE', settledAt: null })),
    })
    renderDetail()

    expect(await screen.findByText('실패')).toHaveClass('badge')
    expect(screen.getByText('잔액이 부족해 환전하지 못했습니다. 잔액이 빠지지 않았습니다.')).toHaveClass('error')
    expect(screen.getByRole('link', { name: '다시 환전하기' })).toHaveAttribute('href', '/exchange')
    expect(screen.queryByText('확정 시각')).not.toBeInTheDocument()
  })

  it('운영자 확인 중인 환전은 다시 환전하지 말라고 안내한다', async () => {
    mockFetch({ [`GET ${PATH}`]: () => ok(order({ status: 'MANUAL_REVIEW', settledAt: null })) })
    renderDetail()

    expect(await screen.findByText('확인 중')).toHaveClass('badge')
    expect(
      screen.getByText('자동 처리가 멈춰 운영자가 확인하고 있습니다. 잔액이 두 번 빠지지 않으니 다시 환전하지 마세요.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '다시 환전하기' })).not.toBeInTheDocument()
  })

  it('없는 주문(404 EXCHANGE_ORDER_NOT_FOUND)이면 서버 문구와 환전 내역 링크를 보여 준다', async () => {
    mockFetch({ [`GET ${PATH}`]: () => fail(404, 'EXCHANGE_ORDER_NOT_FOUND', '환전 주문을 찾을 수 없습니다.') })
    renderDetail()

    expect(await screen.findByRole('alert')).toHaveTextContent('환전 주문을 찾을 수 없습니다.')
    expect(screen.getByRole('link', { name: '환전 내역으로' })).toHaveAttribute('href', '/exchanges')
  })
})
