import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExchangeRate } from '../features/exchange/api'
import { formatFeeRate, RateChange, rateDirection } from '../features/exchange/rateDisplay'
import { fail, mockFetch, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { ExchangeRatePage } from './ExchangeRatePage'

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({ state: { status: 'anonymous' } }),
}))

function rate(overrides: Partial<ExchangeRate> = {}): ExchangeRate {
  return {
    currency: 'JPY',
    priceCurrency: 'KRW',
    unit: 100,
    midRate: '838.3',
    buyRate: '846.68',
    sellRate: '829.92',
    source: 'KOREAEXIM',
    rateDate: '2026-10-26',
    collectedAt: '2026-10-26T02:10:00Z',
    previousMidRate: '836.2',
    previousRateDate: '2026-10-23',
    changeAmount: '2.1',
    changeRate: '0.25',
    ...overrides,
  }
}

describe('RateChange', () => {
  it('상승은 ▲와 +, 빨간색 클래스로 표시한다', () => {
    const { container } = render(<RateChange rate={rate()} />)
    expect(screen.getByText('▲2.1 (+0.25%)')).toBeInTheDocument()
    expect(container.querySelector('.rate-change.up')).not.toBeNull()
  })

  it('하락은 ▼와 -, 파란색 클래스로 표시한다', () => {
    const { container } = render(<RateChange rate={rate({ changeAmount: '-1.31', changeRate: '-0.16' })} />)
    expect(screen.getByText('▼1.31 (-0.16%)')).toBeInTheDocument()
    expect(container.querySelector('.rate-change.down')).not.toBeNull()
  })

  it('변동이 없으면 화살표 없이 회색 클래스로 표시한다', () => {
    const { container } = render(<RateChange rate={rate({ changeAmount: '0.00', changeRate: '0' })} />)
    expect(screen.getByText('0.00 (0%)')).toBeInTheDocument()
    expect(container.querySelector('.rate-change.flat')).not.toBeNull()
  })

  it('전일 환율이 없어 null이거나 필드가 없으면 표시하지 않는다', () => {
    const empty = { previousMidRate: null, previousRateDate: null, changeAmount: null, changeRate: null }
    const { container, rerender } = render(<RateChange rate={rate(empty)} />)
    expect(container).toBeEmptyDOMElement()

    const legacy = rate()
    delete legacy.changeAmount
    delete legacy.changeRate
    rerender(<RateChange rate={legacy} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('방향과 수수료율은 문자열로만 판단·변환한다', () => {
    expect(rateDirection('-0.00')).toBe('flat')
    expect(rateDirection('+3')).toBe('up')
    expect(rateDirection('abc')).toBeNull()
    expect(formatFeeRate('0.01')).toBe('1%')
    expect(formatFeeRate('0.015')).toBe('1.5%')
    expect(formatFeeRate('0.1')).toBe('10%')
  })
})

describe('ExchangeRatePage', () => {
  it('매매기준율 옆에 전일 대비를 보여 주고 살 때·팔 때는 참고값으로 안내한다', async () => {
    mockFetch({
      'GET /api/v1/exchange-rates': () =>
        ok([
          rate(),
          rate({
            currency: 'CNY',
            unit: 1,
            midRate: '190.12',
            previousMidRate: null,
            previousRateDate: null,
            changeAmount: null,
            changeRate: null,
          }),
        ]),
    })
    renderRoute('/exchange-rates', <ExchangeRatePage />, '/exchange-rates')

    expect(await screen.findByText('▲2.1 (+0.25%)')).toBeInTheDocument()
    expect(screen.getByText(/190.12원/)).toBeInTheDocument()
    expect(document.querySelectorAll('.rate-change')).toHaveLength(1)
    expect(screen.getByText(/매매기준율에 수수료 1%가 붙습니다/)).toBeInTheDocument()
    expect(screen.getByText(/은행 고시 참고값/)).toBeInTheDocument()
  })

  it('처음 조회가 실패하면 오류와 다시 불러오기를 보여 준다', async () => {
    mockFetch({ 'GET /api/v1/exchange-rates': () => fail(503, 'COMMON_SERVICE_UNAVAILABLE', '잠시 후 다시 시도해 주세요.') })
    renderRoute('/exchange-rates', <ExchangeRatePage />, '/exchange-rates')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeInTheDocument()
  })
})
