import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fail, mockFetch, ok, type RouteHandler } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { AdminMerchantPaymentListPage } from './AdminMerchantPaymentListPage'

const MERCHANT_ID = '9b2f3c1e-8a47-4d55-b0c2-7e1f6a9d3b10'
const PAYMENT_ID = 'c7d4e2a9-5b13-4f8e-9a61-0d2b7c8e4f35'
const LIST = `/api/v1/payments/merchants/${MERCHANT_ID}/payments`

function page() {
  return {
    items: [
      {
        paymentId: PAYMENT_ID,
        status: 'APPROVED',
        amount: 5000,
        refundedAmount: 1000,
        currency: 'KRW',
        paymentInfo: 'coffee',
        createdAt: '2026-11-04T01:02:03Z',
      },
    ],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  }
}

function setup(initialEntry = '/admin/payments', handler: RouteHandler = () => ok(page())) {
  const api = mockFetch({ [`GET ${LIST}`]: handler })
  const view = renderRoute('/admin/payments', <AdminMerchantPaymentListPage />, initialEntry)
  return { api, ...view }
}

describe('AdminMerchantPaymentListPage', () => {
  it('가맹점 ID 형식이 틀리면 조회하지 않는다', async () => {
    const user = userEvent.setup()
    const { api } = setup()

    await user.type(screen.getByLabelText(/^가맹점 ID/), 'not-a-uuid')
    await user.click(screen.getByRole('button', { name: '조회' }))

    expect(screen.getByText('가맹점 ID(UUID)를 입력해 주세요.')).toBeInTheDocument()
    expect(api.calls('GET', LIST)).toHaveLength(0)
  })

  it('가맹점 ID로 결제 목록을 불러오고 관리자 결제 상세로 연결한다', async () => {
    const user = userEvent.setup()
    const { api, router } = setup()

    await user.type(screen.getByLabelText(/^가맹점 ID/), MERCHANT_ID)
    await user.click(screen.getByRole('button', { name: '조회' }))

    const link = await screen.findByRole('link', { name: /coffee/ })
    expect(link).toHaveAttribute('href', `/admin/merchants/${MERCHANT_ID}/payments/${PAYMENT_ID}`)
    expect(screen.getByText(/환불 1,000원/)).toBeInTheDocument()
    expect(router.state.location.search).toBe(`?merchantId=${MERCHANT_ID}`)
    expect(api.calls('GET', LIST)[0]?.search).toBe('?page=0&size=20')
  })

  it('상태 탭을 고르면 그 상태로 다시 조회한다', async () => {
    const user = userEvent.setup()
    const { api } = setup(`/admin/payments?merchantId=${MERCHANT_ID}`)
    await screen.findByRole('link', { name: /coffee/ })

    await user.click(screen.getByRole('tab', { name: '결제 완료' }))

    await screen.findByRole('link', { name: /coffee/ })
    expect(api.calls('GET', LIST).at(-1)?.search).toBe('?status=APPROVED&page=0&size=20')
  })

  it('결제 ID까지 입력하면 결제 상세로 바로 간다', async () => {
    const user = userEvent.setup()
    const { api, router } = setup()

    await user.type(screen.getByLabelText(/^가맹점 ID/), MERCHANT_ID)
    await user.type(screen.getByLabelText(/^결제 ID/), PAYMENT_ID)
    await user.click(screen.getByRole('button', { name: '조회' }))

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/admin/merchants/${MERCHANT_ID}/payments/${PAYMENT_ID}`)
    expect(api.calls('GET', LIST)).toHaveLength(0)
  })

  it('없는 가맹점이면 가맹점 ID를 확인하라고 안내한다', async () => {
    setup(`/admin/payments?merchantId=${MERCHANT_ID}`, () => fail(404, 'PAYMENT_MERCHANT_NOT_FOUND', '없음'))

    expect(await screen.findByRole('alert')).toHaveTextContent('가맹점을 찾을 수 없습니다. 가맹점 ID를 확인해 주세요.')
  })
})
