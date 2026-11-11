import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fail, mockFetch, networkError, ok } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { AdminTransferDetailPage } from './AdminTransferDetailPage'

const TRANSFER_ID = '6dda1ae2-a470-4f32-84f9-8edaa4404ec5'
const ADMIN_ID = '252cd4aa-5666-4f0b-b62d-ef08a070f62e'
const LEDGER_TX = 'c92b2030-1a2b-4c3d-8e9f-0123456789ab'
const BASE = `/api/v1/admin/transfers/${TRANSFER_ID}`

function transfer(overrides: Record<string, unknown> = {}) {
  return {
    transferId: TRANSFER_ID,
    senderId: '550e8400-e29b-41d4-a716-446655440000',
    receiverId: '4c6a0178-266b-4f1e-b811-a2767026be70',
    sourceWalletId: '11111111-1111-4111-8111-111111111111',
    targetWalletId: '22222222-2222-4222-8222-222222222222',
    amount: 10000,
    currency: 'KRW',
    status: 'MANUAL_REVIEW',
    failureReason: null,
    reviewReason: 'RETRY_EXHAUSTED',
    attemptCount: 5,
    memo: '저녁값',
    createdAt: '2026-11-02T01:02:03Z',
    updatedAt: '2026-11-02T01:10:00Z',
    ...overrides,
  }
}

function postedPreview() {
  return {
    transferId: TRANSFER_ID,
    reviewReason: 'RETRY_EXHAUSTED',
    ledger: { found: true, transactionId: LEDGER_TX, status: 'POSTED', rejectReason: null, entriesMatch: true },
    resolvable: true,
    expectedStatus: 'COMPLETED',
    expectedFailureReason: null,
    ledgerTransactionId: LEDGER_TX,
  }
}

function notFoundPreview() {
  return {
    transferId: TRANSFER_ID,
    reviewReason: 'RETRY_EXHAUSTED',
    ledger: { found: false, transactionId: null, status: null, rejectReason: null, entriesMatch: null },
    resolvable: true,
    expectedStatus: 'PROCESSING',
    expectedFailureReason: null,
    ledgerTransactionId: null,
  }
}

const completedHistory = [
  {
    historyId: '33333333-3333-4333-8333-333333333333',
    fromStatus: 'MANUAL_REVIEW',
    toStatus: 'COMPLETED',
    reason: `원장 POSTED(${LEDGER_TX}), 항목 일치 확인`,
    actorType: 'OPERATOR',
    actorId: ADMIN_ID,
    ledgerTransactionId: LEDGER_TX,
    createdAt: '2026-11-10T01:00:00Z',
  },
]

function render() {
  renderRoute('/admin/transfers/:transferId', <AdminTransferDetailPage />, `/admin/transfers/${TRANSFER_ID}`)
}

