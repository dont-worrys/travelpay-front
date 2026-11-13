import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fail, mockFetch, ok } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { AdminReviewListPage } from './AdminReviewListPage'

const PAYMENT_ID = 'c7d4e2a9-5b13-4f8e-9a61-0d2b7c8e4f35'
const MERCHANT_ID = '8a9b0c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d'
const ORDER_ID = 'e9f6a4c1-7d35-4b0a-9c83-2f4d9e0a6b57'
const PAYMENTS = '/api/v1/admin/payments/manual-reviews'
const EXCHANGES = '/api/v1/admin/exchanges/manual-reviews'

function page(items: unknown[], extra: { page?: number; totalPages?: number } = {}) {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1, ...extra }
}

const paymentReview = {
  paymentId: PAYMENT_ID,
  userId: '3f1e2d4c-5b6a-4789-8a0b-1c2d3e4f5a6b',
  merchantId: MERCHANT_ID,
  amount: 12000,
  currency: 'KRW',
  reviewReason: 'RETRY_EXHAUSTED',
  attemptCount: 3,
  createdAt: '2026-11-10T01:00:00Z',
}

function renderPage(initialEntry = '/admin/reviews') {
  return renderRoute('/admin/reviews', <AdminReviewListPage />, initialEntry)
}

describe('AdminReviewListPage', () => {
  it('결제 탭이 기본이고, 항목을 누르면 처리 대기 상세로 간다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({ [`GET ${PAYMENTS}`]: () => ok(page([paymentReview])) })
    const { router } = renderPage()

    const link = await screen.findByRole('link', { name: new RegExp(`가맹점 ${MERCHANT_ID.slice(0, 8)}`) })
    expect(link).toHaveTextContent('결과 확인 재시도 한도 초과')
    expect(link).toHaveTextContent('시도 3회')
    expect(screen.getByRole('tab', { name: '결제' })).toHaveAttribute('aria-selected', 'true')
    expect(api.calls('GET', PAYMENTS)[0]?.search).toBe('?page=0&size=20')

    await user.click(link)
    expect(router.state.location.pathname).toBe(`/admin/reviews/payment/${PAYMENT_ID}`)
  })

  it('사유를 고르면 reviewReason으로 조회하고, 탭을 바꾸면 사유를 비운다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({
      [`GET ${PAYMENTS}`]: () => ok(page([paymentReview])),
      [`GET ${EXCHANGES}`]: () => ok(page([])),
    })
    const { router } = renderPage()
    await screen.findByRole('link', { name: new RegExp(MERCHANT_ID.slice(0, 8)) })

    await user.selectOptions(screen.getByLabelText('멈춘 사유'), 'LEDGER_REQUEST_NOT_ACCEPTED')
    await screen.findByRole('link', { name: new RegExp(MERCHANT_ID.slice(0, 8)) })
    expect(router.state.location.search).toBe('?kind=payment&reason=LEDGER_REQUEST_NOT_ACCEPTED')
    expect(api.calls('GET', PAYMENTS).at(-1)?.search).toBe('?reviewReason=LEDGER_REQUEST_NOT_ACCEPTED&page=0&size=20')

    await user.click(screen.getByRole('tab', { name: '환전' }))
    expect(await screen.findByText('처리를 기다리는 환전 주문이 없습니다.')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?kind=exchange')
    expect(api.calls('GET', EXCHANGES)[0]?.search).toBe('?page=0&size=20')
  })

  it('주소의 사유가 그 탭의 사유가 아니면 거르지 않고 조회한다', async () => {
    const api = mockFetch({ [`GET ${EXCHANGES}`]: () => ok(page([])) })
    renderPage('/admin/reviews?kind=exchange&reason=RETRY_EXHAUSTED')

    await screen.findByText('처리를 기다리는 환전 주문이 없습니다.')
    expect(api.calls('GET', EXCHANGES)[0]?.search).toBe('?page=0&size=20')
    expect(screen.getByLabelText('멈춘 사유')).toHaveValue('')
  })

  it('다음·이전 페이지로 이동하며 page를 보낸다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({
      [`GET ${EXCHANGES}`]: (request) => {
        const current = Number(new URLSearchParams(request.search).get('page'))
        return ok(
          page(
            [
              {
                orderId: ORDER_ID,
                type: 'EXCHANGE',
                fromAmount: '10000',
                fromCurrency: 'KRW',
                toAmount: '7.50',
                toCurrency: 'USD',
                reviewReason: 'LEDGER_CONFLICT',
                ledgerCheckCount: 2,
                createdAt: '2026-11-10T01:00:00Z',
              },
            ],
            { page: current, totalPages: 2 },
          ),
        )
      },
    })
    const { router } = renderPage('/admin/reviews?kind=exchange')

    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /원장 확인 2회/ })).toHaveAttribute(
      'href',
      `/admin/reviews/exchange/${ORDER_ID}`,
    )
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByText('2 / 2')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?kind=exchange&page=1')
    expect(api.calls('GET', EXCHANGES).at(-1)?.search).toBe('?page=1&size=20')
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '이전' }))
    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?kind=exchange')
  })

  it('403이면 관리자 전용 안내를 보여 준다', async () => {
    mockFetch({ [`GET ${PAYMENTS}`]: () => fail(403, 'COMMON_FORBIDDEN') })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('관리자만 사용할 수 있습니다.')
  })
})
