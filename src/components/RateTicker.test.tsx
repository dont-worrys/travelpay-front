import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { fail, mockFetch, ok } from '../test/fetchMock'
import { RateTicker } from './RateTicker'

function rate(currency: string, unit: number, midRate: string) {
  return {
    currency,
    priceCurrency: 'KRW',
    unit,
    midRate,
    buyRate: midRate,
    sellRate: midRate,
    source: 'MOCK',
    rateDate: '2026-11-12',
    collectedAt: '2026-11-12T00:00:00Z',
  }
}

function renderTicker() {
  const router = createMemoryRouter([{ path: '*', element: <RateTicker /> }])
  render(<RouterProvider router={router} />)
}

describe('RateTicker', () => {
  it('고른 통화의 매매기준율을 보여 주고 환율 화면으로 연결한다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({
      'GET /api/v1/exchange-rates': () => ok([rate('JPY', 100, '900.2'), rate('CNY', 1, '190.12')]),
    })
    renderTicker()

    const value = await screen.findByRole('link', { name: '100 JPY = 900.2 KRW' })
    expect(value).toHaveAttribute('href', '/exchange-rates')

    await user.selectOptions(screen.getByLabelText('환율 통화'), 'CNY')
    expect(screen.getByRole('link', { name: '1 CNY = 190.12 KRW' })).toBeInTheDocument()
    // 통화를 바꿔도 다시 조회하지 않는다(5분 간격).
    expect(api.calls('GET', '/api/v1/exchange-rates')).toHaveLength(1)
  })

  it('조회에 실패하면 아무것도 그리지 않는다', async () => {
    const api = mockFetch({ 'GET /api/v1/exchange-rates': () => fail(503, 'COMMON_SERVICE_UNAVAILABLE') })
    renderTicker()

    await waitFor(() => expect(api.calls('GET', '/api/v1/exchange-rates')).toHaveLength(1))
    expect(screen.queryByLabelText('환율 통화')).not.toBeInTheDocument()
  })
})

