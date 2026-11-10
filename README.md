# TravelPay 프런트엔드

여행자용 지갑 서비스 TravelPay의 웹 화면입니다. 회원가입·로그인, 지갑·원화 충전, 회원 간 송금, 가맹점 결제·환불, 가맹점 정산, 환율 조회·환전을 제공합니다.

Vite + React 19 + TypeScript, 라우팅은 react-router 7입니다. 모든 API는 Gateway(`/api/v1/**`)를 거쳐 호출합니다. 백엔드는 별도 저장소(`travelpay`)입니다.

## 실행

Node 20.19 이상이 필요합니다.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 타입 검사 + 빌드
npm test           # 테스트 타입 검사 + Vitest(jsdom) 컴포넌트·단위 테스트
npm run build      # 타입 검사 + 빌드 (dist/)
npm run typecheck  # 타입 검사만
npm test           # 컴포넌트 테스트 (아래 "테스트" 참고)
```

### 환경 변수

`.env.example`을 `.env.local`로 복사해 고칩니다.

| 이름 | 용도 |
|---|---|
| `API_PROXY_TARGET` | 개발 서버가 `/api`를 넘길 Gateway 주소. 비우면 `http://127.0.0.1:8080`. 브라우저 코드에는 들어가지 않음 |
| `VITE_API_BASE_URL` | 배포처럼 Gateway가 다른 출처일 때 API 기준 주소. 개발 서버에서는 비워 둠 |
| `VITE_SHOW_TEST_ACCOUNTS` | `true`면 배포 빌드에서도 충전 화면에 Mock Bank 테스트 계좌 버튼 표시(개발 서버는 항상 표시) |

### 백엔드와 Gateway

화면을 확인하려면 백엔드가 떠 있어야 합니다. 기능별로 필요한 인프라·서비스는 백엔드 `docs/guide/local-settings.md`를 따릅니다.

| 확인할 기능 | Docker 인프라 | 서비스(Gateway·Eureka 외) |
|---|---|---|
| 회원·로그인 | `postgres` `redis-session` | user |
| 지갑·충전 | + `kafka` | + wallet, ledger, mock-bank |
| 송금·결제·가맹점·정산 | 위와 같음 | + payment |
| 환율·환전 | + `redis-cache` | + exchange |

개발 서버의 프록시는 브라우저의 `Origin: http://localhost:5173`을 그대로 넘깁니다. Gateway는 목록에 없는 출처를 `403 COMMON_FORBIDDEN`으로 거절하므로 Gateway를 띄울 때 아래 환경 변수를 지정합니다.

```text
GATEWAY_CORS_ALLOWED_ORIGINS=http://localhost:5173
```

`gradlew bootRun`을 Gradle 데몬으로 실행하면 터미널 환경 변수가 전달되지 않을 수 있습니다. IntelliJ 실행 구성의 Environment variables에 넣거나 `--no-daemon`으로 실행합니다. 프록시가 Gateway에 연결하지 못하면 화면에는 "서버에 연결하지 못했습니다"가 나오고 개발 서버 터미널에 `ECONNREFUSED`가 찍힙니다.

로컬 Mock Bank 시드 계좌(충전 테스트): `004`/`12340101234567` 예금주 유재석(성공), `020`/`1002123456789` 유재석(5,000원 초과 시 은행 잔액 부족), `088`/`110123456789` 박지현. 회원 실명이 예금주와 같아야 합니다. 개발 서버에서는 충전 화면의 **테스트 계좌** 버튼으로 채울 수 있습니다(목록: `src/features/wallet/testAccounts.ts`).

`503 COMMON_SERVICE_UNAVAILABLE`은 해당 서비스가 Eureka에 없을 때 납니다. 서비스가 꺼져 있거나(예: 환율·환전은 exchange-service), Gateway보다 늦게 떠서 Gateway가 아직 목록을 갱신하지 않은 경우(기동 후 1분 안팎)입니다. 앱을 처음 열 때 콘솔에 찍히는 `GET /api/v1/users/me 401`은 로그인 상태 확인이라 정상입니다.

## 폴더 구조

