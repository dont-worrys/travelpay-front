import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fail, mockFetch, networkError, ok } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { AdminReviewDetailPage } from './AdminReviewDetailPage'

const PAYMENT_ID = 'c7d4e2a9-5b13-4f8e-9a61-0d2b7c8e4f35'
const LEDGER_TX = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const DETAIL_PATH = `/api/v1/admin/payments/${PAYMENT_ID}`
const RESOLVE_PATH = `${DETAIL_PATH}/resolve`

function paymentDetail(overrides: Record<string, unknown> = {}) {
  return {
    paymentId: PAYMENT_ID,
    userId: '11111111-1111-4111-8111-111111111111',
    merchantId: '9b2f3c1e-8a47-4d55-b0c2-7e1f6a9d3b10',
    merchantName: 'Cafe',
    amount: 10000,
    currency: 'KRW',
    reviewReason: 'RETRY_EXHAUSTED',
    attemptCount: 5,
    createdAt: '2026-11-04T01:02:03Z',
    updatedAt: '2026-11-04T01:10:00Z',
    ledgerLookupFailed: false,
    ledger: { status: 'POSTED', transactionId: LEDGER_TX, declineReason: null },
    expected: {
      resolvable: true,
      status: 'APPROVED',
      paymentStatus: 'APPROVED',
      description: '재시도 한도 초과, 원장 반영 확인 → 결제 승인',
    },
    ...overrides,
  }
}

function render() {
  renderRoute('/admin/reviews/:kind/:targetId', <AdminReviewDetailPage />, `/admin/reviews/payment/${PAYMENT_ID}`)
}

describe('AdminReviewDetailPage', () => {
  it('원장 조회 결과와 예상 결과를 보여 주고, 메모를 붙여 처리한다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = mockFetch({
      [`GET ${DETAIL_PATH}`]: () => ok(paymentDetail()),
      [`POST ${RESOLVE_PATH}`]: () =>
        ok({
          paymentId: PAYMENT_ID,
          refundId: null,
          status: 'APPROVED',
          paymentStatus: 'APPROVED',
          ledgerStatus: 'POSTED',
          ledgerTransactionId: LEDGER_TX,
        }),
    })
    render()

    expect(await screen.findByText('반영됨')).toBeInTheDocument()
    expect(screen.getByText('결과 확인 재시도 한도 초과', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('결제 완료')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/운영 메모/), '  원장 반영 확인  ')
    await user.click(screen.getByRole('button', { name: '처리' }))

    expect(await screen.findByText('처리했습니다.', { exact: false })).toBeInTheDocument()
    const [request] = api.calls('POST', RESOLVE_PATH)
    expect(request?.body).toEqual({ memo: '원장 반영 확인' })
    expect(request?.headers['Idempotency-Key']).toBeUndefined()
    // 처리 완료 후 이 결제의 처리 기록으로 이동할 수 있다.
    expect(screen.getByRole('link', { name: '처리 기록 보기' })).toHaveAttribute(
      'href',
      `/admin/resolutions/payment/${PAYMENT_ID}`,
    )
  })

  it('원장 보정이 필요한 건은 처리 버튼을 보여 주지 않는다', async () => {
    mockFetch({
      [`GET ${DETAIL_PATH}`]: () =>
        ok(
          paymentDetail({
            expected: { resolvable: false, status: null, paymentStatus: null, description: '원장 항목이 기록과 다름' },
          }),
        ),
    })
    render()

    expect(await screen.findByText(/원장 보정과 원인 조사가 필요합니다/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '처리' })).not.toBeInTheDocument()
  })

  it('원장 조회 실패(503)는 처리하지 않은 것으로, 연결 실패는 결과 모름으로 안내한다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = mockFetch({
      [`GET ${DETAIL_PATH}`]: () => ok(paymentDetail()),
      [`POST ${RESOLVE_PATH}`]: (_request, index) =>
        index === 0 ? fail(503, 'PAYMENT_LEDGER_LOOKUP_UNAVAILABLE') : networkError(),
    })
    render()

    await user.click(await screen.findByRole('button', { name: '처리' }))
    expect(await screen.findByText(/처리하지 않았습니다\(상태 그대로\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '처리' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '처리' }))
    expect(await screen.findByRole('button', { name: '다시 처리' })).toBeInTheDocument()
    expect(screen.getByText(/처리됐는지 확인하지 못했습니다/)).toBeInTheDocument()
    expect(api.calls('POST', RESOLVE_PATH)).toHaveLength(2)
  })

  it('이미 처리된 건(409)이면 목록으로 안내한다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockFetch({
      [`GET ${DETAIL_PATH}`]: () => ok(paymentDetail()),
      [`POST ${RESOLVE_PATH}`]: () => fail(409, 'PAYMENT_NOT_MANUAL_REVIEW'),
    })
    render()

    await user.click(await screen.findByRole('button', { name: '처리' }))
    expect(await screen.findByText(/이미 처리됐거나 처리 대상이 아닙니다/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '처리 대기 목록' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '처리' })).not.toBeInTheDocument()
  })
})
