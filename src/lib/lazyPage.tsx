import { lazy, type ComponentType } from 'react'
import { loadChunk } from './chunkReload'

/**
 * 화면(페이지) 코드 분리 + 미리 받기(#55).
 *
 * 화면은 라우트마다 별도 청크로 나눠 처음 필요한 코드만 내려받는다. 다만 화면을 옮길 때마다 청크를 그때 받으면
 * 그 사이 "화면을 불러오는 중"이 보이므로, 앱이 뜬 뒤 쉬는 시간에 나머지 화면 코드를 미리 받아 둔다(`preloadPages`).
 * 미리 받은 화면은 `React.lazy`를 거치지 않고 바로 그려서, 이동할 때 로딩 상태가 생기지 않는다.
 * 미리 받기에 실패해도 조용히 넘어가고, 실제로 그 화면에 들어갈 때 다시 시도(`loadChunk`: 배포 직후 1회 새로고침·오류 안내)한다.
 */
export type PageGroup = 'public' | 'user' | 'admin'

/** 미리 받기 함수는 성공 여부를 돌려준다(실패는 조용히 false). */
const preloaders: Record<PageGroup, Array<() => Promise<boolean>>> = { public: [], user: [], admin: [] }
const started = new Set<PageGroup>()
const ready = new Set<PageGroup>()

/**
 * 페이지 모듈은 이름 있는 내보내기라 `React.lazy`가 요구하는 default로 바꿔 준다.
 * 내려받는 동안의 로딩 표시는 `AppLayout`의 `Suspense`가 맡는다.
 */
export function lazyPage<K extends string>(load: () => Promise<{ [P in K]: ComponentType }>, name: K, group: PageGroup) {
  let loaded: ComponentType | null = null
  const Lazy = lazy(() =>
    loadChunk(load).then((module) => {
      const component: ComponentType = module[name]
      loaded = component
      return { default: component }
    }),
  )
  preloaders[group].push(() =>
    load().then(
      (module) => {
        loaded = module[name]
        return true
      },
      () => false,
    ),
  )
  function Page() {
    const Loaded = loaded
    return Loaded ? <Loaded /> : <Lazy />
  }
  Page.displayName = `Page(${name})`
  return Page
}

/** 그룹의 화면 코드를 지금 바로 받는다(이미 시작했으면 다시 받지 않는다). */
export async function preloadGroup(group: PageGroup): Promise<void> {
  if (started.has(group)) {
    return
  }
  started.add(group)
  const results = await Promise.all(preloaders[group].map((preload) => preload()))
  if (results.every(Boolean)) {
    ready.add(group)
  }
}

/**
 * 미리 받기를 시작한 화면 묶음을 모두 받았는지. 받는 중이거나 하나라도 실패했으면 false.
 * 화면 전환 모션(lib/viewTransition)은 이때만 켠다. 아직 없는 화면 코드를 기다리는 동안에는 브라우저가
 * 전환 중 그리기를 멈춰 화면이 굳은 것처럼 보이기 때문이다.
 */
export function preloadedPagesReady(): boolean {
  return started.size > 0 && [...started].every((group) => ready.has(group))
}

/** 브라우저가 한가할 때 그룹의 화면 코드를 미리 받는다. */
export function preloadPages(...groups: PageGroup[]) {
  const run = () => {
    for (const group of groups) {
      void preloadGroup(group)
    }
  }
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 2000 })
  } else {
    setTimeout(run, 200)
  }
}
