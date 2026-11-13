import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fail, mockFetch, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { ChargeDetailPage } from './ChargeDetailPage'

const ID = 'cccccccc-0000-4000-8000-000000000001'
const PATH = `/api/v1/charges/${ID}`

function charge(overrides: Record<string, unknown> = {}) {
  return {
    chargeId: ID,
    status: 'COMPLETED',
    amount: 50000,
    currency: 'KRW',
    bankCode: '004',
    accountNumberMask: '****1234',
    failureCode: null,
    failureMessage: null,
    createdAt: '2026-11-10T01:00:00Z',
    updatedAt: '2026-11-10T01:00:05Z',
    ...overrides,
  }
}

function renderDetail() {
  renderRoute('/wallet/charges/:chargeId', <ChargeDetailPage />, `/wallet/charges/${ID}`)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ChargeDetailPage', () => {
  it('완료된 충전은 금액·상태·출금 계좌를 보여 주고 다시 조회하지 않는다', async () => {
    const api = mockFetch({ [`GET ${PATH}`]: () => ok(charge()) })
    renderDetail()

    expect(await screen.findByText('+50,000원')).toBeInTheDocument()
    expect(screen.getByText('완료')).toHaveClass('badge')
    expect(screen.getByText('KB국민은행 ****1234')).toBeInTheDocument()
    expect(screen.queryByText('결과를 자동으로 확인하는 중입니다…')).not.toBeInTheDocument()
    expect(api.calls('GET', PATH)).toHaveLength(1)
  })

  it('실패한 충전은 서버가 준 실패 문구를 오류로 보여 준다', async () => {
    mockFetch({
      [`GET ${PATH}`]: () =>
        ok(charge({ status: 'FAILED', failureCode: 'BANK_INSUFFICIENT_FUNDS', failureMessage: '계좌 잔액이 부족합니다.' })),
    })
    renderDetail()

    expect(await screen.findByText('실패')).toHaveClass('badge')
    expect(screen.getByText('계좌 잔액이 부족합니다.')).toHaveClass('error')
  })

  it('운영자 확인 중인 충전은 다시 충전하지 말라고 안내하고 자동 확인을 하지 않는다', async () => {
    mockFetch({ [`GET ${PATH}`]: () => ok(charge({ status: 'MANUAL_REVIEW' })) })
    renderDetail()

    expect(await screen.findByText('확인 중')).toHaveClass('badge')
    expect(
      screen.getByText('자동 처리가 멈춰 운영자가 확인하고 있습니다. 다시 충전하지 말고 기다려 주세요.'),
    ).toHaveClass('hint')
    expect(screen.queryByText('결과를 자동으로 확인하는 중입니다…')).not.toBeInTheDocument()
  })

  it('처리 중인 충전은 2초 뒤 다시 조회해 완료로 바뀐 결과를 보여 준다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const api = mockFetch({
      [`GET ${PATH}`]: (_request, index) => ok(charge({ status: index === 0 ? 'BANK_PROCESSING' : 'COMPLETED' })),
    })
    renderDetail()

    expect(await screen.findByText('은행에서 출금하고 있습니다.')).toBeInTheDocument()
    expect(screen.getByText('결과를 자동으로 확인하는 중입니다…')).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(2000))

    expect(await screen.findByText('완료')).toHaveClass('badge')
    expect(screen.queryByText('결과를 자동으로 확인하는 중입니다…')).not.toBeInTheDocument()
    expect(api.calls('GET', PATH)).toHaveLength(2)
  })

  it('없는 충전(404 CHARGE_NOT_FOUND)이면 서버 문구와 충전 내역 링크를 보여 준다', async () => {
    mockFetch({ [`GET ${PATH}`]: () => fail(404, 'CHARGE_NOT_FOUND', '충전 내역을 찾을 수 없습니다.') })
    renderDetail()

    expect(await screen.findByRole('alert')).toHaveTextContent('충전 내역을 찾을 수 없습니다.')
    expect(screen.getByRole('link', { name: '충전 내역으로' })).toHaveAttribute('href', '/wallet/charges')
  })
})
