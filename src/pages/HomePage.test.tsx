import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fail, mockFetch, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { HomePage } from './HomePage'

const auth = vi.hoisted(() => ({ state: { status: 'anonymous' } as Record<string, unknown> }))
vi.mock('../features/auth/useAuth', () => ({ useAuth: () => auth }))

const RATES = [
  {
    currency: 'JPY',
    priceCurrency: 'KRW',
    unit: 100,
    midRate: '900.2',
    buyRate: '909.2',
    sellRate: '891.2',
    source: 'MOCK',
    rateDate: '2026-11-12',
    collectedAt: '2026-11-12T00:00:00Z',
    previousMidRate: '898.1',
    previousRateDate: '2026-11-11',
    changeAmount: '2.1',
    changeRate: '0.23',
  },
]

function signedIn() {
  auth.state = { status: 'authenticated', me: { realName: '유재석', role: 'USER' } }
}

describe('HomePage', () => {
  it('원화 잔액을 가장 크게, 보유 통화와 자주 쓰는 기능을 보여 준다', async () => {
    signedIn()
    mockFetch({
      'GET /api/v1/wallets/me/balances': () =>
        ok([
          { currency: 'KRW', balance: 1850000 },
          { currency: 'JPY', balance: 142500 },
        ]),
      'GET /api/v1/exchange-rates': () => ok(RATES),
    })
    const { container } = renderRoute('/', <HomePage />, '/')

    expect(screen.getByRole('heading', { name: '내 지갑' })).toBeInTheDocument()
    expect(screen.getByText('안녕하세요, 유재석님')).toBeInTheDocument()
    expect(await screen.findByText('원화 잔액')).toBeInTheDocument()
    expect(container.querySelector('.home-hero-amount')).toHaveTextContent('1,850,000원')

    const actions = screen.getByRole('navigation', { name: '자주 쓰는 기능' })
    expect(within(actions).getByRole('link', { name: '충전' })).toHaveAttribute('href', '/wallet/charge')
    expect(within(actions).getByRole('link', { name: '송금' })).toHaveAttribute('href', '/transfers/new')
    expect(within(actions).getByRole('link', { name: '결제' })).toHaveAttribute('href', '/payments/new')
    expect(within(actions).getByRole('link', { name: '환전' })).toHaveAttribute('href', '/exchange')

    expect(screen.getByText('142,500엔')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '원화로 환전' })).toHaveAttribute(
      'href',
      '/exchange?type=RE_EXCHANGE&currency=JPY',
    )
    expect(await screen.findByText('900.2원')).toBeInTheDocument()
  })

  it('지갑이 없으면 지갑 만들기로 안내한다', async () => {
    signedIn()
    mockFetch({
      'GET /api/v1/wallets/me/balances': () => fail(404, 'WALLET_NOT_FOUND', '지갑 없음'),
      'GET /api/v1/exchange-rates': () => ok(RATES),
    })
    renderRoute('/', <HomePage />, '/')

    expect(await screen.findByRole('link', { name: '지갑 만들기' })).toHaveAttribute('href', '/wallet')
    expect(screen.queryByRole('heading', { name: '보유 통화' })).not.toBeInTheDocument()
  })

  it('환율을 못 불러오면 오늘의 환율 구역을 숨긴다', async () => {
    signedIn()
    const api = mockFetch({
      'GET /api/v1/wallets/me/balances': () => ok([{ currency: 'KRW', balance: 0 }]),
      'GET /api/v1/exchange-rates': () => fail(503, 'COMMON_SERVICE_UNAVAILABLE'),
    })
    renderRoute('/', <HomePage />, '/')

    expect(await screen.findByText('원화 잔액')).toBeInTheDocument()
    await vi.waitFor(() => expect(api.calls('GET', '/api/v1/exchange-rates')).toHaveLength(1))
    expect(screen.queryByRole('heading', { name: '오늘의 환율' })).not.toBeInTheDocument()
  })

  it('비로그인이면 잔액을 부르지 않고 로그인 입구를 보여 준다', () => {
    auth.state = { status: 'anonymous' }
    const api = mockFetch({})
    renderRoute('/', <HomePage />, '/')

    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login')
    expect(api.requests).toHaveLength(0)
  })
})
