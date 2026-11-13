import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fail, mockFetch, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { PaymentDetailPage } from './PaymentDetailPage'

const ID = 'dddddddd-0000-4000-8000-000000000001'
const PATH = `/api/v1/payments/${ID}`

function payment(overrides: Record<string, unknown> = {}) {
  return {
    paymentId: ID,
    status: 'APPROVED',
    amount: 12000,
    currency: 'KRW',
    merchantName: '여행카페',
    paymentInfo: '아메리카노 2잔',
    declineReason: null,
    refunds: [],
    refundRequest: null,
    createdAt: '2026-11-10T01:00:00Z',
    updatedAt: '2026-11-10T01:00:00Z',
    ...overrides,
  }
}

function refundRequest(overrides: Record<string, unknown> = {}) {
  return {
    result: 'REQUESTED',
    requestedAt: '2026-11-11T01:00:00Z',
    requestReason: '사이즈 변경',
    processedAt: null,
    rejectReason: null,
    ...overrides,
  }
}

function renderDetail() {
  renderRoute('/payments/:paymentId', <PaymentDetailPage />, `/payments/${ID}`)
}

describe('PaymentDetailPage', () => {
  it('거절된 결제는 거절 배지와 거절 사유를 보여 주고 환불 신청 버튼을 숨긴다', async () => {
    mockFetch({
      [`GET ${PATH}`]: () => ok(payment({ status: 'DECLINED', declineReason: '잔액이 부족합니다.' })),
    })
    renderDetail()

    expect(await screen.findByText('-12,000원')).toBeInTheDocument()
    expect(screen.getByText('거절')).toHaveClass('badge')
    expect(screen.getByText('결제가 거절되었습니다. 잔액이 빠지지 않았습니다.')).toBeInTheDocument()
    expect(screen.getByText('거절 사유: 잔액이 부족합니다.')).toHaveClass('error')
    expect(screen.queryByRole('button', { name: '환불 신청' })).not.toBeInTheDocument()
  })

  it('부분 환불된 결제는 완료된 환불만 더한 환불받은 금액과 환불 내역을 보여 준다', async () => {
    mockFetch({
      [`GET ${PATH}`]: () =>
        ok(
          payment({
            amount: 1050,
            currency: 'CNY',
            refunds: [
              {
                refundId: 'r1',
                status: 'COMPLETED',
                amount: 300,
                currency: 'CNY',
                reason: '일부 품절',
                declineReason: null,
                createdAt: '2026-11-11T01:00:00Z',
                updatedAt: '2026-11-11T01:00:00Z',
              },
              {
                refundId: 'r2',
                status: 'DECLINED',
                amount: 200,
                currency: 'CNY',
                reason: null,
                declineReason: '가맹점 잔액 부족',
                createdAt: '2026-11-11T02:00:00Z',
                updatedAt: '2026-11-11T02:00:00Z',
              },
            ],
          }),
        ),
    })
    renderDetail()

    expect(await screen.findByText('-10.50위안')).toBeInTheDocument()
    expect(screen.getByText('환불받은 금액').nextElementSibling).toHaveTextContent('3.00위안')
    expect(screen.getByText('+3.00위안')).toBeInTheDocument()
    expect(screen.getByText('+2.00위안')).toBeInTheDocument()
    expect(screen.getByText(/거절 사유: 가맹점 잔액 부족/)).toBeInTheDocument()
  })

  it('승인된 결제에 환불을 신청하면 다듬은 사유만 멱등성 키 없이 보내고 신청 상태로 바꾼다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({
      [`GET ${PATH}`]: () => ok(payment()),
      [`POST ${PATH}/refund-request`]: () => ok(payment({ status: 'REFUND_REQUESTED', refundRequest: refundRequest() })),
    })
    renderDetail()

    await user.click(await screen.findByRole('button', { name: '환불 신청' }))
    await user.type(screen.getByLabelText(/환불 사유/), '  사이즈 변경  ')
    await user.click(screen.getByRole('button', { name: '환불 신청' }))

    expect(await screen.findByText('가맹점 처리 대기')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '환불 신청 취소' })).toBeInTheDocument()
    const [call] = api.calls('POST', `${PATH}/refund-request`)
    expect(call?.body).toEqual({ reason: '사이즈 변경' })
    expect(call?.headers['Idempotency-Key']).toBeUndefined()
  })

  it('가맹점이 이미 환불 중(PAYMENT_REFUND_IN_PROGRESS)이면 안내하고 결제를 다시 조회한다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({
      [`GET ${PATH}`]: (_request, index) => ok(payment({ status: index === 0 ? 'APPROVED' : 'REFUNDED' })),
      [`POST ${PATH}/refund-request`]: () => fail(409, 'PAYMENT_REFUND_IN_PROGRESS', '환불 처리 중'),
    })
    renderDetail()

    await user.click(await screen.findByRole('button', { name: '환불 신청' }))
    await user.type(screen.getByLabelText(/환불 사유/), '단순 변심')
    await user.click(screen.getByRole('button', { name: '환불 신청' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('가맹점이 이미 환불을 처리하고 있습니다.')
    expect(await screen.findByText('환불 완료')).toHaveClass('badge')
    expect(screen.queryByRole('button', { name: '환불 신청' })).not.toBeInTheDocument()
    expect(api.calls('GET', PATH)).toHaveLength(2)
  })

  it('환불 신청 중인 결제는 확인 후 DELETE로 신청을 취소한다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = mockFetch({
      [`GET ${PATH}`]: () => ok(payment({ status: 'REFUND_REQUESTED', refundRequest: refundRequest() })),
      [`DELETE ${PATH}/refund-request`]: () =>
        ok(payment({ refundRequest: refundRequest({ result: 'CANCELLED', processedAt: '2026-11-11T03:00:00Z' }) })),
    })
    renderDetail()

    await user.click(await screen.findByRole('button', { name: '환불 신청 취소' }))

    expect(await screen.findByText('신청 취소')).toBeInTheDocument()
    expect(screen.getByText('결제 완료')).toHaveClass('badge')
    expect(api.calls('DELETE', `${PATH}/refund-request`)).toHaveLength(1)
  })

  it('없는 결제(404 PAYMENT_NOT_FOUND)이면 서버 문구와 결제 내역 링크를 보여 준다', async () => {
    mockFetch({ [`GET ${PATH}`]: () => fail(404, 'PAYMENT_NOT_FOUND', '결제를 찾을 수 없습니다.') })
    renderDetail()

    expect(await screen.findByRole('alert')).toHaveTextContent('결제를 찾을 수 없습니다.')
    expect(screen.getByRole('link', { name: '결제 내역으로' })).toHaveAttribute('href', '/payments')
  })
})
