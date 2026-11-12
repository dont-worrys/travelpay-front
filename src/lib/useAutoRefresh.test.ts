import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoRefresh } from './useAutoRefresh'

let visibility: DocumentVisibilityState = 'visible'

function setVisibility(next: DocumentVisibilityState) {
  visibility = next
  document.dispatchEvent(new Event('visibilitychange'))
}

/** 대기 중인 프로미스·타이머 콜백을 흘려보낸다. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAutoRefresh', () => {
  it('처음 한 번 조회하고 5초마다 다시 조회한다', async () => {
    let count = 0
    const load = vi.fn(async () => ++count)
    const { result } = renderHook(() => useAutoRefresh(load))

    await advance(0)
    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current.data).toBe(1)

    await advance(4999)
    expect(load).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(load).toHaveBeenCalledTimes(2)
    expect(result.current.data).toBe(2)
  })

  it('앞 조회가 끝나기 전에는 새 조회를 보내지 않는다', async () => {
    const pending = deferred<string>()
    const load = vi.fn((): Promise<string> => (load.mock.calls.length === 1 ? pending.promise : Promise.resolve('next')))
    const { result } = renderHook(() => useAutoRefresh(load))

    await advance(20_000)
    act(() => result.current.reload())
    setVisibility('visible')
    expect(load).toHaveBeenCalledTimes(1)

    await act(async () => pending.resolve('first'))
    expect(result.current.data).toBe('first')
    await advance(5000)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('갱신이 실패하면 마지막 정상 데이터를 유지하고 다음 주기에 다시 조회한다', async () => {
    const failure = new Error('down')
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('ok-1')
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce('ok-2')
    const { result } = renderHook(() => useAutoRefresh(load))

    await advance(0)
    expect(result.current.data).toBe('ok-1')

    await advance(5000)
    expect(result.current.data).toBe('ok-1')
    expect(result.current.error).toBe(failure)

    await advance(5000)
    expect(result.current.data).toBe('ok-2')
    expect(result.current.error).toBeNull()
  })

  it('탭이 보이지 않으면 멈추고, 다시 보이면 바로 조회한다', async () => {
    const load = vi.fn(async () => 'rate')
    renderHook(() => useAutoRefresh(load))
    await advance(0)
    expect(load).toHaveBeenCalledTimes(1)

    act(() => setVisibility('hidden'))
    await advance(30_000)
    expect(load).toHaveBeenCalledTimes(1)

    act(() => setVisibility('visible'))
    await advance(0)
    expect(load).toHaveBeenCalledTimes(2)
    await advance(5000)
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('탭이 보이지 않는 상태로 열리면 보일 때까지 조회하지 않는다', async () => {
    visibility = 'hidden'
    const load = vi.fn(async () => 'rate')
    renderHook(() => useAutoRefresh(load))
    await advance(10_000)
    expect(load).not.toHaveBeenCalled()

    act(() => setVisibility('visible'))
    await advance(0)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('enabled가 false인 동안은 조회하지 않고, true가 되면 바로 조회한다', async () => {
    const load = vi.fn(async () => 'rate')
    const { rerender, result } = renderHook(({ enabled }) => useAutoRefresh(load, { enabled }), {
      initialProps: { enabled: true },
    })
    await advance(0)
    expect(load).toHaveBeenCalledTimes(1)

    rerender({ enabled: false })
    await advance(30_000)
    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current.data).toBe('rate')

    rerender({ enabled: true })
    await advance(0)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('화면을 떠나면 진행 중인 조회를 취소하고 더 조회하지 않는다', async () => {
    let signal: AbortSignal | undefined
    const load = vi.fn((received: AbortSignal) => {
      signal = received
      return new Promise<string>(() => undefined)
    })
    const { unmount } = renderHook(() => useAutoRefresh(load))
    await advance(0)

    unmount()
    expect(signal?.aborted).toBe(true)
    await advance(30_000)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
