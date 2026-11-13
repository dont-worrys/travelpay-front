import { render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ChunkLoadError } from '../lib/chunkReload'
import { RouteError } from './RouteError'

function Throws({ error }: { error: unknown }): never {
  throw error
}

/** 앱(router.tsx)과 같은 모양: 레이아웃 아래 경로 없는 묶음에 RouteError. */
function renderWith(error: unknown) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <>
          <header>헤더</header>
          <Outlet />
        </>
      ),
      children: [{ errorElement: <RouteError />, children: [{ index: true, element: <Throws error={error} /> }] }],
    },
  ])
  render(<RouterProvider router={router} />)
}

describe('RouteError', () => {
  it('새로고침 뒤에도 청크를 못 받으면 헤더를 남긴 채 오류 안내와 새로고침 버튼을 보인다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWith(new ChunkLoadError(new TypeError('Failed to fetch dynamically imported module')))

    expect(screen.getByText('헤더')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('화면을 불러오지 못했습니다')
    expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument()
  })

  it('일반 오류는 안내하지 않고 다시 던져 라우터 기본 오류 화면으로 보낸다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderWith(new Error('화면 코드 오류'))

    expect(screen.queryByRole('button', { name: '새로고침' })).not.toBeInTheDocument()
    expect(screen.queryByText('헤더')).not.toBeInTheDocument()
    expect(screen.getByText('화면 코드 오류')).toBeInTheDocument()
  })
})
