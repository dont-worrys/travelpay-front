import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fail, mockFetch, ok, type RouteHandler } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { MerchantPaymentDetailPage } from './MerchantPaymentDetailPage'

const MERCHANT_ID = '9b2f3c1e-8a47-4d55-b0c2-7e1f6a9d3b10'
const PAYMENT_ID = 'c7d4e2a9-5b13-4f8e-9a61-0d2b7c8e4f35'

function refund(id: string, status: string, amount: number) {
  return {
    refundId: id,
    status,
    amount,
    currency: 'KRW',
    reason: 'size change',
    declineReason: status === 'DECLINED' ? '잔액 부족' : null,
    createdAt: '2026-11-04T02:00:00Z',
    updatedAt: '2026-11-04T02:00:00Z',
  }
}

function setup(routes: Record<string, RouteHandler> = {}) {
  const api = mockFetch({
    [`GET /api/v1/payments/merchants/${MERCHANT_ID}/payments/${PAYMENT_ID}`]: () =>
      ok({
        paymentId: PAYMENT_ID,
        status: 'REFUND_REQUESTED',
        amount: 5000,
        currency: 'KRW',
        merchantName: 'Cafe',
        paymentInfo: 'coffee',
        declineReason: null,
        // 완료 2,000 + 거절 1,000 → 거절은 빼고 남은 금액 3,000
        refunds: [refund('r1', 'COMPLETED', 2000), refund('r2', 'DECLINED', 1000)],
        refundRequest: {
          result: 'REQUESTED',
          requestedAt: '2026-11-04T03:00:00Z',
          requestReason: '남은 금액 환불',
          processedAt: null,
          rejectReason: null,
        },
        createdAt: '2026-11-04T01:02:03Z',
        updatedAt: '2026-11-04T03:00:00Z',
      }),
    ...routes,
  })
  renderRoute(
    '/merchant/:merchantId/payments/:paymentId',
    <MerchantPaymentDetailPage />,
    `/merchant/${MERCHANT_ID}/payments/${PAYMENT_ID}`,
  )
  return api
}

describe('MerchantPaymentDetailPage', () => {
  it('거절된 환불을 빼고 남은 금액을 환불 금액에 채운다', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole('button', { name: '환불 실행' }))

    expect(screen.getByLabelText(/^환불 금액/)).toHaveValue('3000')
    expect(screen.getByLabelText(/^환불 사유/)).toHaveValue('남은 금액 환불')
  })

  it('남은 금액보다 큰 환불은 보내지 않는다', async () => {
    const user = userEvent.setup()
    const api = setup()

    await user.click(await screen.findByRole('button', { name: '환불 실행' }))
    const amount = screen.getByLabelText(/^환불 금액/)
    await user.clear(amount)
    await user.type(amount, '4000')
    await user.click(screen.getByRole('button', { name: '환불 실행' }))

    expect(await screen.findByText('남은 금액(3,000원)보다 클 수 없습니다.')).toBeInTheDocument()
    expect(api.calls('POST', `/api/v1/payments/${PAYMENT_ID}/refunds`)).toHaveLength(0)
  })

  it('부분 환불을 Idempotency-Key와 함께 보내고 완료를 알린다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    const api = setup({
      [`POST /api/v1/payments/${PAYMENT_ID}/refunds`]: () =>
        ok({
          paymentId: PAYMENT_ID,
          status: 'APPROVED',
          amount: 5000,
          currency: 'KRW',
          merchantName: 'Cafe',
          paymentInfo: 'coffee',
          declineReason: null,
          refunds: [refund('r1', 'COMPLETED', 2000), refund('r2', 'DECLINED', 1000), refund('r3', 'COMPLETED', 1000)],
          refundRequest: null,
          createdAt: '2026-11-04T01:02:03Z',
          updatedAt: '2026-11-05T00:00:00Z',
        }),
    })

    await user.click(await screen.findByRole('button', { name: '환불 실행' }))
    const amount = screen.getByLabelText(/^환불 금액/)
    await user.clear(amount)
    await user.type(amount, '1000')
    await user.click(screen.getByRole('button', { name: '환불 실행' }))

    expect(await screen.findByText('환불을 실행했습니다.')).toBeInTheDocument()
    const [request] = api.calls('POST', `/api/v1/payments/${PAYMENT_ID}/refunds`)
    expect(request?.body).toEqual({ amount: 1000, reason: '남은 금액 환불' })
    expect(request?.headers['Idempotency-Key']).toBeTruthy()
    expect(screen.getByRole('link', { name: '가맹점 관리' })).toHaveAttribute('href', `/merchant/${MERCHANT_ID}`)
  })

  it('거절 사유가 비면 보내지 않고, 서버 오류 문구를 보여 준다', async () => {
    const user = userEvent.setup()
    const api = setup({
      [`POST /api/v1/payments/${PAYMENT_ID}/refund-request/reject`]: () =>
        fail(409, 'PAYMENT_REFUND_IN_PROGRESS', '처리 중'),
    })

    await user.click(await screen.findByRole('button', { name: '신청 거절' }))
    expect(screen.getByRole('button', { name: '신청 거절' })).toBeDisabled()
    await user.type(screen.getByLabelText(/^거절 사유/), '사용한 상품')
    await user.click(screen.getByRole('button', { name: '신청 거절' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('다른 환불이 처리 중입니다.')
    expect(api.calls('POST', `/api/v1/payments/${PAYMENT_ID}/refund-request/reject`)[0]?.body).toEqual({
      reason: '사용한 상품',
    })
  })

  it('가맹점 주인은 신청이 없는 결제를 환불할 수 없다', async () => {
    setup({
      [`GET /api/v1/payments/merchants/${MERCHANT_ID}/payments/${PAYMENT_ID}`]: () =>
        ok({
          paymentId: PAYMENT_ID,
          status: 'APPROVED',
          amount: 5000,
          currency: 'KRW',
          merchantName: 'Cafe',
          paymentInfo: 'coffee',
          declineReason: null,
          refunds: [],
          refundRequest: null,
          createdAt: '2026-11-04T01:02:03Z',
          updatedAt: '2026-11-04T01:02:03Z',
        }),
    })

    expect(await screen.findByRole('link', { name: '가맹점 관리' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /환불/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '신청 거절' })).not.toBeInTheDocument()
  })
})
