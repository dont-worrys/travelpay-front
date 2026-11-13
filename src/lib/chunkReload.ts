/**
 * 화면 청크(라우트별 lazy 코드) 로딩 실패 처리(#55).
 *
 * 새로 배포하면 이전 버전의 청크 파일이 사라진다. 이미 열려 있던 탭이 아직 열지 않은 화면으로 가면 그 청크를 받지 못한다.
 * 이때만 페이지를 한 번 새로고침해 새 버전을 받는다. 무한 새로고침을 막으려고 sessionStorage에 표시를 남겨 1회만 허용하고,
 * 다시 실패하면 `ChunkLoadError`를 던져 오류 안내(`RouteError`)를 보이게 한다.
 * 청크를 정상으로 받으면 표시를 지워, 다음 배포 때 다시 1회 새로고침할 수 있게 한다.
 * 청크 로딩이 아닌 오류(화면 코드의 일반 오류 등)는 새로고침하지 않고 그대로 던진다.
 */

const RELOAD_KEY = 'travelpay.chunkReloadAt'

/** 브라우저별 동적 import 실패 문구(Chrome·Edge / Firefox / Safari)와 Vite 사전 로드 실패 문구. */
const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i

/** 자동 새로고침 뒤에도 화면 청크를 받지 못했다. */
export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super('화면 코드를 불러오지 못했습니다.', { cause })
    this.name = 'ChunkLoadError'
  }
}

/** 청크(동적 import) 로딩 실패인지. 일반 오류는 false. */
export function isChunkLoadError(error: unknown): boolean {
  if (error instanceof ChunkLoadError) {
    return true
  }
  return error instanceof Error && CHUNK_ERROR_PATTERN.test(error.message)
}

/** 아직 새로고침하지 않았으면 표시를 남기고 true. 이미 했거나 저장소를 쓸 수 없으면(1회 보장 불가) false. */
function claimReload(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) !== null) {
      return false
    }
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    return true
  } catch {
    return false
  }
}

function clearReloadMark() {
  try {
    sessionStorage.removeItem(RELOAD_KEY)
  } catch {
    // 저장소를 쓸 수 없으면 표시도 없다.
  }
}

/**
 * 청크를 불러온다. 청크 로딩 실패면 1회 새로고침(그동안 끝나지 않는 Promise로 로딩 표시 유지),
 * 이미 새로고침했으면 `ChunkLoadError`, 그 밖의 오류는 그대로 던진다.
 */
export function loadChunk<T>(load: () => Promise<T>, reload: () => void = () => window.location.reload()): Promise<T> {
  return load().then(
    (module) => {
      clearReloadMark()
      return module
    },
    (cause: unknown) => {
      if (!isChunkLoadError(cause)) {
        throw cause
      }
      if (claimReload()) {
        reload()
        return new Promise<T>(() => {})
      }
      throw new ChunkLoadError(cause)
    },
  )
}
