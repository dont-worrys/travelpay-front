import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { easeToward, installSmoothWheel, wheelDeltaPx } from './smoothWheel'

// jsdom에는 실제 스크롤·그리기가 없어서 스크롤 위치·프레임·시간을 이 테스트 안에서만 흉내 낸다.
let scrollY = 0
let now = 0
let frames: FrameRequestCallback[] = []
let reduceMotion = false
let uninstall: () => void = () => undefined

function setSize(el: Element, sizes: Partial<Record<'scrollHeight' | 'clientHeight' | 'scrollTop', number>>) {
  for (const [key, value] of Object.entries(sizes)) {
    Object.defineProperty(el, key, { configurable: true, value })
  }
}

function runFrames(count: number) {
  for (let i = 0; i < count && frames.length > 0; i++) {
    now += 16
    const due = frames
    frames = []
    due.forEach((callback) => callback(now))
  }
}

function wheel(init: WheelEventInit, target: Element = document.body) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

beforeEach(() => {
  scrollY = 0
  now = 0
  frames = []
  reduceMotion = false
  vi.stubGlobal('matchMedia', (query: string) => ({ media: query, get matches() { return reduceMotion } }))
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = []
  })
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'scrollTo').mockImplementation(((options: ScrollToOptions) => {
    scrollY = options.top ?? scrollY
  }) as typeof window.scrollTo)
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
  setSize(document.documentElement, { scrollHeight: 3000, clientHeight: 800 })
  uninstall = installSmoothWheel(window)
})

afterEach(() => {
  uninstall()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const key of ['scrollHeight', 'clientHeight']) {
    Reflect.deleteProperty(document.documentElement, key)
  }
  Reflect.deleteProperty(window, 'scrollY')
  document.body.innerHTML = ''
  document.body.removeAttribute('style')
})

describe('easeToward·wheelDeltaPx', () => {
  it('목표를 넘지 않고 다가가다 0.5px 안이면 목표에 붙는다', () => {
    let y = 0
    for (let i = 0; i < 100 && y !== 100; i++) {
      const next = easeToward(y, 100, 16)
      expect(next).toBeGreaterThan(y)
      expect(next).toBeLessThanOrEqual(100)
      y = next
    }
    expect(y).toBe(100)
    expect(easeToward(-50, -100, 16)).toBeLessThan(-50)
  })

  it('줄·쪽 단위 휠은 픽셀로 바꾼다', () => {
    expect(wheelDeltaPx({ deltaY: 100, deltaMode: 0 }, 800)).toBe(100)
    expect(wheelDeltaPx({ deltaY: 3, deltaMode: 1 }, 800)).toBe(48)
    expect(wheelDeltaPx({ deltaY: 1, deltaMode: 2 }, 800)).toBe(800)
  })
})

describe('installSmoothWheel', () => {
  it('휠 한 칸을 한 번에 건너뛰지 않고 여러 프레임에 나눠 같은 거리만큼 움직인다', () => {
    const event = wheel({ deltaY: 100 })

    expect(event.defaultPrevented).toBe(true)
    expect(scrollY).toBe(0)
    runFrames(1)
    expect(scrollY).toBeGreaterThan(0)
    expect(scrollY).toBeLessThan(100)
    runFrames(60)
    expect(scrollY).toBe(100)
    expect(frames).toHaveLength(0)
  })

  it('프레임 시각이 휠을 받은 시각보다 앞서도(브라우저는 프레임 시작 시각을 준다) 반대로 가거나 멈추지 않는다', () => {
    now = 1000
    wheel({ deltaY: 100 })
    const first = frames
    frames = []
    first.forEach((callback) => callback(990))
    expect(scrollY).toBeGreaterThanOrEqual(0)
    expect(frames).toHaveLength(1)

    runFrames(60)
    expect(scrollY).toBe(100)
  })

  it('움직이는 중에 더 굴리면 목표가 이어서 늘어난다', () => {
    wheel({ deltaY: 100 })
    runFrames(2)
    wheel({ deltaY: 100 })
    runFrames(60)

    expect(scrollY).toBe(200)
  })

  it('문서 끝을 넘지 않고, 끝에서 더 밀면 브라우저 기본 동작에 맡긴다', () => {
    wheel({ deltaY: 5000 })
    runFrames(80)
    expect(scrollY).toBe(2200)

    const atBottom = wheel({ deltaY: 100 })
    expect(atBottom.defaultPrevented).toBe(false)

    scrollY = 0
    const atTop = wheel({ deltaY: -100 })
    expect(atTop.defaultPrevented).toBe(false)
  })

  it.each([
    ['Ctrl+휠(확대·축소)', { deltaY: 100, ctrlKey: true }],
    ['Shift+휠', { deltaY: 100, shiftKey: true }],
    ['가로 휠', { deltaX: 120, deltaY: 10 }],
  ])('%s에는 손대지 않는다', (_label, init) => {
    const event = wheel(init)

    expect(event.defaultPrevented).toBe(false)
    expect(frames).toHaveLength(0)
  })

  it('"움직임 줄이기"를 켠 사람에게는 손대지 않는다', () => {
    reduceMotion = true

    expect(wheel({ deltaY: 100 }).defaultPrevented).toBe(false)
  })

  it('같은 방향으로 더 스크롤할 수 있는 안쪽 영역 위에서는 그 영역에 맡기고, 끝까지 내려갔으면 페이지를 움직인다', () => {
    const box = document.createElement('div')
    box.style.overflowY = 'auto'
    const item = document.createElement('p')
    box.append(item)
    document.body.append(box)
    setSize(box, { scrollHeight: 500, clientHeight: 100, scrollTop: 0 })

    expect(wheel({ deltaY: 100 }, item).defaultPrevented).toBe(false)

    setSize(box, { scrollTop: 400 })
    expect(wheel({ deltaY: 100 }, item).defaultPrevented).toBe(true)
  })

  it('페이지 스크롤이 잠겨 있으면 손대지 않는다', () => {
    document.body.style.overflowY = 'hidden'

    expect(wheel({ deltaY: 100 }).defaultPrevented).toBe(false)
  })

  it('다른 수단으로 위치가 바뀌면(화면 이동 때 맨 위로 등) 그 위치를 따르고 멈춘다', () => {
    wheel({ deltaY: 300 })
    runFrames(2)
    expect(scrollY).toBeGreaterThan(0)

    scrollY = 0
    runFrames(10)

    expect(scrollY).toBe(0)
    expect(frames).toHaveLength(0)
  })

  it('해제하면 더는 휠을 가로채지 않는다', () => {
    uninstall()
    uninstall = () => undefined

    expect(wheel({ deltaY: 100 }).defaultPrevented).toBe(false)
  })
})