describe('AdminTransferDetailPage', () => {
  it('상세에 사유·시도 횟수를 보여 주고, 미리보기 값 그대로 확정한 뒤 이력을 다시 불러온다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = mockFetch({
      [`GET ${BASE}`]: (_request, index) => ok(index === 0 ? transfer() : transfer({ status: 'COMPLETED', reviewReason: null })),
      [`GET ${BASE}/history`]: (_request, index) => ok(index === 0 ? [] : completedHistory),
      [`GET ${BASE}/resolution`]: () => ok(postedPreview()),
      [`POST ${BASE}/resolve`]: () => ok(transfer({ status: 'COMPLETED', reviewReason: null })),
    })
    render()

    expect(await screen.findByText('결과 확인 재시도 한도 초과')).toBeInTheDocument()
    expect(screen.getByText('5회')).toBeInTheDocument()
    expect(screen.getByText('운영자 확정 이력이 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '확정' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '미리보기' }))
    expect(await screen.findByText('송금과 같음')).toBeInTheDocument()
    expect(screen.getByLabelText(/확정 근거/)).toHaveValue(`원장 POSTED(${LEDGER_TX}), 항목 일치 확인`)

    await user.click(screen.getByRole('button', { name: '확정' }))

    expect(await screen.findByText(/확정했습니다/)).toBeInTheDocument()
    const [request] = api.calls('POST', `${BASE}/resolve`)
    expect(request?.body).toEqual({
      targetStatus: 'COMPLETED',
      reason: `원장 POSTED(${LEDGER_TX}), 항목 일치 확인`,
      ledgerTransactionId: LEDGER_TX,
    })
    expect(request?.headers['Idempotency-Key']).toBeUndefined()
    expect(await screen.findByText(ADMIN_ID)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /미리보기/ })).not.toBeInTheDocument()
  })

  it('재처리(PROCESSING) 확정에는 원장 거래 ID를 보내지 않는다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = mockFetch({
      [`GET ${BASE}`]: () => ok(transfer()),
      [`GET ${BASE}/history`]: () => ok([]),
      [`GET ${BASE}/resolution`]: () => ok(notFoundPreview()),
      [`POST ${BASE}/resolve`]: () => ok(transfer({ status: 'PROCESSING', reviewReason: null, attemptCount: 0 })),
    })
    render()

    await user.click(await screen.findByRole('button', { name: '미리보기' }))
    await user.click(await screen.findByRole('button', { name: '확정' }))

    await screen.findByText(/확정했습니다/)
    const [request] = api.calls('POST', `${BASE}/resolve`)
    expect(request?.body).toEqual({ targetStatus: 'PROCESSING', reason: '원장 기록 없음 확인, 자동 재처리로 되돌림' })
  })

  it('미리보기 뒤 원장이 바뀌어 409 TRANSFER_RESOLUTION_MISMATCH면 다시 미리보기한 값으로 확정한다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = mockFetch({
      [`GET ${BASE}`]: () => ok(transfer()),
      [`GET ${BASE}/history`]: () => ok([]),
      // 처음엔 기록 없음, 그 사이 원장에 반영됨
      [`GET ${BASE}/resolution`]: (_request, index) => ok(index === 0 ? notFoundPreview() : postedPreview()),
      [`POST ${BASE}/resolve`]: (_request, index) =>
        index === 0 ? fail(409, 'TRANSFER_RESOLUTION_MISMATCH') : ok(transfer({ status: 'COMPLETED', reviewReason: null })),
    })
    render()

    await user.click(await screen.findByRole('button', { name: '미리보기' }))
    await user.click(await screen.findByRole('button', { name: '확정' }))

    expect(await screen.findByText(/미리보기 뒤 원장 결과가 바뀌어 확정하지 않았습니다/)).toBeInTheDocument()
    // 지난 미리보기 값으로는 다시 보낼 수 없다.
    expect(screen.queryByRole('button', { name: '확정' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다시 미리보기' }))
    expect(await screen.findByText('송금과 같음')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '확정' }))

    await screen.findByText(/확정했습니다/)
    const requests = api.calls('POST', `${BASE}/resolve`)
    expect(requests).toHaveLength(2)
    expect(requests[0]?.body).toMatchObject({ targetStatus: 'PROCESSING' })
    expect(requests[1]?.body).toMatchObject({ targetStatus: 'COMPLETED', ledgerTransactionId: LEDGER_TX })
  })

  it('확정 결과를 모르면 입력을 잠그고, 같은 본문으로만 다시 보낸다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = mockFetch({
      [`GET ${BASE}`]: () => ok(transfer()),
      [`GET ${BASE}/history`]: () => ok([]),
      [`GET ${BASE}/resolution`]: () => ok(postedPreview()),
      [`POST ${BASE}/resolve`]: (_request, index) =>
        index === 0
          ? networkError()
          : index === 1
            ? fail(504, 'COMMON_GATEWAY_TIMEOUT')
            : ok(transfer({ status: 'COMPLETED', reviewReason: null })),
    })
    render()

    await user.click(await screen.findByRole('button', { name: '미리보기' }))
    const reasonInput = await screen.findByLabelText(/확정 근거/)
    await user.clear(reasonInput)
    await user.type(reasonInput, '원장 반영·항목 일치 확인')
    await user.click(screen.getByRole('button', { name: '확정' }))

    expect(await screen.findByText(/확정 결과를 확인하지 못했습니다/)).toBeInTheDocument()
    expect(screen.getByLabelText(/확정 근거/)).toBeDisabled()
    expect(screen.queryByRole('button', { name: '확정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /미리보기/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '같은 내용으로 다시 확정' }))
    expect(await screen.findByText(/확정 결과를 확인하지 못했습니다/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '같은 내용으로 다시 확정' }))

    expect(await screen.findByText(/확정했습니다/)).toBeInTheDocument()
    const requests = api.calls('POST', `${BASE}/resolve`)
    expect(requests).toHaveLength(3)
    const expected = { targetStatus: 'COMPLETED', reason: '원장 반영·항목 일치 확인', ledgerTransactionId: LEDGER_TX }
    for (const request of requests) {
      expect(request.body).toEqual(expected)
    }
  })

  it('이미 확정된 송금(409 COMMON_CONFLICT)이면 최신 상태를 다시 불러온다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = mockFetch({
      [`GET ${BASE}`]: (_request, index) => ok(index === 0 ? transfer() : transfer({ status: 'FAILED', reviewReason: null, failureReason: 'INSUFFICIENT_BALANCE' })),
      [`GET ${BASE}/history`]: () => ok([]),
      [`GET ${BASE}/resolution`]: () => ok(postedPreview()),
      [`POST ${BASE}/resolve`]: () => fail(409, 'COMMON_CONFLICT'),
    })
    render()

    await user.click(await screen.findByRole('button', { name: '미리보기' }))
    await user.click(await screen.findByRole('button', { name: '확정' }))

    expect(await screen.findByText(/다른 운영자가 먼저 확정했을 수 있어/)).toBeInTheDocument()
    expect(await screen.findByText('잔액 부족')).toBeInTheDocument()
    expect(api.calls('GET', BASE)).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /미리보기/ })).not.toBeInTheDocument()
  })

  it('없는 송금은 404 문구를 보여 준다', async () => {
    mockFetch({
      [`GET ${BASE}`]: () => fail(404, 'TRANSFER_NOT_FOUND'),
      [`GET ${BASE}/history`]: () => fail(404, 'TRANSFER_NOT_FOUND'),
    })
    render()

    expect(await screen.findByText('송금을 찾을 수 없습니다.')).toBeInTheDocument()
  })
})
