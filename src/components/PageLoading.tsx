/** 화면 코드(라우트 청크)를 내려받는 동안 본문 자리에 보이는 공통 로딩. 헤더·탭바는 그대로 둔다. */
export function PageLoading() {
  return (
    <p className="loading" role="status">
      화면을 불러오는 중입니다…
    </p>
  )
}
