import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fail, mockFetch, ok } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { AdminOverdueRefundListPage } from './AdminOverdueRefundListPage'

const PAYMENT_ID = 'c7d4e2a9-5b13-4f8e-9a61-0d2b7c8e4f35'
const MERCHANT_ID = '8a9b0c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d'
const USER_ID = '3f1e2d4c-5b6a-4789-8a0b-1c2d3e4f5a6b'
const LIST = '/api/v1/admin/payments/refund-requests/overdue'

function page(items: unknown[], extra: { page?: number; totalPages?: number; totalElements?: number } = {}) {
  return { items, page: 0, size: 100, totalElements: items.length, totalPages: 1, ...extra }
}

const overdue = {
  paymentId: PAYMENT_ID,
  userId: USER_ID,
  merchantId: MERCHANT_ID,
  amount: 15000,
  currency: 'KRW',
  requestedAt: '2026-11-01T01:00:00Z',
  requestReason: '상품 미수령',
}

function renderPage(initialEntry = '/admin/refund-requests/overdue') {
  return renderRoute('/admin/refund-requests/overdue', <AdminOverdueRefundListPage />, initialEntry)
}

describe('AdminOverdueRefundListPage', () => {
  it('서버 최대 크기(100)로 조회하고, 상세·처리 링크로 관리자 결제 상세에 간다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({ [`GET ${LIST}`]: () => ok(page([overdue])) })
    const { router } = renderPage()

    expect(await screen.findByText('총 1건')).toBeInTheDocument()
    expect(screen.getByText('사유: 상품 미수령')).toBeInTheDocument()
    expect(screen.getByText(PAYMENT_ID)).toBeInTheDocument()
    expect(screen.getByText(USER_ID)).toBeInTheDocument()
    expect(api.calls('GET', LIST)[0]?.search).toBe('?page=0&size=100')

    await user.click(screen.getByRole('link', { name: '상세·처리' }))
    expect(router.state.location.pathname).toBe(`/admin/merchants/${MERCHANT_ID}/payments/${PAYMENT_ID}`)
  })

  it('신청 사유가 없으면 -로 보여 준다', async () => {
    mockFetch({ [`GET ${LIST}`]: () => ok(page([{ ...overdue, requestReason: null }])) })
    renderPage()

    expect(await screen.findByText('사유: -')).toBeInTheDocument()
  })

  it('지연된 신청이 없으면 빈 목록 안내를 보여 준다', async () => {
    mockFetch({ [`GET ${LIST}`]: () => ok(page([])) })
    renderPage()

    expect(await screen.findByText('지연된 환불 신청이 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('총 0건')).toBeInTheDocument()
  })

  it('다음·이전 페이지로 이동하며 page를 보낸다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({
      [`GET ${LIST}`]: (request) =>
        ok(
          page([overdue], {
            page: Number(new URLSearchParams(request.search).get('page')),
            totalPages: 2,
            totalElements: 101,
          }),
        ),
    })
    const { router } = renderPage()

    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByText('2 / 2')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?page=1')
    expect(api.calls('GET', LIST).at(-1)?.search).toBe('?page=1&size=100')

    await user.click(screen.getByRole('button', { name: '이전' }))
    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('403이면 관리자 전용 안내를 보여 준다', async () => {
    mockFetch({ [`GET ${LIST}`]: () => fail(403, 'COMMON_FORBIDDEN') })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('관리자만 사용할 수 있습니다.')
  })
})
