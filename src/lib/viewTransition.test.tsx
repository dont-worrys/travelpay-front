import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createBrowserRouter, Link, Navigate, RouterProvider, useNavigate } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withDefaultViewTransition } from './viewTransition'

function fakeStartViewTransition() {
  return vi.fn((update: () => unknown) => {
    const done = Promise.resolve().then(update)
    return {
      finished: done.then(() => undefined),
      ready: Promise.resolve(),
      updateCallbackDone: done,
      skipTransition: vi.fn(),
    }
  })
}

/** jsdom에는 없는 document.startViewTransition을 이 테스트 동안만 둔다. */
function supportViewTransition() {
  const start = fakeStartViewTransition()
  Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true, writable: true })
  return start
}

function BackButton() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      뒤로
    </button>
  )
}

let dispose: (() => void) | null = null

function setup(canTransition: () => boolean = () => true) {
  window.history.replaceState(null, '', '/')
  const router = withDefaultViewTransition(
    createBrowserRouter([
      {
        path: '/',
        element: (
          <>
            <p>첫 화면</p>
            <Link to="/next">다음 화면으로</Link>
            <Link to="/next" viewTransition={false}>
              전환 없이
            </Link>
            <Link to="/next" replace>
              바꿔서 이동
            </Link>
            <Link to="/redirect">리다이렉트로</Link>
            <Link to="?page=2">다음 페이지</Link>
          </>
        ),
      },
      {
        path: '/next',
        element: (
          <>
            <p>다음 화면</p>
            <BackButton />
          </>
        ),
      },
      { path: '/redirect', element: <Navigate to="/next" replace /> },
    ]),
    canTransition,
  )
  dispose = () => router.dispose()
  render(<RouterProvider router={router} />)
  return { user: userEvent.setup(), router }
}

afterEach(() => {
  dispose?.()
  dispose = null
  Reflect.deleteProperty(document, 'startViewTransition')
  vi.restoreAllMocks()
})

describe('withDefaultViewTransition', () => {
  it('지원 브라우저에서 화면 코드가 준비됐으면 링크 이동이 View Transition을 거쳐 새 화면을 그린다', async () => {
    const start = supportViewTransition()
    const { user } = setup()

    await user.click(screen.getByRole('link', { name: '다음 화면으로' }))

    expect(await screen.findByText('다음 화면')).toBeInTheDocument()
    expect(start).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['viewTransition={false}로 끈 링크', '전환 없이', '다음 화면'],
    ['replace 이동', '바꿔서 이동', '다음 화면'],
  ])('%s도 거치지 않는다', async (_label, linkName, expected) => {
    const start = supportViewTransition()
    const { user } = setup()

    await user.click(screen.getByRole('link', { name: linkName }))

    expect(await screen.findByText(expected)).toBeInTheDocument()
    expect(start).not.toHaveBeenCalled()
  })

  it('검색어만 바꾸는 이동(목록 필터·페이지)은 화면 전체를 전환하지 않는다', async () => {
    const start = supportViewTransition()
    const { user, router } = setup()

    await user.click(screen.getByRole('link', { name: '다음 페이지' }))

    await vi.waitFor(() => expect(router.state.location.search).toBe('?page=2'))
    expect(start).not.toHaveBeenCalled()
  })

  it('링크 이동 중 리다이렉트(<Navigate replace>)가 이어져도 전환은 한 번뿐이다', async () => {
    const start = supportViewTransition()
    const { user, router } = setup()

    await user.click(screen.getByRole('link', { name: '리다이렉트로' }))

    expect(await screen.findByText('다음 화면')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/next')
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('뒤로 가기는 앞서 전환한 화면이라도 다시 전환하지 않고 바로 바뀐다', async () => {
    const start = supportViewTransition()
    const { user } = setup()
    await user.click(screen.getByRole('link', { name: '다음 화면으로' }))
    await screen.findByText('다음 화면')

    await user.click(screen.getByRole('button', { name: '뒤로' }))

    expect(await screen.findByText('첫 화면')).toBeInTheDocument()
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('화면 코드를 아직 다 받지 못했으면 전환하지 않는다(받는 동안 화면이 굳지 않게)', async () => {
    const start = supportViewTransition()
    const { user } = setup(() => false)

    await user.click(screen.getByRole('link', { name: '다음 화면으로' }))

    expect(await screen.findByText('다음 화면')).toBeInTheDocument()
    expect(start).not.toHaveBeenCalled()
  })

  it('지원하지 않는 브라우저에서는 그대로 이동하고 라우터 경고도 내지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { user } = setup()

    await user.click(screen.getByRole('link', { name: '다음 화면으로' }))

    expect(await screen.findByText('다음 화면')).toBeInTheDocument()
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('viewTransition'))
  })
})
