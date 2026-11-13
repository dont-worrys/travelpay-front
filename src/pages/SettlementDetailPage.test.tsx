import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SETTLEMENT_DESCRIPTION } from '../features/merchant/status'
import { formatDateTime } from '../lib/datetime'
import { formatAmount } from '../lib/money'
import { fail, mockFetch, ok, type RouteHandler } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { SettlementDetailPage } from './SettlementDetailPage'

const MERCHANT_ID = '9b2f3c1e-8a47-4d55-b0c2-7e1f6a9d3b10'
const SETTLEMENT_ID = 'cccccccc-0000-4000-8000-000000000001'
const PATH = `/api/v1/payments/merchants/${MERCHANT_ID}/settlements/${SETTLEMENT_ID}`
const PAYMENT_ID = 'c7d4e2a9-5b13-4f8e-9a61-0d2b7c8e4f35'

function detail(overrides: Record<string, unknown> = {}, items = [{ paymentId: PAYMENT_ID, amount: 30000 }]) {
  return {
    settlement: {
      settlementId: SETTLEMENT_ID,
      merchantId: MERCHANT_ID,
      status: 'PAID',
      amount: 30000,
      currency: 'KRW',
      ownerUserId: '11111111-1111-4111-8111-111111111111',
      paymentCount: 1,
      cutoffAt: '2026-11-12T03:00:00Z',
      ledgerTransactionId: null,
      failureReason: null,
      paidAt: '2026-11-12T03:05:00Z',
      createdAt: '2026-11-12T03:00:00Z',
      updatedAt: '2026-11-12T03:05:01Z',
      ...overrides,
    },
    items,
  }
}

function setup(handler: RouteHandler) {
  const api = mockFetch({ [`GET ${PATH}`]: handler })
  renderRoute(
    '/merchant/:merchantId/settlements/:settlementId',
    <SettlementDetailPage />,
    `/merchant/${MERCHANT_ID}/settlements/${SETTLEMENT_ID}`,
  )
  return api
}

describe('SettlementDetailPage', () => {
  it('입금 완료 정산은 paidAt을 입금 시각으로 보여 주고 포함된 결제·지갑 링크를 둔다', async () => {
    setup(() => ok(detail()))

    expect(await screen.findByText('입금 완료')).toBeInTheDocument()
    expect(screen.getByText(SETTLEMENT_DESCRIPTION.PAID!)).toBeInTheDocument()
    const paidLabel = screen.getByText('입금 시각')
    expect(paidLabel.nextElementSibling).toHaveTextContent(formatDateTime('2026-11-12T03:05:00Z'))

    const item = screen.getByRole('link', { name: new RegExp(PAYMENT_ID) })
    expect(item).toHaveAttribute('href', `/merchant/${MERCHANT_ID}/payments/${PAYMENT_ID}`)
    expect(item).toHaveTextContent(formatAmount(30000, 'KRW'))
    expect(screen.getByRole('link', { name: '내 지갑' })).toHaveAttribute('href', '/wallet')
    expect(screen.getByRole('link', { name: '정산 내역' })).toHaveAttribute(
      'href',
      `/merchant/${MERCHANT_ID}/settlements`,
    )
  })

  it('거절된 정산은 실패 배지와 거절 사유를 보여 주고 입금 시각·지갑 링크는 없다', async () => {
    setup(() => ok(detail({ status: 'FAILED', paidAt: null, failureReason: '지갑 정지' }, [])))

    expect(await screen.findByText('실패')).toBeInTheDocument()
    expect(screen.getByText(SETTLEMENT_DESCRIPTION.FAILED!)).toBeInTheDocument()
    expect(screen.getByText('거절 사유: 지갑 정지')).toBeInTheDocument()
    expect(screen.queryByText('입금 시각')).not.toBeInTheDocument()
    expect(screen.queryByText('포함된 결제')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '내 지갑' })).not.toBeInTheDocument()
  })

  it.each([
    ['REQUESTED', '처리 중'],
    ['MANUAL_REVIEW', '확인 중'],
  ] as const)('%s 상태는 %s 배지와 상태 설명을 보여 준다', async (status, label) => {
    setup(() => ok(detail({ status, paidAt: null })))

    expect(await screen.findByText(label)).toBeInTheDocument()
    expect(screen.getByText(SETTLEMENT_DESCRIPTION[status]!)).toBeInTheDocument()
    expect(screen.queryByText('입금 시각')).not.toBeInTheDocument()
    if (status === 'REQUESTED') {
      expect(screen.getByText('결과를 자동으로 확인하는 중입니다…')).toBeInTheDocument()
    }
  })

  it('없는 정산(404)은 안내 문구와 목록 링크를 보여 준다', async () => {
    setup(() => fail(404, 'PAYMENT_SETTLEMENT_NOT_FOUND'))

    expect(await screen.findByRole('alert')).toHaveTextContent('정산을 찾을 수 없습니다.')
    expect(screen.getByRole('link', { name: '정산으로' })).toHaveAttribute(
      'href',
      `/merchant/${MERCHANT_ID}/settlements`,
    )
  })
})
