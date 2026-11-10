import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCsrfToken } from '../../api'
import { AuthProvider } from '../../features/auth/AuthContext'
import { fail, mockFetch, networkError, ok, type RouteHandler } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { AdminMemberListPage } from './AdminMemberListPage'

const ADMIN_ID = '252cd4aa-5666-4f0b-b62d-ef08a070f62e'
const MEMBER_ID = '4ab3e8ac-ad42-4858-8e97-86f0f3107702'
const CLOSED_ID = '9f1c2d3e-1111-4222-8333-444455556666'
const USERS = '/api/v1/admin/users'

const me = () =>
  ok({
    userId: ADMIN_ID,
    realName: '관리자',
    phone: '010-0000-0000',
    loginEmail: 'admin@example.com',
    status: 'ACTIVE',
    role: 'MASTER',
    loginMethods: ['PASSWORD'],
    createdAt: '2026-11-01T00:00:00Z',
  })

function member(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    userId,
    maskedRealName: '홍*동',
    maskedEmail: 'm***@example.com',
    maskedPhone: '010-****-5678',
    status: 'ACTIVE',
    role: 'USER',
    ...overrides,
  }
}

const page = (items: unknown[], hasNext = false) => ok({ items, page: 0, size: 20, hasNext })

function setup(routes: Record<string, RouteHandler>) {
  const api = mockFetch({ 'GET /api/v1/users/me': me, ...routes })
  renderRoute(
    '/admin/users',
    <AuthProvider>
      <AdminMemberListPage />
    </AuthProvider>,
    '/admin/users',
  )
  return api
}

const row = (userId: string) => screen.getByTestId(`member-${userId}`)

