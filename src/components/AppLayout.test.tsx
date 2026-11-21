import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { mockFetch, ok } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { AppLayout } from './AppLayout'

const auth = vi.hoisted(() => ({ state: { status: 'anonymous' } as Record<string, unknown>, logout: vi.fn() }))
vi.mock('../features/auth/useAuth', () => ({ useAuth: () => auth }))

describe('AppLayout 헤더', () => {
  it('비로그인이면 오른쪽에 로그인 버튼만 두고 회원가입은 두지 않는다(회원가입은 로그인 화면에서 이어진다)', () => {
    auth.state = { status: 'anonymous' }
    mockFetch({ 'GET /api/v1/exchange-rates': () => ok([]) })
    renderRoute('/', <AppLayout />, '/')

    const header = screen.getByRole('banner')
    const loginNav = within(header).getByRole('navigation', { name: '로그인' })
    expect(within(loginNav).getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login')
    expect(within(header).queryByRole('link', { name: '회원가입' })).not.toBeInTheDocument()
  })

  it('로고는 홈으로 가고 이름(TravelPay)은 글자로 읽힌다', () => {
    auth.state = { status: 'anonymous' }
    mockFetch({ 'GET /api/v1/exchange-rates': () => ok([]) })
    renderRoute('/', <AppLayout />, '/')

    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'TravelPay' })).toHaveAttribute('href', '/')
  })
})

describe('AppLayout 일반회원 메뉴', () => {
  function renderAsUser(path: string) {
    auth.state = { status: 'authenticated', me: { userId: 'u-1', realName: '김여행', role: 'USER' } }
    mockFetch({
      'GET /api/v1/exchange-rates': () => ok([]),
      'GET /api/v1/users/me/notifications/unread-count': () => ok({ count: 0 }),
    })
    renderRoute('*', <AppLayout />, path)
  }

  function activeLinks(navName: string) {
    return within(screen.getByRole('navigation', { name: navName }))
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent)
  }

  it('송금·결제는 바로 하기 화면으로 가고, 맨 끝 "내역"은 충전 내역에서 시작한다', () => {
    renderAsUser('/')

    const menu = within(screen.getByRole('navigation', { name: '전체 메뉴' }))
    expect(menu.getAllByRole('link').map((link) => link.textContent)).toEqual(['지갑', '송금', '결제', '환전', '가맹점', '내역'])
    expect(menu.getByRole('link', { name: '송금' })).toHaveAttribute('href', '/transfers/new')
    expect(menu.getByRole('link', { name: '결제' })).toHaveAttribute('href', '/payments/new')
    expect(menu.getByRole('link', { name: '내역' })).toHaveAttribute('href', '/wallet/charges')
    const tabs = within(screen.getByRole('navigation', { name: '주요 메뉴' }))
    expect(tabs.getByRole('link', { name: '송금' })).toHaveAttribute('href', '/transfers/new')
    expect(tabs.getByRole('link', { name: '내역' })).toHaveAttribute('href', '/wallet/charges')
  })

  it.each([
    ['/transfers', ['내역'], ['내역']],
    ['/transfers/new', ['송금'], ['송금']],
    ['/transfers/aaaa-1', ['내역'], ['내역']],
    ['/payments/new', ['결제'], []],
    ['/wallet', ['지갑'], ['지갑·충전']],
    ['/wallet/charge', ['지갑'], ['지갑·충전']],
    ['/wallet/charges', ['내역'], ['내역']],
    ['/wallet/charges/c-1', ['내역'], ['내역']],
    ['/wallet/settlements', ['내역'], ['내역']],
    ['/exchange-reservations/new', ['환전'], ['환전']],
    ['/exchanges/o-1', ['내역'], ['내역']],
    ['/merchant/m-1', ['가맹점'], []],
  ])('%s에서는 상단 메뉴 %j, 하단 탭 %j만 선택 표시한다', (path, menu, tabs) => {
    renderAsUser(path)

    expect(activeLinks('전체 메뉴')).toEqual(menu)
    expect(activeLinks('주요 메뉴')).toEqual(tabs)
  })
})

describe('AppLayout 푸터', () => {
  it('서비스 소개 아래에 저작권 표기를 둔다', () => {
    auth.state = { status: 'anonymous' }
    mockFetch({ 'GET /api/v1/exchange-rates': () => ok([]) })
    renderRoute('/', <AppLayout />, '/')

    expect(within(screen.getByRole('contentinfo')).getByText('© 2026 DontWorry. All rights reserved.')).toBeInTheDocument()
  })
})

describe('AppLayout 알림 아이콘', () => {
  it('일반회원은 헤더에 알림 아이콘과 읽지 않은 개수 배지를 보고, 누르면 알림 목록으로 간다', async () => {
    auth.state = { status: 'authenticated', me: { userId: 'u-1', realName: '김여행', role: 'USER' } }
    mockFetch({
      'GET /api/v1/exchange-rates': () => ok([]),
      'GET /api/v1/users/me/notifications/unread-count': () => ok({ count: 3 }),
    })
    renderRoute('*', <AppLayout />, '/')

    const bell = await within(screen.getByRole('banner')).findByRole('link', { name: '알림, 읽지 않은 알림 3개' })
    expect(bell).toHaveAttribute('href', '/notifications')
    expect(bell).toHaveTextContent('3')
  })

  it('읽지 않은 알림이 100개 이상이면 배지는 99+로 줄인다', async () => {
    auth.state = { status: 'authenticated', me: { userId: 'u-1', realName: '김여행', role: 'USER' } }
    mockFetch({
      'GET /api/v1/exchange-rates': () => ok([]),
      'GET /api/v1/users/me/notifications/unread-count': () => ok({ count: 120 }),
    })
    renderRoute('*', <AppLayout />, '/')

    expect(await screen.findByRole('link', { name: '알림, 읽지 않은 알림 120개' })).toHaveTextContent('99+')
  })

  it('관리자(MASTER)에게는 알림 아이콘을 보이지 않고 개수도 조회하지 않는다', () => {
    auth.state = { status: 'authenticated', me: { userId: 'm-1', realName: '관리자', role: 'MASTER' } }
    const api = mockFetch({ 'GET /api/v1/exchange-rates': () => ok([]) })
    renderRoute('*', <AppLayout />, '/admin')

    expect(screen.queryByRole('link', { name: /^알림/ })).not.toBeInTheDocument()
    expect(api.calls('GET', '/api/v1/users/me/notifications/unread-count')).toHaveLength(0)
  })

  it('비로그인에게는 알림 아이콘을 보이지 않는다', () => {
    auth.state = { status: 'anonymous' }
    const api = mockFetch({ 'GET /api/v1/exchange-rates': () => ok([]) })
    renderRoute('/', <AppLayout />, '/')

    expect(screen.queryByRole('link', { name: /^알림/ })).not.toBeInTheDocument()
    expect(api.calls('GET', '/api/v1/users/me/notifications/unread-count')).toHaveLength(0)
  })
})
