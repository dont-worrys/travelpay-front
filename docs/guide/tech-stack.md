# 프런트엔드 기술 스택

| 기술 | 버전 | 용도 |
|---|---|---|
| React | 19.1 | UI 라이브러리 |
| TypeScript | 5.8 | 정적 타입 |
| React Router | 7.6 | 클라이언트 라우팅 |
| Vite | 7.0 | 개발 서버·번들러 |
| Vitest | 5.1 | 테스트 실행기 |
| Testing Library | React 16.3 / user-event 14.6 / jest-dom 7.0 | 컴포넌트 테스트 |
| Vercel | — | 정적 배포·호스팅 |

---

## React 19

- **링크**: https://react.dev · https://github.com/facebook/react
- **선택 배경**: TravelPay는 지갑·충전·송금·결제·환전·정산·관리자 화면이 많고, 화면마다 목록 → 상세 → 처리 흐름이 비슷하게 반복된다. 그래서 화면 조각을 컴포넌트로 나눠 다시 쓸 수 있어야 했다.
- **선택 근거**
  - 컴포넌트 단위로 다시 쓸 수 있다. 예를 들어 환불 실행·거절 UI(`RefundActions`)는 가맹점 화면과 관리자 화면이 같이 쓴다.
  - 생태계와 자료가 가장 많아 팀원이 이어받기 쉽다.
  - 상태 관리는 Redux 같은 별도 라이브러리 없이 React 내장 Hook으로 충분했다. 서버 상태는 화면마다 다시 조회하고, 환율 5초 갱신은 직접 만든 `useAutoRefresh`로 처리한다. 그래서 의존성이 `react`·`react-dom`·`react-router` 3개뿐이다.
  - 새로 시작하는 프로젝트라 최신 안정 버전인 19를 골랐다.

## TypeScript 5.8

- **링크**: https://www.typescriptlang.org · https://www.typescriptlang.org/docs/
- **선택 배경**: 백엔드가 서비스 6개(gateway, user, wallet, payment, exchange, ledger)로 나뉜 MSA라 API 응답 형태가 서비스마다 다르다. 금액 표현도 다르다. 대부분은 최소 단위 정수이고 환전 API만 소수 문자열이다.
- **선택 근거**
  - 응답·오류 형식(`error.code`, `details`)을 타입으로 정해 두면 서비스별 차이를 컴파일 단계에서 잡을 수 있다.
  - 금액·상태 값(`MANUAL_REVIEW`, `CREDIT_PROCESSING` 등)을 다루다 실수하면 돈 문제가 되므로 정적 검사가 필요했다.
  - `npm run build`가 `tsc -b`를 먼저 돌리기 때문에 타입 오류가 있으면 배포 빌드가 실패한다.

## React Router 7

- **링크**: https://reactrouter.com · https://github.com/remix-run/react-router
- **선택 배경**: 일반회원 화면과 관리자 화면(`/admin/**`)을 역할에 따라 나누고, 화면이 많아 처음 로딩 크기를 줄일 필요가 있었다.
- **선택 근거**
  - 중첩 라우트와 경로 가드(`RequireRole`)로 MASTER는 관리자 화면만 보게 하는 정책을 구현했다.
  - 라우트 단위 지연 로딩으로 코드 스플리팅을 적용했다(#55).
  - 7 버전부터 패키지가 `react-router` 하나로 합쳐져 의존성이 단순하다.
  - React 라우팅에서 사실상 표준이라 자료가 많다.

## Vite 7

- **링크**: https://vite.dev · https://github.com/vitejs/vite
- **선택 배경**: 개발 중에 화면을 고치고 결과를 바로 확인하는 일이 잦았고, 빌드 설정에 시간을 쓰고 싶지 않았다.
- **선택 근거**
  - 개발 서버가 빨리 뜨고 변경이 즉시 반영된다(HMR).
  - React·TypeScript 템플릿이 기본으로 있어 별도 설정이 거의 필요 없다.
  - 환경 변수 주입을 `vite.config.ts`에서 제어할 수 있다. 이 기능으로 Vercel Preview 환경에서는 API 호출을 막았다(`VITE_API_DISABLED`).
  - Vitest와 설정을 공유할 수 있다.
  - CRA(Create React App)는 지원이 끝나 대안으로 Vite를 택했다.

## Vitest

- **링크**: https://vitest.dev · https://github.com/vitest-dev/vitest
- **선택 배경**: 송금·결제·환전 같은 금전 흐름은 브라우저에서 직접 재현하기 어려운 경우가 많다. 결과를 모르는 5xx 응답, 멱등성 키 재사용, 409 분기 등이 그렇다. 그래서 자동 테스트로 확인할 수단이 필요했다.
- **선택 근거**
  - Vite 설정과 변환 과정을 그대로 써서 Jest처럼 Babel·ts-jest를 따로 설정하지 않아도 된다.
  - Jest와 API가 거의 같아 익히기 쉽다.
  - 실행이 빠르고, 테스트용 타입 검사(`tsc -p tsconfig.test.json`)와 묶어 `npm test` 하나로 돌린다.

## Testing Library

- **링크**: https://testing-library.com · https://testing-library.com/docs/react-testing-library/intro · https://testing-library.com/docs/user-event/intro
- **선택 배경**: 내부 구현 대신 사용자가 보는 결과를 검증하고 싶었다. 예: "버튼을 누르면 결과 모름 안내가 보이는가".
- **선택 근거**
  - 역할·라벨·텍스트로 요소를 찾기 때문에 리팩터링해도 테스트가 덜 깨지고, 접근성도 함께 점검된다.
  - `user-event`로 실제 입력·클릭 순서를 재현한다.
  - jsdom 환경에서 fetch를 모의하는 헬퍼(`mockFetch`·`ok`·`fail`·`networkError`)와 라우트 렌더 헬퍼(`renderRoute`)를 붙여 API 응답별 화면 분기를 확인한다.
  - 브라우저나 Gateway로 확인하기 어려운 화면(#42·#43·#44·#49)은 컴포넌트 테스트로 검증했다.

## Vercel

- **링크**: https://vercel.com · https://vercel.com/docs · https://vercel.com/docs/frameworks/vite
- **선택 배경**: 프런트는 정적 SPA라 별도 서버를 운영할 필요가 없고, 팀원이 PR마다 화면을 확인할 수 있으면 좋겠다고 판단했다.
- **선택 근거**
  - Vite 프로젝트를 자동으로 인식해 빌드·배포 설정이 거의 필요 없다.
  - Git 브랜치·PR마다 Preview 배포가 생겨 리뷰할 때 화면을 바로 볼 수 있다. Preview에서는 실제 API를 막아 운영 데이터를 보호한다.
  - `vercel.json` 하나로 SPA 라우팅 rewrite와 보안 헤더를 관리한다.
  - CDN과 HTTPS가 기본으로 제공된다.
