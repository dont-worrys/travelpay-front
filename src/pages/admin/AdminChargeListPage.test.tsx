import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mockFetch, ok } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { AdminChargeListPage } from './AdminChargeListPage'
import { AdminReconciliationDetailPage } from './AdminReconciliationDetailPage'

const USER_ID = '3f1e2d4c-5b6a-4789-8a0b-1c2d3e4f5a6b'
const CHARGE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const RUN_ID = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b'
const LIST = '/api/v1/admin/charges'

function charges() {
  return {
    items: [
      {
        chargeId: CHARGE_ID,
        userId: USER_ID,
        status: 'COMPLETED',
        amount: 50000,
        currency: 'KRW',
        bankCode: '004',
        accountNumberMask: '***-1234',
        failureCode: null,
        failureMessage: null,
        attemptCount: 1,
        createdAt: '2026-11-10T01:00:00Z',
        updatedAt: '2026-11-10T01:00:00Z',
      },
    ],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  }
}

function setup(initialEntry = '/admin/charges') {
  const api = mockFetch({ [`GET ${LIST}`]: () => ok(charges()) })
  const view = renderRoute('/admin/charges', <AdminChargeListPage />, initialEntry)
  return { api, ...view }
}

describe('AdminChargeListPage', () => {
  it('회원 UUID를 복사하고 그 회원의 충전만 다시 조회한다', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { api, router } = setup()

    await user.click(await screen.findByRole('button', { name: `회원 ${USER_ID} ID 복사 후 이 회원만 보기` }))

    expect(writeText).toHaveBeenCalledWith(USER_ID)
    expect(await screen.findByRole('status')).toHaveTextContent(`회원 ID ${USER_ID}를 복사했습니다.`)
    expect(router.state.location.search).toBe(`?userId=${USER_ID}`)
    expect(screen.getByLabelText(/^회원 ID/)).toHaveValue(USER_ID)
    await screen.findAllByRole('button', { name: /ID 복사 후 이 회원만 보기/ })
    expect(api.calls('GET', LIST).at(-1)?.search).toBe(`?userId=${USER_ID}&page=0&size=20`)
  })

  it('복사가 막혀도 그 회원 기준으로 거른다', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    const { router } = setup()

    await user.click(await screen.findByRole('button', { name: `회원 ${USER_ID} ID 복사 후 이 회원만 보기` }))

    expect(await screen.findByRole('status')).toHaveTextContent('회원 ID를 복사하지 못했습니다')
    expect(router.state.location.search).toBe(`?userId=${USER_ID}`)
  })

  it('주소의 userId가 UUID가 아니면 조회하지 않고 오류로 알린다', async () => {
    const user = userEvent.setup()
    const { api, router } = setup('/admin/charges?status=COMPLETED&userId=abc')

    expect(await screen.findByRole('alert')).toHaveTextContent('주소의 회원 ID(abc)가 UUID 형식이 아니라 조회하지 않았습니다.')
    expect(api.calls('GET', LIST)).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: '회원 필터 지우기' }))

    await screen.findAllByRole('button', { name: /ID 복사 후 이 회원만 보기/ })
    expect(router.state.location.search).toBe('?status=COMPLETED')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('상태 필터가 담긴 주소로 들어오면 그 상태로 조회한다', async () => {
    const { api } = setup('/admin/charges?status=CREDIT_PROCESSING')
    await screen.findAllByRole('button', { name: /ID 복사 후 이 회원만 보기/ })
    expect(api.calls('GET', LIST)[0]?.search).toBe('?status=CREDIT_PROCESSING&page=0&size=20')
  })
})

describe('AdminReconciliationDetailPage', () => {
  it('대사 요약 아래에 합계 안내를 보여 준다', async () => {
    mockFetch({
      [`GET ${LIST}/reconciliations/${RUN_ID}`]: () =>
        ok({
          run: {
            runId: RUN_ID,
            runType: 'AUTO',
            status: 'COMPLETED',
            periodFrom: '2026-11-10T00:00:00Z',
            periodTo: '2026-11-10T01:00:00Z',
            overlapFrom: null,
            startedAt: '2026-11-10T01:00:00Z',
            finishedAt: '2026-11-10T01:00:05Z',
            targetCount: 3,
            matchedCount: 2,
            mismatchCount: 2,
            unverifiableCount: 0,
            failureReason: null,
          },
          results: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 },
        }),
    })
    renderRoute(
      '/admin/charges/reconciliations/:runId',
      <AdminReconciliationDetailPage />,
      `/admin/charges/reconciliations/${RUN_ID}`,
    )

    expect(
      await screen.findByText('어긋남에는 충전 없는 은행·원장 거래도 포함되어 합계가 맞지 않을 수 있습니다.'),
    ).toBeInTheDocument()
  })
})
