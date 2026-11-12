import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fail, mockFetch, networkError, ok, type RouteHandler } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { AdminOverdueRefundListPage } from './AdminOverdueRefundListPage'
import { AdminPaymentDetailPage } from './AdminPaymentDetailPage'

const MERCHANT_ID = '9b2f3c1e-8a47-4d55-b0c2-7e1f6a9d3b10'
const PAYMENT_ID = 'c7d4e2a9-5b13-4f8e-9a61-0d2b7c8e4f35'
const USER_ID = '3f1e2d4c-5b6a-4789-8a0b-1c2d3e4f5a6b'
const DETAIL = `GET /api/v1/payments/merchants/${MERCHANT_ID}/payments/${PAYMENT_ID}`
const REFUND = `/api/v1/payments/${PAYMENT_ID}/refunds`
const REJECT = `/api/v1/payments/${PAYMENT_ID}/refund-request/reject`

function payment(overrides: Record<string, unknown> = {}) {
  return {
    paymentId: PAYMENT_ID,
    status: 'REFUND_REQUESTED',
    amount: 5000,
    currency: 'KRW',
    merchantName: 'Cafe',
    paymentInfo: 'coffee',
    declineReason: null,
    refunds: [],
    refundRequest: {
      result: 'REQUESTED',
      requestedAt: '2026-11-04T03:00:00Z',
      requestReason: '상품 미수령',
      processedAt: null,
      rejectReason: null,
    },
    createdAt: '2026-11-04T01:02:03Z',
    updatedAt: '2026-11-04T03:00:00Z',
    ...overrides,
  }
}

function refunded() {
  return payment({
    status: 'REFUNDED',
    refundRequest: null,
    refunds: [
      {
        refundId: 'r1',
        status: 'COMPLETED',
        amount: 5000,
        currency: 'KRW',
        reason: '상품 미수령',
        declineReason: null,
        createdAt: '2026-11-08T00:00:00Z',
        updatedAt: '2026-11-08T00:00:00Z',
      },
    ],
  })
}

