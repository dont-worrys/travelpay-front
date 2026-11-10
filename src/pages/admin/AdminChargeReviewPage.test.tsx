import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fail, mockFetch, networkError, ok } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { AdminChargeReviewPage } from './AdminChargeReviewPage'

const CHARGE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const RESULT_ID = 'f0e1d2c3-b4a5-4968-8776-655443322110'
const BANK_TX = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e'
const BASE = `/api/v1/admin/charges/${CHARGE_ID}`

const NOT_FOUND = { lookup: 'NOT_FOUND', transactionId: null, status: null, amount: null, currency: null }

function review(overrides: Record<string, unknown> = {}) {
  return {
    chargeId: CHARGE_ID,
    status: 'MANUAL_REVIEW',
    amount: 50000,
    currency: 'KRW',
    manualReviewAt: '2026-11-09T01:00:00Z',
    notFoundConfirmedAt: '2026-11-09T01:30:00Z',
    checkedAt: '2026-11-10T01:00:00Z',
    withdrawal: { lookup: 'FOUND', transactionId: BANK_TX, status: 'SUCCEEDED', amount: 50000, currency: null },
    refund: NOT_FOUND,
    ledger: NOT_FOUND,
    availableActions: ['RESUME_CREDIT', 'RESUME_REFUND'],
    blockers: [],
    unavailableActions: [
      { action: 'CONFIRM_COMPLETED', reasons: ['원장 적립이 없습니다.'] },
      { action: 'CONFIRM_FAILED', reasons: ['은행 출금이 성공했습니다.'] },
      { action: 'CONFIRM_REFUNDED', reasons: ['은행 환불이 없습니다.'] },
    ],
    ...overrides,
  }
}

function resolution() {
  return {
    resolutionId: '99999999-9999-4999-8999-999999999999',
    chargeId: CHARGE_ID,
    action: 'RESUME_CREDIT',
    resultStatus: 'CREDIT_PROCESSING',
    operatorId: '252cd4aa-5666-4f0b-b62d-ef08a070f62e',
    reason: '출금 성공·원장 없음 확인',
    reconciliationResultId: RESULT_ID,
    withdrawal: { lookup: 'FOUND', transactionId: BANK_TX, status: 'SUCCEEDED', amount: 50000, currency: null },
    refund: NOT_FOUND,
    ledger: NOT_FOUND,
    resolvedAt: '2026-11-10T01:05:00Z',
  }
}

function render(query = '') {
  renderRoute('/admin/charges/:chargeId/review', <AdminChargeReviewPage />, `/admin/charges/${CHARGE_ID}/review${query}`)
}

describe('AdminChargeReviewPage', () => {
  it('가능한 조치만 고를 수 있고, 불가 조치는 이유를 보여 준다', async () => {
    mockFetch({ [`GET ${BASE}/review`]: () => ok(review()) })
    render()

    expect(await screen.findByRole('radio', { name: /원장 적립 단계로 재개/ })).toBeEnabled()
    expect(screen.getByRole('radio', { name: /완료로 확정/ })).toBeDisabled()
    expect(screen.getByText(/원장 적립이 없습니다/)).toBeInTheDocument()
  })

  it('결과를 모르면 입력을 잠그고 같은 Idempotency-Key·같은 본문으로 다시 보낸다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = mockFetch({
      [`GET ${BASE}/review`]: () => ok(review()),
      [`POST ${BASE}/resolve`]: (_request, index) =>
        index === 0 ? networkError() : index === 1 ? fail(503, 'COMMON_SERVICE_UNAVAILABLE') : ok(resolution()),
    })
    render(`?resultId=${RESULT_ID}`)

    await user.click(await screen.findByRole('radio', { name: /원장 적립 단계로 재개/ }))
    await user.type(screen.getByLabelText(/보정 사유/), '출금 성공·원장 없음 확인')
    expect(screen.getByLabelText(/대사 결과 ID/)).toHaveValue(RESULT_ID)
    await user.click(screen.getByRole('button', { name: '보정' }))

    expect(await screen.findByText(/보정 결과를 확인하지 못했습니다/)).toBeInTheDocument()
    expect(screen.getByLabelText(/보정 사유/)).toBeDisabled()
    expect(screen.queryByRole('button', { name: '보정' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '같은 내용으로 다시 보내기' }))
    expect(await screen.findByText(/보정 결과를 확인하지 못했습니다/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '같은 내용으로 다시 보내기' }))

    expect(await screen.findByText('충전 보정 완료')).toBeInTheDocument()
    const requests = api.calls('POST', `${BASE}/resolve`)
    expect(requests).toHaveLength(3)
    const key = requests[0]?.headers['Idempotency-Key']
    expect(key).toMatch(/^[0-9a-f-]{36}$/)
    for (const request of requests) {
      expect(request.headers['Idempotency-Key']).toBe(key)
      expect(request.body).toEqual({
        action: 'RESUME_CREDIT',
        reason: '출금 성공·원장 없음 확인',
        reconciliationResultId: RESULT_ID,
      })
    }
  })

  it('판정 불가(409)는 반영되지 않은 것이라 거절 이유를 보여 주고, 다음 보정은 새 키로 보낸다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = mockFetch({
      [`GET ${BASE}/review`]: () => ok(review()),
      [`POST ${BASE}/resolve`]: (_request, index) =>
        index === 0
          ? fail(409, 'CHARGE_RESOLUTION_REJECTED', '거절', [
              { field: 'reason', message: '원장 적립이 이미 있습니다.' },
              { field: 'ledger', message: 'FOUND status=POSTED' },
            ])
          : ok(resolution()),
    })
    render()

    await user.click(await screen.findByRole('radio', { name: /원장 적립 단계로 재개/ }))
    await user.type(screen.getByLabelText(/보정 사유/), '재개')
    await user.click(screen.getByRole('button', { name: '보정' }))

    expect(await screen.findByText(/이 보정을 할 수 없어 반영하지 않았습니다/)).toBeInTheDocument()
    expect(screen.getByText('원장 적립이 이미 있습니다.')).toBeInTheDocument()
    expect(screen.getByLabelText(/보정 사유/)).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '보정' }))
    await screen.findByText('충전 보정 완료')
    const [first, second] = api.calls('POST', `${BASE}/resolve`)
    expect(first?.headers['Idempotency-Key']).not.toBe(second?.headers['Idempotency-Key'])
  })

  it('보정 대상이 아니면(409) 안내한다', async () => {
    mockFetch({ [`GET ${BASE}/review`]: () => fail(409, 'CHARGE_NOT_IN_MANUAL_REVIEW') })
    render()

    expect(await screen.findByText(/수동 확인 상태의 충전이 아닙니다/)).toBeInTheDocument()
  })
})
