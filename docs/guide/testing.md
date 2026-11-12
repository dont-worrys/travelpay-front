# 테스트·검증 가이드

## 테스트

Vitest + Testing Library 컴포넌트·단위 테스트가 `src/**/*.test.ts(x)`에 있습니다(28파일 145건, 2026-11-12). 백엔드 없이 돌아갑니다. API는 `src/test/fetchMock.ts`로 가짜 응답을 주고, 화면이 보내는 본문·헤더(CSRF, `Idempotency-Key`)를 확인합니다.

테스트 의존성(Vitest·jsdom·Testing Library)은 `devDependencies`에 있어 `npm install`로 함께 설치됩니다. 테스트 파일은 `tsconfig.app.json`에서 제외해 앱 빌드에 들어가지 않고, `tsconfig.test.json`으로 따로 타입 검사합니다.

```bash
npm test                                   # 테스트 타입 검사 + 전체 실행 (tsc -p tsconfig.test.json && vitest run)
npx vitest run src/pages/ChargeNewPage     # 파일 하나만 (경로 일부로 거름)
npx vitest run -t "같은 키"                 # 테스트 이름으로 거름
npx vitest                                 # 감시 모드(파일 저장 시 다시 실행)
```

`npx vitest`로 바로 돌리면 테스트 타입 검사(`tsc`)는 건너뜁니다. PR 전에는 `npm test`로 확인합니다.

### 확인하는 범위

| 구분 | 파일 | 확인하는 것 |
|---|---|---|
| 공통 요청 | `api/client.test.ts` | GET에는 CSRF를 받지 않음, 변경 요청에 토큰 1회 발급·첨부, 허용 헤더(`Accept`·`Content-Type`·`Csrf-Token`·`Idempotency-Key`)만 사용, `COMMON_CSRF_INVALID` 403이면 새 토큰·같은 키로 1회 재전송, 그 밖 403은 재전송 없음, `details` 필드별 메시지, 연결 실패·5xx는 결과 모름, 공통 형식 아닌 응답, 204, 401 리스너, 요청 취소 |
| 멱등성 키 | `lib/idempotency.test.ts` | UUID v4 형식, `randomUUID`가 없는 환경의 대체 생성 |
| 금액 | `lib/money.test.ts` | 입력 → 최소 단위 정수, 환전 주 단위 문자열 변환 |
| 주기 조회 | `lib/useAutoRefresh.test.ts` | 5초 주기, 앞 조회 중 새 조회 안 함, 실패 시 마지막 값 유지, 탭 숨김 중단·재개, `enabled` 전환, 화면을 떠나면 요청 취소 |
| 로그인·역할 | `features/auth/RequireRole.test.tsx` | 비로그인 → `/login?redirect=`, 일반회원 ↔ 관리자 경로 분리, 열린 리다이렉트 차단 |
| 테스트 계좌 | `features/wallet/testAccounts.test.ts` | `VITE_LOCAL_TEST_ACCOUNT` 형식 해석 |
| 금전 요청 화면 | `ChargeNewPage`·`TransferNewPage`·`PaymentNewPage`·`ExchangeNewPage`·`ExchangeReservationNewPage` | 보내는 본문(최소 단위, 사용자 ID 없음), 결과 모름이면 같은 키 재전송, 서버가 비교하는 내용을 바꾸거나 4xx 뒤에는 새 키 |
| 일반회원 화면 | `PasswordChangePage`·`TransferListPage`·`ExchangeListPage`·`ExchangeRatePage`·`ExchangeReservationDetailPage`·`MerchantPaymentDetailPage` | 비밀번호 변경 뒤 CSRF 재발급·오류 표시, 받은 실패 송금 표시, 예약 체결 주문 표시, 전일 대비 4가지 표시·수수료율 변환, 예약 취소, 환불 가능 금액 계산·환불 실행 키·거절 |
| 관리자 화면 | `pages/admin/*.test.tsx` 10개 | MANUAL_REVIEW 처리, 송금 미리보기 → 확정, 충전 보정 키 규칙·재개 안내, 충전 목록 회원 복사·필터·잘못된 userId, 대사 합계 안내, 처리 기록, 회원 정지·세션 종료, 약관 등록, 가맹점 생성 안내, 지연 환불 대리 실행·거절·직접 환불(키·오류 코드), 가맹점 결제 조회 |