describe('AdminMemberListPage', () => {
  beforeEach(() => {
    clearCsrfToken()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('본인 행에는 정지 버튼이 없고, 다른 회원을 정지하면 상태를 바꿔 보여 준다', async () => {
    const user = userEvent.setup()
    const api = setup({
      [`GET ${USERS}`]: () =>
        page([member(MEMBER_ID), member(ADMIN_ID, { maskedRealName: '관*자', role: 'MASTER' })]),
      [`PATCH ${USERS}/${MEMBER_ID}/status`]: () => ok({ userId: MEMBER_ID, status: 'SUSPENDED' }),
    })

    expect(await screen.findByText(/관\*자 \(관리자\) · 본인/)).toBeInTheDocument()
    expect(within(row(ADMIN_ID)).queryByRole('button', { name: '정지' })).not.toBeInTheDocument()
    expect(within(row(ADMIN_ID)).getByText('본인 계정은 정지할 수 없습니다.')).toBeInTheDocument()

    await user.click(within(row(MEMBER_ID)).getByRole('button', { name: '정지' }))

    expect(await within(row(MEMBER_ID)).findByText('정지했습니다. 기존 세션도 끝났습니다.')).toBeInTheDocument()
    expect(within(row(MEMBER_ID)).getByText('정지')).toHaveClass('badge')
    expect(within(row(MEMBER_ID)).getByRole('button', { name: '정지 해제' })).toBeInTheDocument()
    const patch = api.calls('PATCH', `${USERS}/${MEMBER_ID}/status`)[0]!
    expect(patch.body).toEqual({ status: 'SUSPENDED' })
    expect(patch.headers['Csrf-Token']).toBe('test-csrf')
  })

  it('검색 조건은 값을 넣은 것만 보내고, 휴대폰 형식이 틀리면 보내지 않는다', async () => {
    const user = userEvent.setup()
    const api = setup({ [`GET ${USERS}`]: () => page([]) })
    expect(await screen.findByText('조건에 맞는 회원이 없습니다.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('휴대폰 번호'), '02-123-4567')
    await user.click(screen.getByRole('button', { name: '검색' }))
    expect(screen.getByText('휴대폰 번호는 010-1234-5678 형식으로 입력해 주세요.')).toBeInTheDocument()
    expect(api.calls('GET', USERS)).toHaveLength(1)

    await user.clear(screen.getByLabelText('휴대폰 번호'))
    await user.type(screen.getByLabelText('휴대폰 번호'), '01012345678')
    await user.type(screen.getByLabelText('로그인 이메일'), '  Member@Example.com ')
    await user.selectOptions(screen.getByLabelText('상태'), 'SUSPENDED')
    await user.click(screen.getByRole('button', { name: '검색' }))

    await screen.findByText('조건에 맞는 회원이 없습니다.')
    const last = api.calls('GET', USERS).at(-1)!
    const params = new URLSearchParams(last.search)
    expect(Object.fromEntries(params)).toEqual({
      loginEmail: 'Member@Example.com',
      phone: '01012345678',
      status: 'SUSPENDED',
      page: '0',
      size: '20',
    })
  })

  it('서버 거절은 그 행에 안내하고, 결과를 모르면 다시 시도할 수 있게 둔다', async () => {
    const user = userEvent.setup()
    setup({
      [`GET ${USERS}`]: () =>
        page([member(MEMBER_ID, { status: 'SUSPENDED' }), member(CLOSED_ID, { maskedRealName: '김*수' })]),
      [`PATCH ${USERS}/${CLOSED_ID}/status`]: () =>
        fail(409, 'USER_CLOSED_ACCOUNT_UNCHANGEABLE', '종료된 계정입니다.'),
      [`PATCH ${USERS}/${MEMBER_ID}/status`]: (_request, index) =>
        index === 0 ? networkError() : ok({ userId: MEMBER_ID, status: 'ACTIVE' }),
    })

    await user.click(await within(await screen.findByTestId(`member-${CLOSED_ID}`)).findByRole('button', { name: '정지' }))
    expect(await within(row(CLOSED_ID)).findByRole('alert')).toHaveTextContent('종료된 계정은 정지하거나 해제할 수 없습니다.')
    expect(within(row(CLOSED_ID)).queryByRole('button', { name: '정지' })).not.toBeInTheDocument()
    expect(within(row(CLOSED_ID)).getByText('종료된 계정은 바꿀 수 없습니다.')).toBeInTheDocument()

    await user.click(within(row(MEMBER_ID)).getByRole('button', { name: '정지 해제' }))
    expect(await within(row(MEMBER_ID)).findByRole('alert')).toHaveTextContent('반영됐는지 알 수 없습니다.')
    await user.click(within(row(MEMBER_ID)).getByRole('button', { name: '정지 해제' }))
    expect(
      await within(row(MEMBER_ID)).findByText('정지를 해제했습니다. 회원은 다시 로그인해야 합니다.'),
    ).toBeInTheDocument()
  })

  it('세션 종료는 확인 뒤 DELETE를 보내고, 본인이면 다시 로그인해야 한다고 묻는다', async () => {
    const user = userEvent.setup()
    const api = setup({
      [`GET ${USERS}`]: () => page([member(ADMIN_ID, { role: 'MASTER' }), member(MEMBER_ID)]),
      [`DELETE ${USERS}/${MEMBER_ID}/sessions`]: () => ok({ userId: MEMBER_ID, scope: 'EXISTING_SESSIONS' }),
      [`DELETE ${USERS}/${ADMIN_ID}/sessions`]: () => ok({ userId: ADMIN_ID, scope: 'EXISTING_SESSIONS' }),
    })
    await screen.findByText(/· 본인/)

    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await user.click(within(row(ADMIN_ID)).getByRole('button', { name: '세션 종료' }))
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining('다시 로그인해야 합니다'))
    expect(api.calls('DELETE', `${USERS}/${ADMIN_ID}/sessions`)).toHaveLength(0)

    await user.click(within(row(MEMBER_ID)).getByRole('button', { name: '세션 종료' }))
    expect(await within(row(MEMBER_ID)).findByText('기존 세션을 모두 끝냈습니다.')).toBeInTheDocument()
    expect(api.calls('DELETE', `${USERS}/${MEMBER_ID}/sessions`)).toHaveLength(1)
  })
})
