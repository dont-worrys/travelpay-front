import { Link, useRouteError } from 'react-router'
import { isChunkLoadError } from '../lib/chunkReload'

/**
 * 화면 경로의 오류 표시(router.tsx). 자동 새로고침 뒤에도 화면 청크를 받지 못한 경우만 안내하고,
 * 그 밖의 오류는 다시 던져 기존과 같이 라우터 기본 오류 화면으로 보낸다. 헤더·탭바는 그대로 남는다.
 */
export function RouteError() {
  const error = useRouteError()
  if (!isChunkLoadError(error)) {
    throw error
  }
  return (
    <section>
      <h1>화면을 불러오지 못했습니다</h1>
      <p className="error" role="alert">
        새 버전이 배포됐거나 연결이 불안정해 화면을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.
      </p>
      <div className="actions">
        <button type="button" className="primary" onClick={() => window.location.reload()}>
          새로고침
        </button>
        <Link to="/">처음으로</Link>
      </div>
    </section>
  )
}
