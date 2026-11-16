import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExchangeRate } from '../features/exchange/api'
import { ExchangeRatePage } from '../pages/ExchangeRatePage'
import { ok } from '../test/fetchMock'
import { RatesProvider, useLiveRates } from './RatesProvider'
import { RateTicker } from './RateTicker'

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({ state: { status: 'anonymous' } }),
}))

const RATES_PATH = '/api/v1/exchange-rates'

function rate(source: string, midRate: string): ExchangeRate {
  return {
    currency: 'JPY',
    priceCurrency: 'KRW',
    unit: 100,
    midRate,
    buyRate: midRate,
    sellRate: midRate,
    source,
    rateDate: '2026-11-16',
    collectedAt: '2026-11-16T00:00:00Z',
  }
}

type Reply = Response | 'hang'

/** 환율 조회만 받는 fetch. 응답 순서대로 돌려주고, 'hang'이면 signal이 끊길 때까지 응답하지 않는다. */
function stubRates(replies: (index: number) => Reply) {
  let count = 0
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname
    if (path !== RATES_PATH) {
      throw new Error(`예상하지 못한 요청: ${path}`)
    }
    const reply = replies(count++)
    if (reply !== 'hang') {
      return Promise.resolve(reply)
    }
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { count: () => count }
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function renderWithProvider(withRatePage: boolean) {
  const router = createMemoryRouter([
    {
      path: '*',
      element: (
        <RatesProvider enabled>
          <RateTicker />
          {withRatePage && <ExchangeRatePage />}
        </RatesProvider>
      ),
    },
  ])
  render(<RouterProvider router={router} />)
}

const tickerValue = () => screen.getByRole('link', { name: /100 JPY = / }).getAttribute('aria-label')

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('RatesProvider', () => {
  it('공식 API 모드(KOREAEXIM)에서는 티커를 5분마다 갱신한다', async () => {
    const api = stubRates(() => ok([rate('KOREAEXIM', '900')]))
    renderWithProvider(false)
    await advance(0)
    expect(api.count()).toBe(1)

    await advance(60_000)
    expect(api.count()).toBe(1)
    await advance(240_000)
    expect(api.count()).toBe(2)
  })

  it('5초 갱신 모드(MOCK)에서는 티커도 5초마다 갱신한다', async () => {
    const api = stubRates((index) => ok([rate('MOCK', `90${index}`)]))
    renderWithProvider(false)
    await advance(0)
    expect(tickerValue()).toBe('100 JPY = 900 KRW')

    await advance(5000)
    expect(api.count()).toBe(2)
    expect(tickerValue()).toBe('100 JPY = 901 KRW')
  })

  it('환율 화면과 티커는 같은 조회 하나를 함께 써서 진입 시 한 번만 요청하고 같은 값을 보여 준다', async () => {
    const api = stubRates((index) => ok([rate('KOREAEXIM', `90${index}`)]))
    renderWithProvider(true)
    await advance(0)

    expect(api.count()).toBe(1)
    expect(tickerValue()).toBe('100 JPY = 900 KRW')
    expect(screen.getByText('100엔당 매매기준율 900원')).toBeInTheDocument()

    // 환율 화면이 열려 있으면 공식 API 모드여도 5초마다, 티커와 같은 시점에 바뀐다.
    await advance(5000)
    expect(api.count()).toBe(2)
    expect(tickerValue()).toBe('100 JPY = 901 KRW')
    expect(screen.getByText('100엔당 매매기준율 901원')).toBeInTheDocument()
  })

  it('조회가 멈추면 대기 한도 뒤 끊고 마지막 값을 유지하며, 다음 주기에 갱신을 이어 간다', async () => {
    const api = stubRates((index) => (index === 1 ? 'hang' : ok([rate('MOCK', `90${index}`)])))
    renderWithProvider(true)
    await advance(0)
    await advance(5000)
    expect(api.count()).toBe(2)

    await advance(5000)
    expect(tickerValue()).toBe('100 JPY = 900 KRW')
    expect(screen.getByText('100엔당 매매기준율 900원')).toBeInTheDocument()
    expect(screen.getByText('최신 환율을 불러오지 못해 마지막으로 받은 환율을 보여 줍니다.')).toBeInTheDocument()

    await advance(5000)
    expect(api.count()).toBe(3)
    expect(tickerValue()).toBe('100 JPY = 902 KRW')
    expect(screen.queryByText('최신 환율을 불러오지 못해 마지막으로 받은 환율을 보여 줍니다.')).not.toBeInTheDocument()
  })

  it('useLiveRates의 enabled가 false인 동안은 5초 갱신을 요청하지 않고, 켜지면 공유 조회를 5초로 당긴다', async () => {
    function LiveProbe() {
      const [enabled, setEnabled] = useState(false)
      const { data } = useLiveRates({ enabled })
      return (
        <>
          <p>{data?.[0] ? `값 ${data[0].midRate}` : '없음'}</p>
          <button type="button" onClick={() => setEnabled(true)}>
            켜기
          </button>
        </>
      )
    }
    const api = stubRates((index) => ok([rate('KOREAEXIM', `90${index}`)]))
    const router = createMemoryRouter([
      {
        path: '*',
        element: (
          <RatesProvider enabled>
            <RateTicker />
            <LiveProbe />
          </RatesProvider>
        ),
      },
    ])
    render(<RouterProvider router={router} />)
    await advance(0)
    expect(api.count()).toBe(1)
    // 꺼져 있어도 공유 값은 받는다.
    expect(screen.getByText('값 900')).toBeInTheDocument()

    await advance(5000)
    expect(api.count()).toBe(1)

    // 마지막 조회 뒤 5초가 이미 지났으므로 켜자마자 조회하고, 이후 5초마다 이어 간다.
    act(() => screen.getByRole('button', { name: '켜기' }).click())
    await advance(0)
    expect(api.count()).toBe(2)
    expect(screen.getByText('값 901')).toBeInTheDocument()
    await advance(5000)
    expect(api.count()).toBe(3)
  })
})
