import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatDateTime } from '../lib/datetime'
import { formatAmount } from '../lib/money'
import { fail, mockFetch, networkError, ok, type RouteHandler } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { WalletPage } from './WalletPage'

const SETTLEMENTS_PATH = '/api/v1/payments/settlements/me'
const MERCHANT_ID = '9b2f3c1e-8a47-4d55-b0c2-7e1f6a9d3b10'
const SETTLEMENT_ID = 'cccccccc-0000-4000-8000-000000000001'
const CHARGE_ID = 'b3c1d2e4-5f60-4a7b-8c9d-0e1f2a3b4c5d'

function page(items: unknown[]) {
  return { items, page: 0, size: 5, totalElements: items.length, totalPages: 1 }
}

const CHARGE = {
  chargeId: CHARGE_ID,
  status: 'COMPLETED',
  amount: 50000,
  currency: 'KRW',
  bankCode: '004',
  accountNumberMask: '****4567',
  failureCode: null,
  failureMessage: null,
  createdAt: '2026-11-10T01:00:00Z',
  updatedAt: '2026-11-10T01:00:05Z',
}

const SETTLEMENT = {
  settlementId: SETTLEMENT_ID,
  merchantId: MERCHANT_ID,
  merchantName: '제주 기념품샵',
  status: 'PAID',
  amount: 120000,
  currency: 'KRW',
  ownerUserId: '11111111-1111-4111-8111-111111111111',
  paymentCount: 4,
  cutoffAt: '2026-11-12T03:00:00Z',
  ledgerTransactionId: null,
  failureReason: null,
  paidAt: '2026-11-12T03:00:01Z',
  createdAt: '2026-11-12T03:00:00Z',
  updatedAt: '2026-11-12T03:00:02Z',
}

function setup(routes: Record<string, RouteHandler> = {}) {
  const api = mockFetch({
    'GET /api/v1/wallets/me': () => ok({ walletId: 'w-1', status: 'ACTIVE', currencies: ['KRW', 'JPY'] }),
    'GET /api/v1/wallets/me/balances': () =>
      ok([
        { currency: 'KRW', balance: 150000 },
        { currency: 'JPY', balance: 3000 },
      ]),
    'GET /api/v1/charges': () => ok(page([CHARGE])),
    [`GET ${SETTLEMENTS_PATH}`]: () => ok(page([SETTLEMENT])),
    ...routes,
  })
  renderRoute('/wallet', <WalletPage />, '/wallet')
  return api
}

describe('WalletPage', () => {
  it('통화별 잔액·최근 충전·최근 정산 입금을 보여 준다', async () => {
    const api = setup()

    expect(await screen.findByText(formatAmount(150000, 'KRW'))).toBeInTheDocument()
    expect(screen.getByText(formatAmount(3000, 'JPY'))).toBeInTheDocument()

    const charge = screen.getByRole('link', { name: /충전.*완료/ })
    expect(charge).toHaveAttribute('href', `/wallet/charges/${CHARGE_ID}`)
    expect(charge).toHaveTextContent(`+${formatAmount(50000, 'KRW')}`)

    expect(screen.getByRole('heading', { name: '최근 정산 입금' })).toBeInTheDocument()
    const deposit = screen.getByRole('link', { name: /제주 기념품샵/ })
    expect(deposit).toHaveAttribute('href', `/merchant/${MERCHANT_ID}/settlements/${SETTLEMENT_ID}`)
    expect(deposit).toHaveTextContent(`+${formatAmount(120000, 'KRW')}`)
    expect(deposit).toHaveTextContent(`${formatDateTime('2026-11-12T03:00:01Z')} 입금`)

    const query = new URLSearchParams(api.calls('GET', SETTLEMENTS_PATH)[0]?.search)
    expect(query.get('status')).toBe('PAID')
    expect(query.get('size')).toBe('5')
  })

  it('정산 입금이 없으면 정산 입금 카드를 숨긴다', async () => {
    setup({ [`GET ${SETTLEMENTS_PATH}`]: () => ok(page([])) })

    expect(await screen.findByRole('heading', { name: '최근 충전' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '최근 정산 입금' })).not.toBeInTheDocument()
  })

  it.each([
    ['5xx', () => fail(500, 'COMMON_INTERNAL_ERROR')],
    ['연결 실패', () => networkError()],
  ])('정산 입금 조회가 실패(%s)해도 잔액·충전은 보여 주고 카드만 숨긴다', async (_label, handler) => {
    setup({ [`GET ${SETTLEMENTS_PATH}`]: handler })

    expect(await screen.findByText(formatAmount(150000, 'KRW'))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /충전.*완료/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '최근 정산 입금' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('잔액 조회가 실패하면 오류와 다시 불러오기를 보여 주고 충전·정산 입금은 그대로 보여 준다', async () => {
    setup({ 'GET /api/v1/wallets/me/balances': () => fail(503, 'WALLET_LEDGER_UNAVAILABLE') })

    expect(await screen.findByRole('alert')).toHaveTextContent('다시 불러오기')
    expect(screen.queryByRole('heading', { name: '보유 통화' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /충전.*완료/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '최근 정산 입금' })).toBeInTheDocument()
  })
})