function setup(routes: Record<string, RouteHandler> = {}) {
  const api = mockFetch({ [DETAIL]: () => ok(payment()), ...routes })
  renderRoute(
    '/admin/merchants/:merchantId/payments/:paymentId',
    <AdminPaymentDetailPage />,
    `/admin/merchants/${MERCHANT_ID}/payments/${PAYMENT_ID}`,
  )
  return api
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('AdminOverdueRefundListPage', () => {
  it('지연 환불 항목에서 관리자 결제 상세로 이동한다', async () => {
    mockFetch({
      'GET /api/v1/admin/payments/refund-requests/overdue': () =>
        ok({
          items: [
            {
              paymentId: PAYMENT_ID,
              userId: USER_ID,
              merchantId: MERCHANT_ID,
              amount: 5000,
              currency: 'KRW',
              requestedAt: '2026-11-04T03:00:00Z',
              requestReason: '상품 미수령',
            },
          ],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        }),
    })
    renderRoute('/admin/refund-requests/overdue', <AdminOverdueRefundListPage />, '/admin/refund-requests/overdue')

    expect(await screen.findByRole('link', { name: '상세·처리' })).toHaveAttribute(
      'href',
      `/admin/merchants/${MERCHANT_ID}/payments/${PAYMENT_ID}`,
    )
  })
})

describe('AdminPaymentDetailPage', () => {
  it('정산된 결제는 관리자도 환불할 수 없다고 안내한다', async () => {
    setup()
    expect(await screen.findByText('정산에 들어간 결제는 관리자도 환불할 수 없습니다.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '지연 환불 신청' })).toHaveAttribute('href', '/admin/refund-requests/overdue')
  })

  it('환불 실행은 Idempotency-Key를 붙여 금액·사유를 보낸다', async () => {
    const user = userEvent.setup()
    const api = setup({ [`POST ${REFUND}`]: () => ok(refunded()) })

    await user.click(await screen.findByRole('button', { name: '환불 실행' }))
    expect(screen.getByLabelText(/^환불 금액/)).toHaveValue('5000')
    expect(screen.getByLabelText(/^환불 사유/)).toHaveValue('상품 미수령')
    await user.click(screen.getByRole('button', { name: '환불 실행' }))

    expect(await screen.findByText('환불을 실행했습니다.')).toBeInTheDocument()
    const [request] = api.calls('POST', REFUND)
    expect(request?.body).toEqual({ amount: 5000, reason: '상품 미수령' })
    expect(request?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(screen.queryByRole('button', { name: '환불 실행' })).not.toBeInTheDocument()
  })

  it('응답을 받지 못하면 다시 시도할 때 같은 키를 쓴다', async () => {
    const user = userEvent.setup()
    const api = setup({
      [`POST ${REFUND}`]: (_request, index) => (index === 0 ? networkError() : ok(refunded())),
    })

    await user.click(await screen.findByRole('button', { name: '환불 실행' }))
    await user.click(screen.getByRole('button', { name: '환불 실행' }))
    await user.click(await screen.findByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('환불을 실행했습니다.')).toBeInTheDocument()
    const [first, second] = api.calls('POST', REFUND)
    expect(second?.headers['Idempotency-Key']).toBe(first?.headers['Idempotency-Key'])
    expect(second?.body).toEqual(first?.body)
  })

  it('신청 거절은 사유를 보내고 멱등성 키를 붙이지 않는다', async () => {
    const user = userEvent.setup()
    const api = setup({
      [`POST ${REJECT}`]: () =>
        ok(
          payment({
            status: 'APPROVED',
            refundRequest: {
              result: 'REJECTED',
              requestedAt: '2026-11-04T03:00:00Z',
              requestReason: '상품 미수령',
              processedAt: '2026-11-08T00:00:00Z',
              rejectReason: '배송 완료 확인',
            },
          }),
        ),
    })

    await user.click(await screen.findByRole('button', { name: '신청 거절' }))
    await user.type(screen.getByLabelText(/^거절 사유/), '  배송 완료 확인 ')
    await user.click(screen.getByRole('button', { name: '신청 거절' }))

    expect(await screen.findByText('환불 신청을 거절했습니다.')).toBeInTheDocument()
    const [request] = api.calls('POST', REJECT)
    expect(request?.body).toEqual({ reason: '배송 완료 확인' })
    expect(request?.headers['Idempotency-Key']).toBeUndefined()
    expect(screen.getByText('배송 완료 확인')).toBeInTheDocument()
  })

  it('정산에 들어간 결제라고 거절되면 환불 실행을 막고 거절만 남긴다', async () => {
    const user = userEvent.setup()
    const api = setup({
      [`POST ${REFUND}`]: () => fail(409, 'PAYMENT_ALREADY_SETTLED', '이미 정산된 결제입니다.'),
    })

    await user.click(await screen.findByRole('button', { name: '환불 실행' }))
    await user.click(screen.getByRole('button', { name: '환불 실행' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 정산에 들어간 결제라 환불할 수 없습니다.')
    expect(screen.getByText('정산에 들어간 결제는 환불할 수 없습니다. 신청 거절만 할 수 있습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '환불 실행' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '신청 거절' })).toBeInTheDocument()
    // 상태가 바뀌었을 수 있어 결제를 다시 조회한다.
    expect(api.calls('GET', DETAIL.slice(4)).length).toBeGreaterThanOrEqual(2)
  })

  it('원장이 환불을 거절하면 거절 사유를 보여 주고 다시 조회한다', async () => {
    const user = userEvent.setup()
    const api = setup({
      [`POST ${REFUND}`]: () =>
        fail(422, 'PAYMENT_REFUND_DECLINED', '환불이 거절되었습니다.', [
          { field: 'declineReason', message: '가맹점 잔액이 부족합니다.' },
        ]),
    })

    await user.click(await screen.findByRole('button', { name: '환불 실행' }))
    await user.click(screen.getByRole('button', { name: '환불 실행' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('환불이 거절되었습니다. 가맹점 잔액이 부족합니다.')
    expect(api.calls('GET', DETAIL.slice(4)).length).toBeGreaterThanOrEqual(2)
  })

  it('고객이 신청을 취소해 신청 중이 아니면 안내하고 다시 조회한다', async () => {
    const user = userEvent.setup()
    const api = setup({
      [DETAIL]: (_request, index) => ok(index === 0 ? payment() : payment({ status: 'APPROVED' })),
      [`POST ${REJECT}`]: () => fail(422, 'PAYMENT_REFUND_NOT_REQUESTED', '환불 신청 중이 아닙니다.'),
    })

    await user.click(await screen.findByRole('button', { name: '신청 거절' }))
    await user.type(screen.getByLabelText(/^거절 사유/), '중복 신청')
    await user.click(screen.getByRole('button', { name: '신청 거절' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('고객이 신청을 취소했을 수 있습니다.')
    expect(api.calls('GET', DETAIL.slice(4))).toHaveLength(2)
    expect(screen.queryByRole('button', { name: '신청 거절' })).not.toBeInTheDocument()
  })

  it('신청이 없는 결제 완료 결제는 직접 환불만 할 수 있고 Idempotency-Key를 붙인다', async () => {
    const user = userEvent.setup()
    const api = setup({
      [DETAIL]: () => ok(payment({ status: 'APPROVED', refundRequest: null })),
      [`POST ${REFUND}`]: () => ok(refunded()),
    })

    expect(await screen.findByText(/고객 환불 신청이 없는 결제입니다/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '신청 거절' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '직접 환불' }))
    expect(screen.getByText(/고객 신청 없이 관리자가 직접 환불합니다/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^환불 금액/)).toHaveValue('5000')
    expect(screen.getByLabelText(/^환불 사유/)).toHaveValue('')

    await user.click(screen.getByRole('button', { name: '환불 실행' }))
    expect(await screen.findByText('사유를 입력해 주세요.')).toBeInTheDocument()
    expect(api.calls('POST', REFUND)).toHaveLength(0)

    await user.type(screen.getByLabelText(/^환불 사유/), '가맹점 폐업')
    await user.click(screen.getByRole('button', { name: '환불 실행' }))

    expect(await screen.findByText('환불을 실행했습니다.')).toBeInTheDocument()
    const [request] = api.calls('POST', REFUND)
    expect(request?.body).toEqual({ amount: 5000, reason: '가맹점 폐업' })
    expect(request?.headers['Idempotency-Key']).toBeTruthy()
  })

  it('직접 환불이 정산된 결제라 거절되면 환불 버튼을 숨긴다', async () => {
    const user = userEvent.setup()
    setup({
      [DETAIL]: () => ok(payment({ status: 'APPROVED', refundRequest: null })),
      [`POST ${REFUND}`]: () => fail(409, 'PAYMENT_ALREADY_SETTLED', '이미 정산된 결제입니다.'),
    })

    await user.click(await screen.findByRole('button', { name: '직접 환불' }))
    await user.type(screen.getByLabelText(/^환불 사유/), '가맹점 폐업')
    await user.click(screen.getByRole('button', { name: '환불 실행' }))

    expect(await screen.findByText('정산에 들어간 결제는 환불할 수 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '직접 환불' })).not.toBeInTheDocument()
  })

  it('없는 결제면 관리자용 문구로 안내한다', async () => {
    setup({ [DETAIL]: () => fail(404, 'PAYMENT_MERCHANT_NOT_FOUND', '가맹점을 찾을 수 없습니다.') })

    expect(await screen.findByRole('alert')).toHaveTextContent('결제를 찾을 수 없습니다. 가맹점 ID와 결제 ID를 확인해 주세요.')
  })
})
