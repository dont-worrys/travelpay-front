import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatAmount } from '../lib/money'
import { mockFetch, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { TransferDetailPage } from './TransferDetailPage'
import { TransferListPage } from './TransferListPage'

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

function transfer(id: string, overrides: Record<string, unknown>) {
  return {
    transferId: id,
    direction: 'RECEIVED',
    senderId: OTHER,
    receiverId: ME,
    amount: 10000,
    currency: 'KRW',
    status: 'COMPLETED',
    memo: null,
    createdAt: '2026-11-10T01:00:00Z',
    ...overrides,
  }
}

function page(items: unknown[]) {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1 }
}

describe('받은 송금 금액 표시', () => {
  it('받은 내역에서 완료된 송금만 입금(+)으로, 실패한 송금은 부호 없이 보여 준다', async () => {
    mockFetch({
      'GET /api/v1/transfers': () =>
        ok(
          page([
            transfer('aaaaaaaa-0000-4000-8000-000000000001', { amount: 1000000, status: 'FAILED' }),
            transfer('aaaaaaaa-0000-4000-8000-000000000002', { amount: 10000, status: 'COMPLETED' }),
            transfer('aaaaaaaa-0000-4000-8000-000000000003', {
              direction: 'SENT',
              senderId: ME,
              receiverId: OTHER,
              amount: 3000,
              status: 'FAILED',
            }),
          ]),
        ),
    })
    renderRoute('/transfers', <TransferListPage />, '/transfers')

    const failedReceived = await screen.findByText(formatAmount(1000000, 'KRW'))
    expect(failedReceived).toHaveClass('amount')
    expect(failedReceived).not.toHaveClass('received')

    const completedReceived = screen.getByText(`+${formatAmount(10000, 'KRW')}`)
    expect(completedReceived).toHaveClass('amount', 'received')

    // 보낸 송금은 결제 내역과 같이 상태와 관계없이 -로 표시한다.
    expect(screen.getByText(`-${formatAmount(3000, 'KRW')}`)).toHaveClass('amount', 'sent')
  })

  it('수취인이 보는 실패 송금 상세는 받는 분 기준 안내를 보여 준다', async () => {
    const id = 'aaaaaaaa-0000-4000-8000-000000000001'
    mockFetch({ [`GET /api/v1/transfers/${id}`]: () => ok(transfer(id, { amount: 1000000, status: 'FAILED' })) })
    renderRoute('/transfers/:transferId', <TransferDetailPage />, `/transfers/${id}`)

    expect(await screen.findByText('보내는 분의 송금이 거절되었습니다. 받은 돈이 없습니다.')).toBeInTheDocument()
    expect(screen.queryByText(/잔액이 빠지지 않았습니다/)).not.toBeInTheDocument()
    expect(screen.queryByText(`+${formatAmount(1000000, 'KRW')}`, { exact: false })).not.toBeInTheDocument()
  })

  it('송금인이 보는 실패 송금 상세는 기존 안내를 유지한다', async () => {
    const id = 'aaaaaaaa-0000-4000-8000-000000000003'
    mockFetch({
      [`GET /api/v1/transfers/${id}`]: () =>
        ok(transfer(id, { direction: 'SENT', senderId: ME, receiverId: OTHER, status: 'FAILED' })),
    })
    renderRoute('/transfers/:transferId', <TransferDetailPage />, `/transfers/${id}`)

    expect(await screen.findByText('송금이 거절되었습니다. 잔액이 빠지지 않았습니다.')).toBeInTheDocument()
  })
})
