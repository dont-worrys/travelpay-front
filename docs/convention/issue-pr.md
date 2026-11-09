# 이슈와 PR 양식

이슈·PR 양식의 원본은 `.github`의 템플릿 파일입니다. GitHub에서 이슈나 PR을 만들면 자동으로 채워지므로 이 문서에는 제목 규칙과 작성 요령만 둡니다. 양식을 바꿀 때는 템플릿 파일을 고칩니다.

| 종류 | 템플릿 | 제목 예시 |
|---|---|---|
| 버그 | `.github/ISSUE_TEMPLATE/bug_report.md` | `[BUG] 충전 요청 처리 상태가 갱신되지 않음` |
| 기능 | `.github/ISSUE_TEMPLATE/feature_request.md` | `[FEAT] 일반 회원가입 API 추가` |
| 리팩토링 | `.github/ISSUE_TEMPLATE/refactoring-request.md` | `[REFACTOR] 지갑 상태 검증 책임 정리` |
| PR | `.github/pull_request_template.md` | `feat: 회원가입 화면 추가` |

## 작성 요령

- 변경 내용에 해당하는 항목만 작성하고, 해당하지 않는 검증은 이유와 함께 `해당 없음`으로 표시합니다.
- 비밀번호·토큰·세션 값과 실제 비밀 환경 변수 값은 적지 않습니다. 환경 변수는 이름만 적습니다.

## PR

- PR 제목은 [커밋 규칙](commit.md)의 형식(`type: 설명`)으로 작성합니다. Squash merge하면 PR 제목이 최종 커밋 제목이 됩니다.
- 일반 개발 PR은 `dev`, 운영 반영 PR은 `main`을 대상으로 합니다.
- 검증 항목에는 실제 실행한 명령·조건과 결과를 적고, 수행하지 못한 검증과 이유를 구분합니다.
- `Closes #`에는 실제 이슈 번호를 채우고, 이슈가 없으면 해당 줄을 지웁니다. `dev` 대상 PR처럼 기본 브랜치로 머지되지 않으면 `Refs #번호`로 연결합니다. 자동 종료 조건은 [브랜치 규칙](branch.md)에 따릅니다.
