import { render, screen } from '@testing-library/react'
import { Suspense, type ComponentType } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { lazyPage, preloadGroup } from './lazyPage'

function Hello() {
  return <p>안녕 화면</p>
}

function setup(group: 'public' | 'user' | 'admin') {
  const Page = lazyPage(() => Promise.resolve({ Hello }), 'Hello', group)
  return render(
    <Suspense fallback={<p>불러오는 중</p>}>
      <Page />
    </Suspense>,
  )
}

describe('lazyPage', () => {
  it('미리 받지 않은 화면은 받는 동안 로딩을 보이고, 받은 뒤 그린다', async () => {
    setup('admin')

    expect(screen.getByText('불러오는 중')).toBeInTheDocument()
    expect(await screen.findByText('안녕 화면')).toBeInTheDocument()
  })

  it('미리 받아 둔 화면은 로딩 없이 바로 그린다', async () => {
    const Page = lazyPage(() => Promise.resolve({ Hello }), 'Hello', 'user')
    await preloadGroup('user')

    render(
      <Suspense fallback={<p>불러오는 중</p>}>
        <Page />
      </Suspense>,
    )

    // 첫 렌더 직후(기다리지 않고) 화면이 있고 로딩은 한 번도 나오지 않는다.
    expect(screen.getByText('안녕 화면')).toBeInTheDocument()
    expect(screen.queryByText('불러오는 중')).not.toBeInTheDocument()
  })

  it('미리 받기에 실패해도 오류를 던지지 않는다', async () => {
    lazyPage(
      () => Promise.reject<{ Hello: ComponentType }>(new Error('Failed to fetch dynamically imported module')),
      'Hello',
      'public',
    )

    await expect(preloadGroup('public')).resolves.toBeUndefined()
  })
})

// 미리 받기 상태는 모듈에 남으므로 테스트마다 모듈을 새로 불러온다.
describe('preloadedPagesReady', () => {
  it('시작한 묶음을 모두 받아야 true이고, 받는 중에는 false다', async () => {
    vi.resetModules()
    const mod = await import('./lazyPage')
    let release: () => void = () => undefined
    mod.lazyPage(() => Promise.resolve({ Hello }), 'Hello', 'public')
    mod.lazyPage(() => new Promise<{ Hello: ComponentType }>((resolve) => (release = () => resolve({ Hello }))), 'Hello', 'user')

    expect(mod.preloadedPagesReady()).toBe(false)
    await mod.preloadGroup('public')
    expect(mod.preloadedPagesReady()).toBe(true)

    const pending = mod.preloadGroup('user')
    expect(mod.preloadedPagesReady()).toBe(false)
    release()
    await pending
    expect(mod.preloadedPagesReady()).toBe(true)
  })

  it('한 화면이라도 미리 받기에 실패한 묶음이 있으면 false로 남는다', async () => {
    vi.resetModules()
    const mod = await import('./lazyPage')
    mod.lazyPage(() => Promise.resolve({ Hello }), 'Hello', 'admin')
    mod.lazyPage(() => Promise.reject<{ Hello: ComponentType }>(new Error('chunk')), 'Hello', 'admin')

    await mod.preloadGroup('admin')

    expect(mod.preloadedPagesReady()).toBe(false)
  })
})
