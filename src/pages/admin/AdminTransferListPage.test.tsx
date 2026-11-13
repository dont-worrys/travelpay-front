import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fail, mockFetch, ok } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { AdminTransferListPage } from './AdminTransferListPage'

const TRANSFER_ID = '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e'
const SENDER_ID = '3f1e2d4c-5b6a-4789-8a0b-1c2d3e4f5a6b'
const RECEIVER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
const LIST = '/api/v1/admin/transfers'

function page(items: unknown[], extra: { page?: number; totalPages?: number } = {}) {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1, ...extra }
}

const transfer = {
  transferId: TRANSFER_ID,
  senderId: SENDER_ID,
  receiverId: RECEIVER_ID,
  sourceWalletId: null,
  targetWalletId: null,
  amount: 30000,
  currency: 'KRW',
  status: 'MANUAL_REVIEW',
  failureReason: null,
  reviewReason: 'RETRY_EXHAUSTED',
  attemptCount: 4,
  memo: null,
  createdAt: '2026-11-10T01:00:00Z',
  updatedAt: '2026-11-10T01:00:00Z',
}

function renderPage(initialEntry = '/admin/transfers') {
  return renderRoute('/admin/transfers', <AdminTransferListPage />, initialEntry)
}

describe('AdminTransferListPage', () => {
  it('최신 순으로 조회하고, 항목을 누르면 송금 상세로 간다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({ [`GET ${LIST}`]: () => ok(page([transfer])) })
    const { router } = renderPage()

    const link = await screen.findByRole('link', {
      name: new RegExp(`${SENDER_ID.slice(0, 8)} → ${RECEIVER_ID.slice(0, 8)}`),
    })
    expect(link).toHaveTextContent('시도 4회')
    expect(api.calls('GET', LIST)[0]?.search).toBe('?orderType=LATEST&page=0&size=20')

    await user.click(link)
    expect(router.state.location.pathname).toBe(`/admin/transfers/${TRANSFER_ID}`)
  })

  it('상태·정렬·회원 ID 조건을 주소와 API 파라미터에 함께 반영한다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({ [`GET ${LIST}`]: () => ok(page([transfer])) })
    const { router } = renderPage()
    await screen.findByRole('link', { name: new RegExp(SENDER_ID.slice(0, 8)) })

    await user.selectOptions(screen.getByLabelText('상태'), 'MANUAL_REVIEW')
    await screen.findByRole('link', { name: new RegExp(SENDER_ID.slice(0, 8)) })
    await user.selectOptions(screen.getByLabelText('정렬'), 'OLDEST')
    await screen.findByRole('link', { name: new RegExp(SENDER_ID.slice(0, 8)) })
    await user.type(screen.getByLabelText(/^회원 ID/), SENDER_ID)
    await user.click(screen.getByRole('button', { name: '검색' }))

    await screen.findByRole('link', { name: new RegExp(SENDER_ID.slice(0, 8)) })
    expect(router.state.location.search).toBe(`?status=MANUAL_REVIEW&userId=${SENDER_ID}&order=OLDEST`)
    expect(api.calls('GET', LIST).at(-1)?.search).toBe(
      `?status=MANUAL_REVIEW&userId=${SENDER_ID}&orderType=OLDEST&page=0&size=20`,
    )
  })

  it('회원 ID가 UUID가 아니면 조회하지 않고 입력 오류를 보여 준다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({ [`GET ${LIST}`]: () => ok(page([])) })
    const { router } = renderPage()
    expect(await screen.findByText('조건에 맞는 송금이 없습니다.')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^회원 ID/), 'abc')
    await user.click(screen.getByRole('button', { name: '검색' }))

    expect(screen.getByText('회원 ID(UUID) 형식이 아닙니다.')).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    expect(api.calls('GET', LIST)).toHaveLength(1)
  })

  it('다음 페이지로 가면 조건을 유지한 채 page를 보낸다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({
      [`GET ${LIST}`]: (request) =>
        ok(page([transfer], { page: Number(new URLSearchParams(request.search).get('page')), totalPages: 3 })),
    })
    const { router } = renderPage('/admin/transfers?status=FAILED')

    expect(await screen.findByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByText('2 / 3')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?status=FAILED&page=1')
    expect(api.calls('GET', LIST).at(-1)?.search).toBe('?status=FAILED&orderType=LATEST&page=1&size=20')
  })

  it('403이면 관리자 전용 안내를 보여 준다', async () => {
    mockFetch({ [`GET ${LIST}`]: () => fail(403, 'COMMON_FORBIDDEN') })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('관리자만 사용할 수 있습니다.')
  })
})
