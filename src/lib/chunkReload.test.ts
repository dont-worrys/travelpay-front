import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChunkLoadError, isChunkLoadError, loadChunk } from './chunkReload'

const KEY = 'travelpay.chunkReloadAt'
const chunkError = () => new TypeError('Failed to fetch dynamically imported module: /assets/WalletPage-old.js')

/** 끝나지 않는 Promise인지(새로고침을 기다리며 로딩 표시를 유지) 확인한다. */
async function isPending(promise: Promise<unknown>) {
  const marker = Symbol('pending')
  const result = await Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(marker), 20))])
  return result === marker
}

describe('loadChunk', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => sessionStorage.clear())

  it('청크 로딩에 처음 실패하면 1회 새로고침하고 결과를 기다린다', async () => {
    const reload = vi.fn()
    const promise = loadChunk(() => Promise.reject(chunkError()), reload)

    expect(await isPending(promise)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(KEY)).not.toBeNull()
  })

  it('새로고침 뒤에도 실패하면 다시 새로고침하지 않고 ChunkLoadError를 던진다', async () => {
    sessionStorage.setItem(KEY, '1')
    const reload = vi.fn()

    await expect(loadChunk(() => Promise.reject(chunkError()), reload)).rejects.toBeInstanceOf(ChunkLoadError)
    expect(reload).not.toHaveBeenCalled()
  })

  it('청크를 받으면 표시를 지워 다음 배포 때 다시 1회 새로고침할 수 있다', async () => {
    sessionStorage.setItem(KEY, '1')

    await expect(loadChunk(() => Promise.resolve({ Page: 'ok' }))).resolves.toEqual({ Page: 'ok' })
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('청크 로딩이 아닌 오류는 새로고침하지 않고 그대로 던진다', async () => {
    const reload = vi.fn()
    const bug = new ReferenceError('foo is not defined')

    await expect(loadChunk(() => Promise.reject(bug), reload)).rejects.toBe(bug)
    expect(reload).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('저장소를 쓸 수 없으면 1회를 보장할 수 없어 새로고침하지 않고 안내로 보낸다', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const reload = vi.fn()

    await expect(loadChunk(() => Promise.reject(chunkError()), reload)).rejects.toBeInstanceOf(ChunkLoadError)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('isChunkLoadError', () => {
  it('브라우저별 동적 import 실패 문구만 청크 오류로 본다', () => {
    expect(isChunkLoadError(chunkError())).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true)
    expect(isChunkLoadError(new ChunkLoadError(chunkError()))).toBe(true)

    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isChunkLoadError(new Error('boom'))).toBe(false)
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
  })
})
