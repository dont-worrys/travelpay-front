import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockFetch, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { ChargeListPage } from './ChargeListPage'

const STATUSES = ['COMPLETED', 'FAILED', 'REFUNDED', 'REFUND_PROCESSING', 'BANK_PROCESSING', 'MANUAL_REVIEW']

function charge(status: string, index: number) {
  return {
    chargeId: `cccccccc-0000-4000-8000-00000000000${index}`,
    status,
    amount: 50000,
    currency: 'KRW',
    bankCode: '004',
    accountNumberMask: '****1234',
    failureCode: null,
    failureMessage: null,
    createdAt: '2026-11-10T01:00:00Z',
    updatedAt: '2026-11-10T01:00:05Z',
  }
}

describe('ChargeListPage 금액 표시', () => {
  it('완료된 충전만 +·초록으로, 실패·환불·처리 중·확인 중은 부호 없이 기본 색으로 보여 준다', async () => {
    const items = STATUSES.map(charge)
    mockFetch({
      'GET /api/v1/charges': () => ok({ items, page: 0, size: 20, totalElements: items.length, totalPages: 1 }),
    })
    renderRoute('/wallet/charges', <ChargeListPage />, '/wallet/charges')

    const links = await screen.findAllByRole('link', { name: /KB국민은행/ })
    const amountOf = (chargeId: string) => {
      const link = links.find((item) => item.getAttribute('href') === `/wallet/charges/${chargeId}`)!
      return within(link).getByText((_, element) => element?.classList.contains('amount') ?? false)
    }
    const [completed, ...others] = items
    expect(amountOf(completed!.chargeId)).toHaveTextContent('+50,000원')
    expect(amountOf(completed!.chargeId)).toHaveClass('received')
    for (const item of others) {
      expect(amountOf(item.chargeId)).toHaveTextContent(/^50,000원$/)
      expect(amountOf(item.chargeId)).not.toHaveClass('received')
    }
  })
})
