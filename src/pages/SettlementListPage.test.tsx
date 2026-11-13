import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { formatAmount } from '../lib/money'
import { fail, mockFetch, networkError, ok, type RouteHandler } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { SettlementListPage } from './SettlementListPage'

const MERCHANT_ID = '9b2f3c1e-8a47-4d55-b0c2-7e1f6a9d3b10'
const BASE = `/api/v1/payments/merchants/${MERCHANT_ID}/settlements`
const SETTLEMENT_ID = 'cccccccc-0000-4000-8000-000000000001'

function preview(overrides: Record<string, unknown> = {}) {
  return {
    currency: 'KRW',
    available: { count: 1200, amount: 1_500_000 },
    nextSettlement: { count: 1000, amount: 1_200_000 },
    waiting: { count: 4, amount: 40_000 },
    nextAvailableAt: null,
    ...overrides,
  }
}

function settlement(id: string, overrides: Record<string, unknown> = {}) {
  return {
    settlementId: id,
    merchantId: MERCHANT_ID,
    status: 'PAID',
    amount: 50000,
    currency: 'KRW',
    ownerUserId: '11111111-1111-4111-8111-111111111111',
    paymentCount: 3,
    cutoffAt: '2026-11-12T03:00:00Z',
    ledgerTransactionId: null,
    failureReason: null,
    paidAt: '2026-11-12T03:00:01Z',
    createdAt: '2026-11-12T03:00:00Z',
    updatedAt: '2026-11-12T03:00:02Z',
    ...overrides,
  }
}

const CREATED = () => ok(settlement(SETTLEMENT_ID), 201)

function setup(routes: Record<string, RouteHandler> = {}) {
  const api = mockFetch({
    [`GET ${BASE}/preview`]: () => ok(preview()),
    [`GET ${BASE}`]: () =>
      ok({ items: [settlement(SETTLEMENT_ID)], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ...routes,
  })
  renderRoute('/merchant/:merchantId/settlements', <SettlementListPage />, `/merchant/${MERCHANT_ID}/settlements`)
  return api
}

describe('SettlementListPage', () => {
  it('정산 가능 금액·이번 요청 몫·대기 금액과 정산 내역 링크를 보여 준다', async () => {
    setup()

    expect(await screen.findByText(formatAmount(1_500_000, 'KRW'))).toBeInTheDocument()
    expect(screen.getByText('1200건')).toBeInTheDocument()
    // 1,000건 한도로 나머지가 다음 요청으로 넘어가면 이번 요청 몫을 따로 보여 준다.
    expect(screen.getByText(/나머지는 다음 요청에서 정산/)).toHaveTextContent(formatAmount(1_200_000, 'KRW'))
    expect(screen.getByText(`${formatAmount(40_000, 'KRW')} (4건)`)).toBeInTheDocument()

    const link = await screen.findByRole('link', { name: /3건/ })
    expect(link).toHaveAttribute('href', `/merchant/${MERCHANT_ID}/settlements/${SETTLEMENT_ID}`)
    expect(link).toHaveTextContent('입금 완료')
  })

  it('정산할 결제가 없으면 정산 요청 버튼을 막는다', async () => {
    setup({ [`GET ${BASE}/preview`]: () => ok(preview({ available: { count: 0, amount: 0 }, nextSettlement: { count: 0, amount: 0 } })) })

    expect(await screen.findByText('0건')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '정산 요청' })).toBeDisabled()
  })

  it('확인 후 본문 없이 멱등성 키를 붙여 요청하고 상세로 이동한다', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = setup({ [`POST ${BASE}`]: CREATED })

    await user.click(await screen.findByRole('button', { name: '정산 요청' }))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('(1000건)'))
    const [request] = api.calls('POST', BASE)
    expect(request?.body).toBeUndefined()
    expect(request?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('연결 실패·5xx로 결과를 모르면 확인 없이 같은 키로 다시 보낸다', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = setup({
      [`POST ${BASE}`]: (_request, index) => {
        if (index === 0) {
          return networkError()
        }
        if (index === 1) {
          return fail(503, 'COMMON_SERVICE_UNAVAILABLE')
        }
        return CREATED()
      },
    })

    await user.click(await screen.findByRole('button', { name: '정산 요청' }))
    expect(await screen.findByText(/정산이 이미 요청되었을 수 있습니다/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(api.calls('POST', BASE)).toHaveLength(2))
    await user.click(await screen.findByRole('button', { name: '다시 시도' }))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledTimes(1)
    const keys = api.calls('POST', BASE).map((request) => request.headers['Idempotency-Key'])
    expect(keys).toHaveLength(3)
    expect(new Set(keys).size).toBe(1)
  })

  it('4xx로 거절되면 문구를 보여 주고 금액을 다시 불러오며, 다음 요청은 새 키를 쓴다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = setup({
      [`POST ${BASE}`]: (_request, index) =>
        index === 0 ? fail(422, 'PAYMENT_NO_SETTLEMENT_TARGET') : CREATED(),
    })

    await user.click(await screen.findByRole('button', { name: '정산 요청' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('지금 정산할 결제가 없습니다.')
    await waitFor(() => expect(api.calls('GET', `${BASE}/preview`)).toHaveLength(2))
    expect(screen.queryByText(/정산이 이미 요청되었을 수 있습니다/)).not.toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: '정산 요청' }))
    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    const [first, second] = api.calls('POST', BASE).map((request) => request.headers['Idempotency-Key'])
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(second).not.toBe(first)
  })
})
