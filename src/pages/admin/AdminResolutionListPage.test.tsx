import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fail, mockFetch, ok } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { AdminResolutionListPage } from './AdminResolutionListPage'

// 결제 탭 필터·환전 탭 전환·상세 이동은 AdminResolutionPages.test.tsx에서 다룬다.
const ADMIN_ID = '252cd4aa-5666-4f0b-b62d-ef08a070f62e'
const SETTLEMENT_ID = 'f0a1b2c3-d4e5-4f6a-8b7c-9d0e1f2a3b4c'
const PAYMENTS = '/api/v1/admin/payments/resolutions'
const SETTLEMENTS = '/api/v1/admin/payments/settlements/resolutions'

function page(items: unknown[], extra: { page?: number; totalPages?: number } = {}) {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1, ...extra }
}

const settlementRecord = {
  resolutionId: '30000000-0000-4000-8000-000000000003',
  settlementId: SETTLEMENT_ID,
  reviewReason: 'RETRY_EXHAUSTED',
  ledgerStatus: 'POSTED',
  ledgerTransactionId: null,
  toStatus: 'PAID',
  actorId: ADMIN_ID,
  description: '원장 반영 확인',
  memo: null,
  createdAt: '2026-11-10T02:00:00Z',
}

function renderPage(initialEntry = '/admin/resolutions') {
  return renderRoute('/admin/resolutions', <AdminResolutionListPage />, initialEntry)
}

describe('AdminResolutionListPage', () => {
  it('정산 탭은 정산 ID로 거르고, 항목은 정산 처리 기록 상세로 연결한다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({ [`GET ${SETTLEMENTS}`]: () => ok(page([settlementRecord])) })
    const { router } = renderPage('/admin/resolutions?domain=settlement')

    const link = await screen.findByRole('link', { name: new RegExp(`정산 ${SETTLEMENT_ID.slice(0, 8)}`) })
    expect(link).toHaveAttribute('href', `/admin/resolutions/settlement/${SETTLEMENT_ID}`)
    expect(link).toHaveTextContent(`담당자 ${ADMIN_ID.slice(0, 8)}`)
    expect(screen.queryByLabelText('종류')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('정산 ID'), SETTLEMENT_ID)
    await user.click(screen.getByRole('button', { name: '검색' }))

    await screen.findByRole('link', { name: new RegExp(SETTLEMENT_ID.slice(0, 8)) })
    expect(router.state.location.search).toBe(`?domain=settlement&targetId=${SETTLEMENT_ID}`)
    expect(api.calls('GET', SETTLEMENTS).at(-1)?.search).toBe(`?page=0&size=20&settlementId=${SETTLEMENT_ID}`)
  })

  it('ID가 UUID가 아니면 조회하지 않고 입력 오류를 보여 준다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({ [`GET ${PAYMENTS}`]: () => ok(page([])) })
    const { router } = renderPage()
    expect(await screen.findByText('조건에 맞는 처리 기록이 없습니다.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('처리 담당자 ID'), 'not-a-uuid')
    await user.click(screen.getByRole('button', { name: '검색' }))

    expect(screen.getByText('ID는 UUID 형식으로 입력해 주세요.')).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    expect(api.calls('GET', PAYMENTS)).toHaveLength(1)
  })

  it('다음 페이지로 가면 조건을 유지한 채 page를 보낸다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({
      [`GET ${SETTLEMENTS}`]: (request) =>
        ok(page([settlementRecord], { page: Number(new URLSearchParams(request.search).get('page')), totalPages: 2 })),
    })
    const { router } = renderPage(`/admin/resolutions?domain=settlement&actorId=${ADMIN_ID}`)

    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByText('2 / 2')).toBeInTheDocument()
    expect(router.state.location.search).toBe(`?domain=settlement&actorId=${ADMIN_ID}&page=1`)
    expect(api.calls('GET', SETTLEMENTS).at(-1)?.search).toBe(`?actorId=${ADMIN_ID}&page=1&size=20`)
  })

  it('403이면 관리자 전용 안내를 보여 준다', async () => {
    mockFetch({ [`GET ${PAYMENTS}`]: () => fail(403, 'COMMON_FORBIDDEN') })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('관리자만 사용할 수 있습니다.')
  })
})