```text
src/
  main.tsx              진입점 (AuthProvider + RouterProvider)
  router.tsx            경로 정의. 로그인이 필요한 화면은 RequireAuth 아래에 둔다
  index.css             전역 스타일(공통 클래스 + 화면별 구역, 색은 :root 변수)
  api/                  공통 요청 함수, CSRF, 오류 타입·문구
  components/           공통 레이아웃(AppLayout), 상태 배지(StatusBadge)
  features/auth/        로그인 상태, 인증 API, 로그인 필요 경로 보호
  features/wallet/      지갑·잔액·충전 API, 충전 상태·은행 목록, 테스트 계좌
  features/transfer/    송금 API·상태
  features/payment/     결제·환불 신청 API·상태
  features/merchant/    가맹점 잔액·결제·환불 실행·정산 API, 최근 연 가맹점(localStorage)
  features/exchange/    환율·한도·견적·환전 API·상태
  lib/                  금액 변환(money), 멱등성 키(idempotency), 시각 표시(datetime)
  pages/                화면 단위 컴포넌트
  test/                 테스트 도우미(fetch 모의, 메모리 라우터)
docs/
  guide/api-common.md   공통 API 규칙(응답 형식, 오류 코드, 세션·CSRF, 멱등성, CORS)
  convention/           브랜치·커밋·이슈·PR 규칙
```

기능별 API 명세와 오류 코드는 백엔드 `docs/guide/<서비스>.md`를 기준으로 합니다. 환전은 아직 가이드 문서가 없어 exchange-service 코드(`presentation/**`, `*ErrorCode.java`)를 기준으로 구현했습니다.

## 화면

| 경로 | 화면 | 로그인 |
|---|---|---|
| `/` | 홈 | 불필요 |
| `/signup` | 회원가입(약관 조회·동의, 필드별 오류 표시) → 로그인 화면으로 이동 | 불필요 |
| `/login` | 로그인 → `redirect` 경로로 이동 | 불필요 |
| `/exchange-rates` | 환율(기준·살 때·팔 때) | 불필요 |
| `/me` | 내 정보(송금받을 회원 ID 복사) | 필요 |
| `/wallet` | 내 지갑: 지갑 없으면 개설(`PENDING`이면 이어서 개설), 통화별 잔액, 최근 충전 5건 | 필요 |
| `/wallet/charge` | 원화 충전(은행·계좌번호). 계좌 예금주가 회원 실명과 같아야 함 | 필요 |
| `/wallet/charges`, `/wallet/charges/:chargeId` | 충전 내역·상세. 상세는 끝날 때까지 2초마다 최대 2분 다시 조회 | 필요 |
| `/transfers/new` | 송금하기: 수취인 확인 → 금액·통화·메모 → 확인 → 송금 | 필요 |
| `/transfers`, `/transfers/:transferId` | 송금 내역(전체·보낸·받은)·상세. `PROCESSING`이면 다시 조회, `REQUESTED`는 취소 가능 | 필요 |
| `/payments/new` | 결제하기: 가맹점 ID·통화·금액·결제 내용 → 확인 → 결제. `?merchantId=&currency=&amount=&paymentInfo=`로 미리 채움(가맹점 결제 링크) | 필요 |
| `/payments`, `/payments/:paymentId` | 결제 내역·상세. 상세에서 환불 신청(승인 후 3일 안)·신청 취소 | 필요 |
| `/merchant` | 가맹점 관리 입구: 가맹점 ID 입력(내 가맹점 목록 API가 없음), 최근 연 가맹점 | 필요 |
| `/merchant/:merchantId` | 가맹점 잔액, 정산 요약, 결제 링크 복사, 받은 결제(환불 신청 탭) | 필요 |
| `/merchant/:merchantId/payments/:paymentId` | 고객 환불 신청 처리: 환불 실행(부분·전액) 또는 거절 | 필요 |
| `/merchant/:merchantId/settlements` | 정산 미리보기·요청·내역 | 필요 |
| `/merchant/:merchantId/settlements/:settlementId` | 정산 상세(포함된 결제) | 필요 |
| `/exchange` | 환전(원화→외화)·재환전(외화→원화): 금액 → 견적(5분) → 신청 | 필요 |
| `/exchanges`, `/exchanges/:orderId` | 환전 내역(전체·환전·재환전)·상세 | 필요 |
| 그 밖의 경로 | 404 안내 | 불필요 |

처리 중인 송금·결제·환불·정산·환전 상세는 3초마다 최대 2분 다시 조회합니다.

### 미구현·제약

- 관리자(`MASTER`) 화면이 없습니다. 가맹점 생성, `MANUAL_REVIEW` 결제·환불·정산·환전 처리는 백엔드 API를 직접 호출합니다.
- 결제자가 가맹점을 검색·확인하는 API가 없어, 가맹점 이름과 받는 통화는 결제를 시도해야 알 수 있습니다(통화가 다르면 `PAYMENT_CURRENCY_MISMATCH`).
- 내 가맹점 목록 API가 없어 가맹점 주인은 가맹점 ID로 들어갑니다. 최근 연 ID는 이 브라우저의 localStorage에만 남습니다.
- 정산 대상은 결제 승인 후 환불 기간 3일 + 여유 1시간이 지난 결제라, 로컬에서 바로 확인하면 `PAYMENT_NO_SETTLEMENT_TARGET`이 나옵니다.

## 개발 규칙 요약

