/**
 * 마우스 휠 스크롤을 여러 프레임에 나눠 부드럽게 움직인다.
 * 리눅스의 Chromium 계열(Brave 등)은 휠 한 칸에 100px을 한 프레임 만에 건너뛰어 덜컹거린다(측정값).
 * 화면 자체는 60fps로 그려지므로 그리기가 아니라 이동 방식을 바꾼다. 라이브러리 없이 필요한 만큼만 둔다.
 *
 * 브라우저 기본 동작에 맡기는 경우: 확대·축소(Ctrl/⌘+휠), 가로 휠(Shift 포함), "움직임 줄이기" 설정,
 * 같은 방향으로 더 스크롤할 수 있는 안쪽 영역 위, 페이지 스크롤이 잠긴 상태(overflow: hidden), 문서 끝에서 더 미는 경우.
 * 스크롤바 끌기·키보드·화면 이동 때 맨 위로처럼 다른 수단으로 위치가 바뀌면 그 위치를 따르고 멈춘다.
 * 터치 스크롤은 휠 이벤트가 아니므로 그대로다.
 */

/** 남은 거리의 약 63%를 따라가는 시간. 작을수록 빨리 멈춘다(약 0.3초 안에 끝남). */
const FOLLOW_MS = 80
const LINE_PX = 16

/** dt 동안 목표로 다가간 위치. 목표를 넘거나 반대로 가지 않고(음수 dt는 0), 0.5px 안이면 목표에 붙인다. */
export function easeToward(current: number, target: number, dtMs: number): number {
  const next = current + (target - current) * (1 - Math.exp(-Math.max(0, dtMs) / FOLLOW_MS))
  return Math.abs(target - next) < 0.5 ? target : next
}

/** 휠 한 번의 세로 이동 거리(px). 줄·쪽 단위로 오는 브라우저는 픽셀로 바꾼다. */
export function wheelDeltaPx(event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>, viewportHeight: number): number {
  if (event.deltaMode === 1) {
    return event.deltaY * LINE_PX
  }
  if (event.deltaMode === 2) {
    return event.deltaY * viewportHeight
  }
  return event.deltaY
}

function canScrollInside(target: EventTarget | null, deltaY: number, win: Window): boolean {
  const doc = win.document
  for (let el = target instanceof Element ? target : null; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
    if (!/(auto|scroll|overlay)/.test(win.getComputedStyle(el).overflowY) || el.scrollHeight <= el.clientHeight) {
      continue
    }
    if (deltaY > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) {
      return true
    }
  }
  return false
}

function scrollLocked(win: Window): boolean {
  const { documentElement, body } = win.document
  return [documentElement, body].some((el) => /hidden|clip/.test(win.getComputedStyle(el).overflowY))
}

/** 창에 부드러운 휠 스크롤을 건다. 돌려준 함수를 부르면 해제한다. */
export function installSmoothWheel(win: Window = window): () => void {
  const root = win.document.scrollingElement ?? win.document.documentElement
  const reduceMotion = win.matchMedia('(prefers-reduced-motion: reduce)')
  let current = 0
  let target = 0
  let lastTime = 0
  let frame = 0

  function stop() {
    win.cancelAnimationFrame(frame)
    frame = 0
  }

  function step(now: number) {
    // 그사이 다른 수단으로 위치가 바뀌었으면 그 위치를 따르고 멈춘다.
    if (Math.abs(win.scrollY - current) > 1) {
      stop()
      return
    }
    // 브라우저는 프레임 시작 시각을 주므로 첫 프레임은 휠을 받은 시각보다 앞설 수 있다(경과 0으로 본다).
    current = easeToward(current, target, Math.min(now - lastTime, 64))
    lastTime = Math.max(lastTime, now)
    win.scrollTo({ top: current, behavior: 'instant' })
    frame = current === target ? 0 : win.requestAnimationFrame(step)
  }

  function onWheel(event: WheelEvent) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || reduceMotion.matches) {
      return
    }
    if (event.deltaY === 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      return
    }
    if (scrollLocked(win) || canScrollInside(event.target, event.deltaY, win)) {
      return
    }
    const max = root.scrollHeight - root.clientHeight
    if (frame === 0) {
      current = win.scrollY
      target = current
    }
    const next = Math.min(max, Math.max(0, target + wheelDeltaPx(event, win.innerHeight)))
    if (next === target) {
      // 움직이는 중에 끝을 더 밀면 브라우저가 따로 점프하지 않게 막고, 멈춰 있으면 기본 동작(바운스 등)에 맡긴다.
      if (frame !== 0) {
        event.preventDefault()
      }
      return
    }
    event.preventDefault()
    target = next
    if (frame === 0) {
      lastTime = win.performance.now()
      frame = win.requestAnimationFrame(step)
    }
  }

  win.addEventListener('wheel', onWheel, { passive: false })
  return () => {
    stop()
    win.removeEventListener('wheel', onWheel)
  }
}
