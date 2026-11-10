import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCsrfToken } from '../../api'
import { fail, mockFetch, networkError, ok, type RouteHandler } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { AdminTermsListPage } from './AdminTermsListPage'
import { AdminTermsNewPage } from './AdminTermsNewPage'

const TERMS = '/api/v1/admin/terms'
const LOCAL_TIME = '2099-01-01T09:00'
const ISO = new Date(LOCAL_TIME).toISOString()

function term(overrides: Record<string, unknown> = {}) {
  return {
    termsCode: 'SERVICE_TERMS',
    termsVersion: '2026-10-01',
    title: '서비스 이용약관',
    content: '제1조 목적',
    isRequired: true,
    effectiveAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

function renderNew(routes: Record<string, RouteHandler>, entry = '/admin/terms/new') {
  const api = mockFetch(routes)
  renderRoute('/admin/terms/new', <AdminTermsNewPage />, entry)
  return api
}

async function fill(user: ReturnType<typeof userEvent.setup>, code = 'SERVICE_TERMS') {
  await user.clear(screen.getByLabelText(/^약관 코드/))
  await user.type(screen.getByLabelText(/^약관 코드/), code)
  await user.type(screen.getByLabelText('버전'), '2027-01-01')
  await user.type(screen.getByLabelText('제목'), '서비스 이용약관')
  await user.type(screen.getByLabelText('본문'), '제1조 목적')
  fireEvent.change(screen.getByLabelText(/^시행 시각/), { target: { value: LOCAL_TIME } })
}

describe('AdminTermsNewPage', () => {
  beforeEach(() => {
    clearCsrfToken()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('입력값을 UTC 시각으로 보내고 등록 결과를 보여 준다', async () => {
    const user = userEvent.setup()
    const api = renderNew(
      { [`POST ${TERMS}`]: () => ok(term({ termsVersion: '2027-01-01', effectiveAt: ISO }), 201) },
      '/admin/terms/new?termsCode=SERVICE_TERMS',
    )
    expect(screen.getByLabelText(/^약관 코드/)).toHaveValue('SERVICE_TERMS')
    await fill(user)
    await user.click(screen.getByLabelText('가입 때 필수 동의'))
    await user.click(screen.getByRole('button', { name: '등록' }))

    expect(await screen.findByText('새 약관 버전을 등록했습니다. 시행 시각부터 가입 화면에 보입니다.')).toBeInTheDocument()
    expect(api.calls('POST', TERMS)[0]!.body).toEqual({
      termsCode: 'SERVICE_TERMS',
      termsVersion: '2027-01-01',
      title: '서비스 이용약관',
      content: '제1조 목적',
      isRequired: false,
      effectiveAt: ISO,
    })
    expect(screen.getByRole('link', { name: '이 코드의 버전 목록' })).toHaveAttribute(
      'href',
      '/admin/terms?termsCode=SERVICE_TERMS',
    )
  })

  it('규칙에 맞지 않는 입력은 보내지 않는다', async () => {
    const user = userEvent.setup()
    const api = renderNew({})
    await fill(user, 'service_terms')
    fireEvent.change(screen.getByLabelText(/^시행 시각/), { target: { value: '2020-01-01T00:00' } })
    await user.click(screen.getByRole('button', { name: '등록' }))

    expect(screen.getByText(/약관 코드는 대문자로 시작하는/)).toBeInTheDocument()
    expect(screen.getByText('시행 시각은 지금보다 1분 이상 뒤여야 합니다.')).toBeInTheDocument()
    expect(api.calls('POST', TERMS)).toHaveLength(0)
  })

  it('서버 검증 오류는 항목 옆에, 충돌은 안내 문구로 보여 준다', async () => {
    const user = userEvent.setup()
    renderNew({
      [`POST ${TERMS}`]: (_request, index) =>
        index === 0
          ? fail(400, 'COMMON_INVALID_REQUEST', '입력값을 확인해 주세요.', [
              { field: 'title', message: '약관 제목은 200자 이내로 입력해 주세요.' },
            ])
          : fail(409, 'USER_TERMS_VERSION_CONFLICT', '충돌'),
    })
    await fill(user)
    await user.click(screen.getByRole('button', { name: '등록' }))
    expect(await screen.findByText('약관 제목은 200자 이내로 입력해 주세요.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '등록' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('같은 약관 코드에 같은 버전이나 같은 시행 시각이 이미 있습니다.')
    expect(screen.queryByText('약관 제목은 200자 이내로 입력해 주세요.')).not.toBeInTheDocument()
  })

  it('결과를 모른 뒤 다시 보내 409가 오면 이미 등록됐을 수 있다고 안내한다', async () => {
    const user = userEvent.setup()
    renderNew({
      [`POST ${TERMS}`]: (_request, index) =>
        index === 0 ? networkError() : fail(409, 'USER_TERMS_VERSION_CONFLICT', '충돌'),
    })
    await fill(user)
    await user.click(screen.getByRole('button', { name: '등록' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('등록됐는지 알 수 없습니다.')
    expect(screen.getByLabelText('제목')).toHaveValue('서비스 이용약관')

    await user.click(screen.getByRole('button', { name: '등록' }))
    expect(await screen.findByText(/앞서 결과를 모르던 요청으로 이미 등록됐을 수 있습니다/)).toBeInTheDocument()
  })
})

describe('AdminTermsListPage', () => {
  it('시행 중·시행 예정·지난 버전을 구분하고 약관 코드로 거른다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({
      'GET /api/v1/terms': () => ok({ terms: [term()] }),
      [`GET ${TERMS}`]: () =>
        ok({
          items: [
            term({ termsVersion: '2099-01-01', effectiveAt: '2099-01-01T00:00:00Z' }),
            term(),
            term({ termsVersion: '2026-01-01', effectiveAt: '2026-01-01T00:00:00Z' }),
          ],
          page: 0,
          size: 20,
          hasNext: false,
        }),
    })
    renderRoute('/admin/terms', <AdminTermsListPage />, '/admin/terms')

    expect(await screen.findByText('시행 예정')).toBeInTheDocument()
    expect(await screen.findByText('시행 중')).toBeInTheDocument()
    expect(screen.getByText('지난 버전')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^약관 코드/), 'PRIVACY_TERMS')
    await user.click(screen.getByRole('button', { name: '검색' }))
    await screen.findByText('시행 예정')
    expect(new URLSearchParams(api.calls('GET', TERMS).at(-1)!.search).get('termsCode')).toBe('PRIVACY_TERMS')
    expect(screen.getByRole('link', { name: '새 버전 등록' })).toHaveAttribute(
      'href',
      '/admin/terms/new?termsCode=PRIVACY_TERMS',
    )
  })
})