테스트가 없는 화면(목록·상세 조회 위주, 가입·로그인 등)은 [Gateway 경유 E2E](../verification/gateway-e2e.md)와 [브라우저 화면 확인](../verification/browser-check.md)으로 봤습니다.

### 테스트 작성 방법

- 요청 가로채기: `mockFetch({ 'METHOD /path': handler })`. 경로표에 없는 요청은 실패하므로 화면이 부르는 API를 모두 적습니다. CSRF 발급(`GET /api/v1/auth/csrf`)은 기본으로 `Csrf-Token: test-csrf`를 줍니다.
- 응답: `ok(data, status)`, `fail(status, code, message, details)`, 연결 실패는 `networkError()`. 핸들러 두 번째 인자(호출 순번)로 "첫 요청은 실패, 다음은 성공"을 만듭니다.
- 확인: `api.calls('POST', path)`로 보낸 본문·헤더를 봅니다. 재시도는 `Idempotency-Key`가 같은지·다른지를 함께 확인합니다.
- 화면 그리기: `renderRoute(path, element, initialEntry)`. 다른 경로로 이동하면 `data-testid="navigated"`가 보입니다. `useAuth`를 쓰는 화면은 `AuthProvider`로 감싸고 `GET /api/v1/users/me`를 경로표에 넣습니다.
- 테스트 사이 정리(`fetch` 원복, DOM 정리)는 `src/test/setup.ts`가 합니다. CSRF 토큰은 모듈 상태라 공통 요청 함수를 직접 시험할 때는 `beforeEach`에서 `clearCsrfToken()`을 부릅니다.

## 실행·검증 순서

PR 전에 아래 순서로 확인하고, PR 본문 "검증"에는 실제로 한 것과 못 한 것을 나눠 적습니다.

1. **정적 확인** — `npm run typecheck` → `npm test` → `npm run build`. 빌드의 500kB 청크 경고는 현재 알려진 경고로 동작에 영향이 없습니다.
2. **백엔드 연결** — [처음 실행하기](../getting-started.md#3-백엔드-실행) 표대로 필요한 서비스만 띄우고 `npm run dev`. Gateway에 `GATEWAY_CORS_ALLOWED_ORIGINS=http://localhost:5173`이 있어야 합니다. 로그인 화면에서 가입·로그인이 되면 연결은 정상입니다.
3. **화면 확인** — 바꾼 기능의 화면을 브라우저로 직접 조작합니다. 금전 요청은 성공 뒤 잔액·내역이 맞는지, 오류 응답이면 문구가 맞는지 봅니다. 충전은 회원 실명과 같은 예금주의 Mock Bank 시드 계좌([목록](../getting-started.md#충전-테스트-계좌))를 씁니다.
4. **관리자 화면** — 로컬 DB에서 역할을 `MASTER`로 바꾼 계정으로 로그인합니다(관리자 가입 화면은 없음). `MANUAL_REVIEW`·대사 불일치 데이터를 만드는 방법은 [충전 보정 테스트 데이터](../verification/test-data.md#충전-보정-테스트-데이터-2026-11-11)·[관리자 브라우저 검증 데이터](../verification/test-data.md#관리자-브라우저-검증-데이터-2026-11-11) 절을 봅니다.
5. **문제가 생기면** — 화면에 "서버에 연결하지 못했습니다"면 개발 서버 터미널의 `ECONNREFUSED`(Gateway 꺼짐)를, `503 COMMON_SERVICE_UNAVAILABLE`이면 해당 서비스 실행 여부와 Eureka 등록(기동 뒤 1분 안팎)을, `403 COMMON_FORBIDDEN`이면 CORS 허용 출처를 확인합니다. 백엔드 로그는 `infra/monitoring/.local-logs/<서비스>.log`에 있습니다.

로컬에서 만들 수 없는 상태(정산 `PAID` 등)는 [확인하지 못한 것](../verification/gateway-e2e.md#확인하지-못한-것)에 적어 둡니다.
