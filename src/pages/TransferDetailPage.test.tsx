import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fail, mockFetch, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { TransferDetailPage } from './TransferDetailPage'

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const ID = 'bbbbbbbb-0000-4000-8000-000000000001'
const PATH = `/api/v1/transfers/${ID}`

function transfer(overrides: Record<string, unknown> = {}) {
  return {
    transferId: ID,
    direction: 'SENT',
    senderId: ME,
    receiverId: OTHER,
    amount: 1234567,
    currency: 'KRW',
    status: 'COMPLETED',
    failureReason: null,
    memo: '점심값',
    createdAt: '2026-11-10T01:00:00Z',
    ...overrides,
  }
}

function renderDetail() {
  renderRoute('/transfers/:transferId', <TransferDetailPage />, `/transfers/${ID}`)
}

describe('TransferDetailPage', () => {
  it('완료된 보낸 송금은 금액·상태·받는 분을 보여 주고 같은 분에게 또 보내기를 연결한다', async () => {
    mockFetch({ [`GET ${PATH}`]: () => ok(transfer()) })
    renderDetail()

    expect(await screen.findByText('-1,234,567원')).toBeInTheDocument()
    expect(screen.getByText('완료')).toHaveClass('badge')
    expect(screen.getByText('보낸 송금')).toBeInTheDocument()
    expect(screen.getByText('받는 분')).toBeInTheDocument()
    expect(screen.getByText(OTHER)).toBeInTheDocument()
    expect(screen.getByText('점심값')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '같은 분에게 또 보내기' })).toHaveAttribute(
      'href',
      `/transfers/new?receiverId=${OTHER}`,
    )
    expect(screen.queryByRole('button', { name: '송금 취소' })).not.toBeInTheDocument()
  })

  it('완료된 받은 송금은 +로 표시하고 보낸 분을 보여 준다', async () => {
    mockFetch({
      [`GET ${PATH}`]: () => ok(transfer({ direction: 'RECEIVED', senderId: OTHER, receiverId: ME, amount: 5000, memo: null })),
    })
    renderDetail()

    expect(await screen.findByText('+5,000원')).toBeInTheDocument()
    expect(screen.getByText('받은 송금')).toBeInTheDocument()
    expect(screen.getByText('보낸 분')).toBeInTheDocument()
    expect(screen.getByText(OTHER)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '같은 분에게 또 보내기' })).not.toBeInTheDocument()
  })

  it('운영자가 실패로 확정한 송금은 실패 배지와 사유 안내를 보여 준다', async () => {
    mockFetch({ [`GET ${PATH}`]: () => ok(transfer({ status: 'FAILED', failureReason: 'NOT_PROCESSED' })) })
    renderDetail()

    expect(await screen.findByText('실패')).toHaveClass('badge')
    expect(
      screen.getByText('송금이 처리되지 않아 운영자가 실패로 확정했습니다. 잔액은 빠지지 않았습니다. 필요하면 다시 송금해 주세요.'),
    ).toBeInTheDocument()
  })

  it('예전에 접수만 된 송금도 안내만 보여 주고 취소 버튼은 없다(취소 API 제거)', async () => {
    const api = mockFetch({ [`GET ${PATH}`]: () => ok(transfer({ status: 'REQUESTED' })) })
    renderDetail()

    expect(await screen.findByText('접수만 된 송금입니다. 아직 돈이 이동하지 않았습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '송금 취소' })).not.toBeInTheDocument()
    expect(api.calls('POST', `${PATH}/cancel`)).toHaveLength(0)
  })

  it('없는 송금(404 TRANSFER_NOT_FOUND)이면 서버 문구와 내역 링크를 보여 준다', async () => {
    mockFetch({ [`GET ${PATH}`]: () => fail(404, 'TRANSFER_NOT_FOUND', '송금을 찾을 수 없습니다.') })
    renderDetail()

    expect(await screen.findByRole('alert')).toHaveTextContent('송금을 찾을 수 없습니다.')
    expect(screen.getByRole('link', { name: '송금 내역으로' })).toHaveAttribute('href', '/transfers')
  })
})