자세한 내용은 [공통 API 규칙](docs/guide/api-common.md)을 봅니다.

- API는 `src/api`의 `apiRequest`/`apiRequestWithStatus`로만 호출합니다. 실패는 `ApiError(status, code, message, details)`로 던지고, 분기는 `error.code`로 합니다. 화면 문구는 `toUserMessage(error)`와 기능별 `to…Message`를 씁니다.
- 세션 쿠키(`credentials: 'include'`)와 CSRF 토큰은 공통 요청 함수가 처리합니다. 로그인·로그아웃·비밀번호 변경 뒤에는 토큰을 버리고 다시 받습니다(`AuthContext`).
- 401을 받으면 로그인 상태를 지우고 보호된 화면은 `/login?redirect=원래경로`로 보냅니다. `redirect`는 앱 내부 경로만 허용합니다.
- 금액은 통화별 최소 단위 정수로 다룹니다(`lib/money.ts`). 환전 API만 주 단위 소수 문자열을 주고받으므로 `majorToMinor`·`formatMajorAmount`로 문자열 변환만 하고 소수 연산을 하지 않습니다.

### 금전 요청 멱등성

금전 POST에는 `Idempotency-Key`를 붙입니다. 연결 실패·5xx처럼 결과를 모르면 키를 유지해 "다시 시도"가 같은 키로 나가고, 서버가 판단을 끝낸 응답(2xx·4xx)을 받으면 다음 요청은 새 키를 씁니다. 같은 키를 다시 쓰는 기준은 서버가 같은 요청인지 비교하는 값과 맞춥니다.

| 요청 | 같은 키를 쓰는 조건 |
|---|---|
| 충전·송금 | 본문 전체가 같을 때 |
| 결제 | `merchantId`·`currency`·`amount`가 같을 때(결제 내용만 바뀌어도 같은 키) |
| 환불 실행 | `paymentId`·`amount`가 같을 때(사유만 바뀌어도 같은 키) |
| 정산 요청 | 본문 없음. 결과를 모를 때만 같은 키 |
| 환전 | 같은 견적(`quoteId`)일 때. 결과를 모르는 동안은 새 견적을 받지 못하게 함 |

## 테스트

Vitest + Testing Library 컴포넌트 테스트가 `src/**/*.test.ts(x)`에 있습니다. API는 `src/test/fetchMock.ts`로 가짜 응답을 주고, 화면이 보내는 본문·헤더(CSRF, `Idempotency-Key`)를 확인합니다.

테스트 의존성(Vitest·jsdom·Testing Library)은 `devDependencies`에 있어 `npm install`로 함께 설치됩니다.

```bash
npm test   # tsc -p tsconfig.test.json && vitest run
```

테스트 파일은 `tsconfig.app.json`에서 제외해 앱 빌드에 들어가지 않고, `tsconfig.test.json`으로 따로 타입 검사합니다.

## Gateway 경유 E2E 검증 (2026-11-10)

로컬 전체 서비스를 띄우고, 개발 서버 프록시(`localhost:5173` → Gateway `8080`)를 거쳐 프런트 `features/*/api.ts`와 같은 요청 본문·헤더(`Csrf-Token`, `Idempotency-Key`, `Origin: http://localhost:5173`)로 주요 흐름을 한 번에 이어서 실행했습니다.

- 환경: Eureka·Gateway·User·Wallet·Payment·Exchange·Ledger·Mock Bank, Docker 인프라(postgres·redis-session·redis-cache·kafka). Exchange는 `EXCHANGE_RATE_MODE=mock`
- 계정: 검증용으로 새로 가입한 구매자(실명 유재석)·가맹점 주인(박지현)·관리자 3개. 관리자는 최초 MASTER를 만드는 API가 없어 로컬 DB에서 역할을 `MASTER`로 바꿨습니다.
- 요청 70건: 200 51 · 201 12 · 202 1 · 204 1, 의도한 오류 응답 5건(아래 표). 예상하지 못한 4xx·5xx 0건, 서비스 로그 ERROR 0건

