import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatDateTime } from '../lib/datetime'
import { formatAmount } from '../lib/money'
import { mockFetch, ok, type RecordedRequest } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { SettlementDepositListPage } from './SettlementDepositListPage'

const MERCHANT_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const MERCHANT_B = 'bbbbbbbb-2222-4222-8222-222222222222'

function settlement(id: string, overrides: Record<string, unknown>) {
  return {
    settlementId: id,
    merchantId: MERCHANT_A,
    merchantName: '제주 기념품샵',
    status: 'PAID',
    amount: 50000,
    currency: 'KRW',
    ownerUserId: '11111111-1111-4111-8111-111111111111',
    paymentCount: 3,
    cutoffAt: '2026-11-12T03:00:00Z',
    ledgerTransactionId: '7c1e9a4b-3f28-4d6a-8b05-1a9e2c7d6f43',
    failureReason: null,
    paidAt: '2026-11-12T03:00:01Z',
    createdAt: '2026-11-12T03:00:00Z',
    updatedAt: '2026-11-12T03:00:02Z',
    ...overrides,
  }
}

function page(items: unknown[]) {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1 }
}

describe('정산 입금 내역', () => {
  it('내 정산 중 PAID만 요청하고 서버 순서대로 가맹점 이름·입금 시각·금액을 보여 준다', async () => {
    const requests: RecordedRequest[] = []
    mockFetch({
      'GET /api/v1/payments/settlements/me': (request) => {
        requests.push(request)
        return ok(
          page([
            settlement('cccccccc-0000-4000-8000-000000000001', { merchantName: '도쿄 라멘', amount: 50000 }),
            settlement('cccccccc-0000-4000-8000-000000000002', {
              merchantId: MERCHANT_B,
              merchantName: undefined,
              amount: 12000,
              paidAt: '2026-11-13T05:00:00Z',
            }),
          ]),
        )
      },
    })
    renderRoute('/wallet/settlements', <SettlementDepositListPage />, '/wallet/settlements')

    const first = await screen.findByRole('link', { name: /도쿄 라멘/ })
    expect(first).toHaveAttribute('href', `/merchant/${MERCHANT_A}/settlements/cccccccc-0000-4000-8000-000000000001`)
    expect(first).toHaveTextContent(`+${formatAmount(50000, 'KRW')}`)
    expect(first).toHaveTextContent(`${formatDateTime('2026-11-12T03:00:01Z')} 입금 · 결제 3건`)

    // merchantName이 없는 응답(백엔드 #320 배포 전)은 가맹점 ID 앞 8자리로 보여 준다.
    const second = screen.getByRole('link', { name: /가맹점 bbbbbbbb/ })
    expect(second).toHaveTextContent(formatDateTime('2026-11-13T05:00:00Z'))

    // 요청 시각순 서버 정렬을 그대로 둔다(입금 시각이 더 늦어도 재정렬하지 않음).
    const links = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.includes('/settlements/'))
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `/merchant/${MERCHANT_A}/settlements/cccccccc-0000-4000-8000-000000000001`,
      `/merchant/${MERCHANT_B}/settlements/cccccccc-0000-4000-8000-000000000002`,
    ])

    const query = new URLSearchParams(requests[0]?.search)
    expect(query.get('status')).toBe('PAID')
    expect(screen.getByRole('link', { name: '정산 입금' })).toHaveAttribute('aria-current', 'page')
  })

  it('정산이 없으면 빈 목록 문구를 보여 준다', async () => {
    mockFetch({ 'GET /api/v1/payments/settlements/me': () => ok(page([])) })
    renderRoute('/wallet/settlements', <SettlementDepositListPage />, '/wallet/settlements')

    expect(await screen.findByText('정산 입금 내역이 없습니다.')).toBeInTheDocument()
  })
})
