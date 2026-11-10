import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { mockFetch, ok } from '../../test/fetchMock'
import { AdminResolutionDetailPage } from './AdminResolutionDetailPage'
import { AdminResolutionListPage } from './AdminResolutionListPage'

const ADMIN_ID = '252cd4aa-5666-4f0b-b62d-ef08a070f62e'
const PAYMENT_ID = 'c7d4e2a9-5b13-4f8e-9a61-0d2b7c8e4f35'
const REFUND_ID = 'd8e5f3b0-6c24-4a9f-8b72-1e3c8d9f5a46'
const ORDER_ID = 'e9f6a4c1-7d35-4b0a-9c83-2f4d9e0a6b57'
const LEDGER_TX = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

function page(items: unknown[]) {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1 }
}

const refundRecord = {
  resolutionId: '10000000-0000-4000-8000-000000000001',
  paymentId: PAYMENT_ID,
  refundId: REFUND_ID,
  reviewReason: 'RETRY_EXHAUSTED',
  ledgerStatus: 'POSTED',
  ledgerTransactionId: LEDGER_TX,
  toStatus: 'COMPLETED',
  actorId: ADMIN_ID,
  description: '재시도 한도 초과, 원장 반영 확인 → 환불 완료',
  memo: '원장 확인',
  createdAt: '2026-11-10T02:00:00Z',
}

const exchangeRecord = {
  historyId: '20000000-0000-4000-8000-000000000002',
  orderId: ORDER_ID,
  actorId: ADMIN_ID,
  fromStatus: 'MANUAL_REVIEW',
  toStatus: 'FAILED',
  resolutionReason: 'LEDGER_NOT_FOUND',
  reviewReason: 'LEDGER_UNCONFIRMED_TOO_LONG',
  failureReason: 'NOT_PROCESSED',
  ledgerTransactionId: null,
  memo: null,
  resolvedAt: '2026-11-10T03:00:00Z',
}

function renderAdmin(initialEntry: string) {
  const router = createMemoryRouter(
    [
      { path: '/admin/resolutions', element: <AdminResolutionListPage /> },
      { path: '/admin/resolutions/:domain/:targetId', element: <AdminResolutionDetailPage /> },
    ],
    { initialEntries: [initialEntry] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('처리 기록', () => {
  it('도메인별 필터를 API 파라미터로 보내고, 기록을 눌러 대상의 처리 기록 상세로 간다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({
      'GET /api/v1/admin/payments/resolutions': () => ok(page([refundRecord])),
      'GET /api/v1/admin/exchanges/resolutions': () => ok(page([exchangeRecord])),
    })
    const router = renderAdmin('/admin/resolutions')

    expect(await screen.findByText(`환불 ${REFUND_ID.slice(0, 8)}`)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('종류'), 'REFUND')
    await user.type(screen.getByLabelText('처리 담당자 ID'), ADMIN_ID)
    await user.type(screen.getByLabelText(/결제 ID/), PAYMENT_ID)
    await user.click(screen.getByRole('button', { name: '검색' }))

    await screen.findByText(`환불 ${REFUND_ID.slice(0, 8)}`)
    const last = api.calls('GET', '/api/v1/admin/payments/resolutions').at(-1)
    const params = new URLSearchParams(last?.search)
    expect(params.get('type')).toBe('REFUND')
    expect(params.get('actorId')).toBe(ADMIN_ID)
    expect(params.get('paymentId')).toBe(PAYMENT_ID)

    // 환전 탭: 결제 전용 조건(type·결제 ID)은 빼고, 처리 담당자는 유지한다.
    await user.click(screen.getByRole('tab', { name: '환전' }))
    expect(await screen.findByText(`환전 주문 ${ORDER_ID.slice(0, 8)}`)).toBeInTheDocument()
    expect(screen.getByText(/실패 \(처리 시간이 초과되어/)).toBeInTheDocument()
    const exchangeParams = new URLSearchParams(api.calls('GET', '/api/v1/admin/exchanges/resolutions')[0]?.search)
    expect(exchangeParams.get('actorId')).toBe(ADMIN_ID)
    expect(exchangeParams.has('orderId')).toBe(false)
    expect(exchangeParams.has('type')).toBe(false)

    await user.click(screen.getByRole('link', { name: new RegExp(ORDER_ID.slice(0, 8)) }))
    expect(router.state.location.pathname).toBe(`/admin/resolutions/exchange/${ORDER_ID}`)
    expect(await screen.findByText('원장 기록 없음')).toBeInTheDocument()
    const detailParams = new URLSearchParams(api.calls('GET', '/api/v1/admin/exchanges/resolutions').at(-1)?.search)
    expect(detailParams.get('orderId')).toBe(ORDER_ID)
  })

  it('처리 기록 상세는 처리 담당자·처리 결과·원장 거래를 모두 보여 준다', async () => {
    mockFetch({ 'GET /api/v1/admin/payments/resolutions': () => ok(page([refundRecord])) })
    renderAdmin(`/admin/resolutions/payment/${PAYMENT_ID}`)

    expect(await screen.findByText(ADMIN_ID)).toBeInTheDocument()
    expect(screen.getByText(REFUND_ID)).toBeInTheDocument()
    expect(screen.getByText(LEDGER_TX)).toBeInTheDocument()
    expect(screen.getByText('원장 확인')).toBeInTheDocument()
  })
})