| 단계 | 요청 | 결과 |
|---|---|---|
| 회원가입·로그인 | 약관 조회 → `POST /users` 201 → 로그인 200 → CSRF 재발급 → `GET /users/me` 200 | 관리자 계정 `role`이 `MASTER`로 조회됨 |
| 지갑 | `POST /wallets` 201 → `GET /wallets/me`·`/balances` | `ACTIVE`, KRW·JPY·CNY 잔액 0 |
| 충전 | `POST /charges` 50,000원(004 계좌) 202 → 상태 조회 | `COMPLETED`, KRW 0 → 50,000 |
| 환전 | 한도 조회 → 견적 KRW 10,000 → JPY 1,177(수수료 100원) 201 → `POST /exchanges` 200, 같은 키 재요청은 같은 주문 | `COMPLETED`, KRW 50,000 → 39,900, JPY 0 → 1,177 |
| 재환전 | 견적 JPY 500 → KRW 4,246(수수료 5엔) 201 → 신청 200 | `RE_EXCHANGE` `COMPLETED`, KRW 44,146, JPY 672 |
| 가맹점 생성 | 관리자 `POST /payments/merchants`(KRW, 주인 = 박지현) 201 | `ACTIVE`, 주인 잔액 조회 200(0원) |
| 결제 | 3,000원·2,000원 각 201 `APPROVED`, 같은 키 재요청은 같은 결제 | 구매자 KRW 44,146 → 39,146, 가맹점 0 → 5,000 |
| 환불 실행 | 결제1 환불 신청 200(`REFUND_REQUESTED`) → 주인 환불 실행 200 | `REFUNDED`, 환불 `COMPLETED` 3,000 |
| 환불 거절 | 결제2 신청 → 취소(`CANCELLED`) → 재신청 → 주인 거절 200 | `APPROVED` 유지, 신청 결과 `REJECTED` |
| 환불 후 잔액 | | 구매자 KRW 42,146(+3,000), 가맹점 2,000 |
| 정산 미리보기 | 주인 `GET .../settlements/preview` 200 | 대기 1건 2,000원, `nextAvailableAt` = 결제 승인 + 3일 1시간 |
| 로그아웃 | `POST /auth/logout` 204 → `GET /users/me` | 401 |

의도한 오류 응답(화면 문구는 `features/*/status.ts`에 있음):

| 확인한 것 | 응답 |
|---|---|
| 사용한 견적으로 새 키 환전 신청 | 409 `EXCHANGE_QUOTE_ALREADY_USED` |
| 주인이 아닌 회원의 가맹점 잔액 조회 | 404 `PAYMENT_MERCHANT_NOT_FOUND`(존재를 숨김) |
| 지갑이 없는 주인의 정산 요청 | 422 `PAYMENT_SETTLEMENT_WALLET_NOT_AVAILABLE` |
| 주인 지갑 개설 후 정산 요청 | 422 `PAYMENT_NO_SETTLEMENT_TARGET`(승인 후 3일 1시간 전이라 대상 없음) |
| 로그아웃 후 내 정보 | 401 `COMMON_UNAUTHORIZED` |

### 발견한 문제와 원인

| 문제 | 원인 | 조치 |
|---|---|---|
| 환율·환전 경로 503 `COMMON_SERVICE_UNAVAILABLE` | exchange-service 미실행 | 서비스 실행. 프런트 수정 없음 |
| Gateway 기동 직후 약 40초 동안 503 | Gateway가 User보다 먼저 떠서 Eureka 목록이 갱신되기 전 | Eureka → User → 업무 서비스 → Gateway 순서로 기동하거나 1분 기다림 |
| exchange mock 모드 기동 실패(`defaultMidRates` 바인딩 오류) | 백엔드 `.env`의 `SPRING_CONFIG_NAME=application-prod`가 켜져 있어 운영 설정을 읽음 | 로컬은 `--spring.config.name=application --spring.profiles.active=default`로 실행 |
| 수출입은행 환율이 7일 지나면 견적 거절 | `koreaexim`은 평일 11~13시에만 수집 | 로컬 검증은 `EXCHANGE_RATE_MODE=mock` |
| 정산 요청이 대상 없음이 아니라 지갑 오류로 응답 | 서버가 주인 지갑을 대상 결제보다 먼저 확인(명세대로) | 가맹점 주인도 지갑을 개설해야 정산 가능. 프런트 안내 문구 있음 |

프런트 코드에서 고친 곳은 없습니다.

### 확인하지 못한 것

- 정산 실행(`PAID`): 결제 승인 후 3일 1시간이 지나야 대상이 생깁니다. 로컬에서는 대상 없음 응답까지만 확인했습니다.
- `MANUAL_REVIEW` 처리, 원장·은행 장애 상황: 관리자 화면이 없고 장애 주입이 필요해 제외했습니다.
- 송금: 이번 범위가 아닙니다.
- 화면 대조: 위 요청은 스크립트로 보냈습니다. 같은 계정으로 화면을 열어 잔액·내역·상태 표시를 맞춰 보는 확인은 따로 해야 합니다(브라우저에서는 로그인·환전 견적까지 확인).

## 협업 규칙

- [브랜치](docs/convention/branch.md): 작업 브랜치는 `dev`에서 만들고 PR도 `dev`로 보냅니다.
- [커밋](docs/convention/commit.md): `type: 설명` 형식, 스코프 없음
- [이슈·PR](docs/convention/issue-pr.md): `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`
