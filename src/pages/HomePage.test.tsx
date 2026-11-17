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
    expect(within(actions).getByRole('link', { name: '송금하기' })).toHaveAttribute('href', '/transfers/new')
    expect(within(actions).getByRole('link', { name: '충전하기' })).toHaveAttribute('href', '/wallet/charge')
    expect(within(actions).getByRole('link', { name: '환전하기' })).toHaveAttribute('href', '/exchange')
    expect(within(actions).getByRole('link', { name: '결제하기' })).toHaveAttribute('href', '/payments/new')

    expect(screen.getByText('142,500엔')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '원화로 환전' })).toHaveAttribute(
      'href',
      '/exchange?type=RE_EXCHANGE&currency=JPY',
    )
    // 환율표: 값은 "100엔당 900.2원", 머리에는 기준일만 적고 "매매기준율" 말은 쓰지 않는다. 환전하기는 해당 통화 환전 화면으로.
    expect(await screen.findByText('100엔당 900.2원')).toBeInTheDocument()
    expect(screen.getByText('기준일 2026-11-12')).toBeInTheDocument()
    expect(screen.getByText('환전 수수료는 1%입니다.')).toBeInTheDocument()
    expect(screen.queryByText(/매매기준율/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'JPY 환전하기' })).toHaveAttribute('href', '/exchange?currency=JPY')
    // 로그인 후 홈에는 송금 배너가 없다(송금하기는 위 기능 버튼).
    expect(screen.queryByRole('heading', { name: '더 편리하게 보내세요' })).not.toBeInTheDocument()
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

  it('비로그인이면 잔액을 부르지 않고 환율표 → 송금 배너 순서로, 모든 버튼은 로그인으로 이어 준다', async () => {
    auth.state = { status: 'anonymous' }
    const api = mockFetch({ 'GET /api/v1/exchange-rates': () => ok(RATES) })
    renderRoute('/', <HomePage />, '/')

    // 로그인 입구는 상단 헤더에만 있고 홈 본문에는 로그인·회원가입 링크를 따로 두지 않는다.
    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '회원가입' })).not.toBeInTheDocument()

    // 환율 조회는 공개 API라 로그인 없이 표가 보이고, 환전하기는 로그인 뒤 해당 통화 환전 화면으로 이어진다.
    const ratesHeading = await screen.findByRole('heading', { name: '오늘의 환율' })
    expect(screen.getByRole('link', { name: 'JPY 환전하기' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fexchange%3Fcurrency%3DJPY',
    )
    expect(screen.getByText('환전 수수료는 1%입니다.')).toBeInTheDocument()
    expect(screen.queryByText(/매매기준율/)).not.toBeInTheDocument()

    // 아래에 송금 배너: 지금 송금하기(로그인 뒤 송금 화면), 환율 보기.
    const sendHeading = screen.getByRole('heading', { name: '더 편리하게 보내세요' })
    expect(ratesHeading.compareDocumentPosition(sendHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('link', { name: /지금 송금하기/ })).toHaveAttribute(
      'href',
      '/login?redirect=%2Ftransfers%2Fnew',
    )
    expect(screen.getByRole('link', { name: /환율 보기/ })).toHaveAttribute('href', '/exchange-rates')

    expect(api.calls('GET', '/api/v1/wallets/me/balances')).toHaveLength(0)
    expect(api.calls('GET', '/api/v1/exchange-rates')).toHaveLength(1)
  })

  it('비로그인이고 환율을 못 불러오면 환율표를 숨기고 송금 배너만 보여 준다', async () => {
    auth.state = { status: 'anonymous' }
    const api = mockFetch({ 'GET /api/v1/exchange-rates': () => fail(503, 'COMMON_SERVICE_UNAVAILABLE') })
    renderRoute('/', <HomePage />, '/')

    await vi.waitFor(() => expect(api.calls('GET', '/api/v1/exchange-rates')).toHaveLength(1))
    expect(screen.getByRole('link', { name: /지금 송금하기/ })).toHaveAttribute(
      'href',
      '/login?redirect=%2Ftransfers%2Fnew',
    )
    expect(screen.queryByRole('heading', { name: '오늘의 환율' })).not.toBeInTheDocument()
  })
})
