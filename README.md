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
  features/exchange/    환율·한도·견적·환전·예약 환전 API·상태
  features/admin/       관리자 API(가맹점·MANUAL_REVIEW·송금·충전·대사·처리 기록·회원·약관), 처리 대기·처리 기록 화면용 변환
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
| `/account/password` | 비밀번호 변경(일반회원·관리자 공통). 성공하면 CSRF 토큰 재발급 | 필요 |
| `/wallet` | 내 지갑: 지갑 없으면 개설(`PENDING`이면 이어서 개설), 통화별 잔액, 최근 충전 5건 | 필요 |
| `/wallet/charge` | 원화 충전(은행·계좌번호). 계좌 예금주가 회원 실명과 같아야 함 | 필요 |
| `/wallet/charges`, `/wallet/charges/:chargeId` | 충전 내역·상세. 상세는 끝날 때까지 2초마다 최대 2분 다시 조회 | 필요 |
| `/transfers/new` | 송금하기: 수취인 확인 → 금액·통화·메모 → 확인 → 송금 | 필요 |
| `/transfers`, `/transfers/:transferId` | 송금 내역(전체·보낸·받은)·상세. `PROCESSING`이면 다시 조회, `REQUESTED`는 취소 가능. 받은 송금은 완료된 것만 `+`로 표시 | 필요 |
| `/payments/new` | 결제하기: 가맹점 ID·통화·금액·결제 내용 → 확인 → 결제. `?merchantId=&currency=&amount=&paymentInfo=`로 미리 채움(가맹점 결제 링크) | 필요 |
| `/payments`, `/payments/:paymentId` | 결제 내역·상세. 상세에서 환불 신청(승인 후 3일 안)·신청 취소 | 필요 |
| `/merchant` | 가맹점 관리 입구: 가맹점 ID 입력(내 가맹점 목록 API가 없음), 최근 연 가맹점 | 필요 |
| `/merchant/:merchantId` | 가맹점 잔액, 정산 요약, 결제 링크 복사, 받은 결제(환불 신청 탭) | 필요 |
| `/merchant/:merchantId/payments/:paymentId` | 고객 환불 신청 처리: 환불 실행(부분·전액) 또는 거절 | 필요 |
| `/merchant/:merchantId/settlements` | 정산 미리보기·요청·내역 | 필요 |
| `/merchant/:merchantId/settlements/:settlementId` | 정산 상세(포함된 결제) | 필요 |
| `/exchange` | 환전(원화→외화)·재환전(외화→원화): 금액 → 견적(5분) → 신청 | 필요 |
| `/exchanges`, `/exchanges/:orderId` | 환전 내역(전체·환전·재환전)·상세 | 필요 |
| `/exchange-reservations/new` | 예약 환전: 목표 매매기준율·만료 기간(1·3·7·30일)을 걸면 조건에 닿을 때 서버가 환전 | 필요 |
| `/exchange-reservations`, `/exchange-reservations/:reservationId` | 예약 내역(대기·체결·취소·만료)·상세, 대기 예약 취소, 체결 주문으로 이동 | 필요 |
| 그 밖의 경로 | 404 안내 | 불필요 |

관리자(`MASTER`)로 로그인하면 헤더에 관리자 메뉴만 보이고, 위 표에서 로그인이 필요한 일반회원 화면(`/account/password` 제외)에 들어오면 관리자 첫 화면(`/admin`)으로 보냅니다. 반대로 일반회원이 `/admin/**`에 들어오면 `/`로 보냅니다.

| 경로 | 관리자 화면 |
|---|---|
| `/admin` | 처리 대기 건수(결제·환불·정산·환전·송금·충전), 지연 환불 신청 건수, 관리 기능 입구 |
| `/admin/reviews`, `/admin/reviews/:kind/:id` | 결제·환불·정산·환전 `MANUAL_REVIEW` 목록(사유 필터)·상세. 서버가 원장을 조회해 정한 결과로 처리하고, 처리 뒤 처리 기록으로 이동 |
| `/admin/merchants/new` | 가맹점 생성. 원장 계정을 못 만들면(202 `PENDING`) 원장 계정 재시도 |
| `/admin/transfers`, `/admin/transfers/:transferId` | 전체 송금 목록(상태·회원·정렬)·상세(`reviewReason`·`failureReason`·`attemptCount`, 지갑 ID)·상태 변경 이력. `MANUAL_REVIEW`는 미리보기 → 확정 |
| `/admin/charges` | 전체 충전 목록(상태·회원). 관리자 단건 조회 API가 없어 항목을 목록에 모두 표시하고, `MANUAL_REVIEW`만 보정 화면으로 이동 |
| `/admin/charges/:chargeId/review` | 충전 보정: 지금 은행 출금·환불·원장 사실, 가능한 조치와 불가 이유 → 조치·사유(·대사 결과 ID)로 보정 |
| `/admin/charges/reconciliations`, `/admin/charges/reconciliations/:runId` | 충전 대사 수동 실행(기간 생략 또는 지정)·실행 기록·어긋남 결과(종류 필터). 확인 중 충전의 결과에서 보정 화면으로 이동 |
| `/admin/resolutions`, `/admin/resolutions/:domain/:targetId` | 처리 기록(결제·환불, 정산, 환전 탭, 종류·처리 담당자·대상 ID 필터)·대상별 처리 기록 상세 |
| `/admin/refund-requests/overdue` | 신청 후 3일 넘게 처리되지 않은 환불 신청(오래된 순, 경과 시간) |
| `/admin/users` | 회원 검색(회원 ID·이메일·휴대폰 번호·상태, 정확히 일치, 개인정보는 서버가 가림)·정지/해제·기존 세션 종료. 단건 조회 API가 없어 검색 결과 줄에서 처리하고, 본인 계정은 정지 버튼을 숨김. 검색 조건은 개인정보라 화면 주소에 남기지 않음 |
| `/admin/terms`, `/admin/terms/new` | 약관 버전 목록(코드 필터, 시행 중·시행 예정·지난 버전 구분)·새 버전 등록(시행 시각은 1분 이상 뒤, 브라우저 시간대 입력 → UTC 전송). 등록한 버전은 고칠 수 없음 |

처리 중인 송금·결제·환불·정산·환전 상세는 3초마다 최대 2분 다시 조회합니다. 예약 상세는 대기가 며칠씩 이어질 수 있어 자동으로 다시 조회하지 않고 새로고침 버튼을 둡니다.

### 미구현·제약

- 회원 정지·해제와 세션 종료는 결과를 모를 때 다시 보내도 같은 결과입니다(같은 상태면 그대로, 세션 종료는 기존 세션만 끝냄). 약관 등록은 멱등성 키가 없지만 같은 코드·버전을 다시 보내면 409라 두 번 생기지 않습니다.
- 약관 목록의 "시행 중"은 공개 약관 조회(`GET /api/v1/terms`)와 맞춰 표시합니다. 그 조회가 실패하면 시행 예정만 구분합니다.
- 송금 확정과 충전 보정은 서버가 실행 순간 원장(충전은 은행·원장)을 다시 조회해 판단합니다. 화면의 미리보기·확인 결과는 실행 허가가 아니라서, 그 사이 상태가 바뀌면 거절됩니다(송금 409 `TRANSFER_RESOLUTION_MISMATCH` → 다시 미리보기, 충전 409 `CHARGE_RESOLUTION_REJECTED` → 다시 확인).
- 송금 확정에서 502·503·504는 서버가 원장 조회 실패로 반영하지 않은 경우와 Gateway 문제를 구분할 수 없어 결과 모름으로 다룹니다. 확정 본문을 잠그고 같은 내용으로만 다시 보냅니다(같은 운영자·같은 본문이면 서버가 현재 상태를 돌려줌).
- 처리 기록 API에 단건 조회가 없어, 처리 기록 상세는 대상 ID로 거른 기록(최대 100건)을 모두 보여 줍니다. 송금 확정 이력은 송금 상세, 충전 보정 결과는 보정 화면에서만 봅니다.
- 충전 대사 기간은 서버 기본 설정상 1일 이하, 끝은 지금보다 5분 이전이어야 합니다(어기면 400). 수동 실행은 끝까지 대사한 뒤 응답합니다.
- 송금 목록의 기간·통화 필터, 환전 처리 기록의 기간 필터는 서버가 지원하지만 화면에는 없습니다.
- 예약 환전은 예약할 때 잔액을 묶지 않습니다. 체결 때 잔액이 부족하면 예약은 `EXECUTED`, 만들어진 주문은 `FAILED`입니다. 환전 내역 응답에 예약 체결 주문인지 알려 주는 값이 없어 내역에서는 보통 환전과 구분하지 않습니다.
- 예약 만료 30일은 서버 시각 기준 상한이라, 기기 시계 차이로 거절되지 않게 1시간 일찍 만료합니다(화면에 실제 만료 시각 표시).
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
| 예약 환전 | 결과를 모를 때만 같은 키. 서버가 본문 전체(만료 시각 포함)를 비교하므로 제출 순간의 본문을 그대로 다시 보내고, 그동안 입력을 잠금 |
| 관리자 충전 보정 | 결과를 모를 때만 같은 키·같은 본문, 그동안 입력을 잠금. 판정 불가 409·조회 불가 503(`CHARGE_RESOLUTION_SOURCE_UNAVAILABLE`)은 키를 쓰지 않은 거절이라 다음은 새 키 |

관리자 `MANUAL_REVIEW` 처리(결제·환불·정산·환전)와 송금 확정은 `Idempotency-Key`를 받지 않습니다. 이미 처리된 건은 409라 두 번 반영되지 않고, 송금 확정은 같은 운영자·같은 본문 재요청에 현재 상태를 돌려줍니다.

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
- 송금: 아래 [송금](#송금) 절에서 따로 확인했습니다.
- 화면 대조: 위 요청은 스크립트로 보냈습니다. 같은 계정으로 화면을 열어 잔액·내역·상태 표시를 맞춰 보는 확인은 따로 해야 합니다(브라우저에서는 로그인·환전 견적까지 확인).

### 예약 환전

백엔드 예약 환전(#240) 반영 뒤 같은 방식(개발 서버 프록시 → Gateway)으로 확인했습니다. 체결은 새 환율이 수집될 때 판단하므로 exchange-service를 `EXCHANGE_RATE_MODE=mock`(5초마다 수집)으로 띄웠고, 위의 구매자 계정을 썼습니다. 요청 86건(200 58 · 201 16, 의도한 오류 응답 12건)이 모두 예상대로 응답했고 서비스 로그 WARN·ERROR는 0건입니다.

| 확인한 것 | 결과 |
|---|---|
| 체결 | KRW 5,000을 목표 867.21(당시 매매기준율 847.21)로 등록 → 다음 수집에 `EXECUTED`, 주문 `PROCESSING` → `COMPLETED`. 적용 환율 847.06, 590엔, 수수료 50원. 잔액 KRW 42,146 → 37,096, JPY 672 → 1,262 |
| 멱등성 | 같은 키·같은 본문 재요청은 같은 예약 201, 같은 키·다른 본문은 409 `EXCHANGE_RESERVATION_IDEMPOTENCY_KEY_REUSED` |
| 대기·취소 | JPY → KRW 예약은 조건 `AT_OR_ABOVE`, 환율 2회 수집 뒤에도 `WAITING`. 취소 → `CANCELED`(`USER_REQUESTED`). 다시 취소·체결된 예약 취소는 409 `EXCHANGE_RESERVATION_NOT_WAITING` |
| 권한 | 다른 회원의 예약 조회·취소는 404 `EXCHANGE_RESERVATION_NOT_FOUND` |
| 입력 검증 | 목표 환율 소수 셋째 자리·0은 400 `EXCHANGE_RESERVATION_INVALID_TARGET_RATE`, 과거·31일 뒤 만료는 400 `EXCHANGE_RESERVATION_INVALID_EXPIRY`, 최소 금액 미만 400 `EXCHANGE_INVALID_AMOUNT`, 원화 → 원화 400 `EXCHANGE_UNSUPPORTED_PAIR`. 화면 최대값(30일 − 1시간)은 201 |
| 잔액보다 큰 예약 체결 | 100만 원 예약 → 예약 `EXECUTED`, 주문 `FAILED`(`INSUFFICIENT_BALANCE`), 잔액 변화 없음 |
| 대기 예약 한도 | 10건까지 201, 11번째 409 `EXCHANGE_RESERVATION_TOO_MANY_WAITING` |
| 목록 필터 | `status=WAITING·EXECUTED·CANCELED`마다 해당 상태만 응답 |
| 만료 | 75초 뒤 만료로 등록 → 만료 스케줄러(1분 주기)가 `EXPIRED`로 변경 |

발견한 문제와 원인:

| 문제 | 원인 | 조치 |
|---|---|---|
| 예약 경로 404 | 실행 중인 Gateway가 예약 라우트(`/api/v1/exchange-reservations/**`) 추가 전 빌드 | 백엔드 dev로 gateway·exchange-service 재빌드 |
| 재빌드 뒤에도 체결되지 않을 환경 | exchange-service가 `koreaexim` 모드로 떠 있어 환율이 평일 11~13시에만 수집됨 | `EXCHANGE_RATE_MODE=mock`, `--spring.config.name=application --spring.profiles.active=default`로 재기동 |
| 백엔드 `.env`를 `source`할 때 `MOCK_BANK_URL: command not found` | `MOCK_BANK_URL = "..."`처럼 `=` 양옆에 공백이 있어 값이 설정되지 않음 | `MOCK_BANK_URL="http://localhost:8090"`으로 고쳐야 함(개인 `.env`, 같은 방식으로 띄운 wallet은 Mock Bank 주소를 받지 못함) |

프런트 코드에서 고친 곳은 없습니다. 확인하지 못한 것은 화면 대조(목록·상세·등록 화면에서 위 상태가 그대로 보이는지)와 `koreaexim` 모드의 실제 수집 시각 체결입니다.

### 송금

위 E2E에서 빠졌던 송금을 같은 방식(개발 서버 프록시 → Gateway, 프런트 `features/transfer/api.ts`와 같은 본문·헤더)으로 확인했습니다. 송금인(실명 유재석, 004 계좌로 30,000원 충전)·수취인(박지현)·지갑 없는 회원·제3자 4명을 새로 가입시켰고, 수취인 정지·해제에는 관리자 계정을 썼습니다. 요청 109건(200 65 · 201 11 · 202 5 · 204 2, 의도한 오류 응답 26건), 확인 항목 55개가 모두 예상대로였고 서비스 로그 ERROR는 0건입니다.

| 확인한 것 | 결과 |
|---|---|
| 수취인 확인 | 200 `receiverName` `박*현`, `transferable: true`. 응답 필드는 `receiverId`·`receiverName`·`transferable`뿐(지갑 정보 없음) |
| 수취인 확인 오류 | 본인 400 `TRANSFER_SELF_TRANSFER`, 지갑 없는 회원·없는 회원 404 `TRANSFER_RECEIVER_NOT_FOUND`, UUID가 아닌 값 400 `COMMON_INVALID_REQUEST` |
| 송금 | 10,000원 201 `COMPLETED`, `direction` `SENT`. 응답에 지갑 ID·멱등성 키 없음. 잔액 송금인 30,000 → 20,000, 수취인 0 → 10,000 |
| 멱등성 | 같은 키·같은 본문은 201 같은 `transferId`. 메모 앞뒤 공백만 다른 본문도 같은 송금(서버가 메모를 정규화해 비교). 금액이 다르면 409 `TRANSFER_IDEMPOTENCY_KEY_REUSED`. 재요청 뒤 잔액 변화 없음 |
| 같은 키 동시 5건 | 송금 1건만 생성(201 1 · 202 4). 202 응답은 먼저 저장된 송금의 그 시점 상태 `PROCESSING`이었고 최종 `COMPLETED`, 잔액은 한 번만 이동 |
| 입력 검증 | `Idempotency-Key` 없음 400 `TRANSFER_INVALID_IDEMPOTENCY_KEY`, 본인 400 `TRANSFER_SELF_TRANSFER`, 금액 0·메모 101자 400 `COMMON_INVALID_REQUEST`, USD 400 `TRANSFER_UNSUPPORTED_CURRENCY` |
| 지갑 없음 | 받는 쪽 422 `TRANSFER_RECEIVER_UNAVAILABLE`, 보내는 쪽 422 `TRANSFER_SENDER_WALLET_UNAVAILABLE` |
| 잔액 부족 | 100만 원 422 `TRANSFER_INSUFFICIENT_BALANCE`, 같은 키 재요청도 같은 422. 잔액 0인 JPY 송금도 같은 422. 거절된 송금은 `FAILED`로 내역에 남고 잔액 변화 없음 |
| 내역 | 보낸 내역 4건(`COMPLETED` 2 · `FAILED` 2) 최신순, 받은 내역은 전부 `RECEIVED`. `size=200`은 100으로 조회, `direction=BOTH`·`page=-1`은 400 |
| 상세 | 송금인 200 `SENT`, 수취인 200 `RECEIVED`, 제3자·없는 ID 404 `TRANSFER_NOT_FOUND` |
| 취소 | `COMPLETED`·`FAILED` 송금 취소 409 `COMMON_CONFLICT`, 수취인의 취소 404 `TRANSFER_NOT_FOUND` |
| 수취인 정지 | 관리자가 정지하면 수취인 확인 404 `TRANSFER_RECEIVER_NOT_FOUND`, 송금 422 `TRANSFER_RECEIVER_UNAVAILABLE`. 해제하면 다시 송금 가능. 정지된 회원의 기존 세션은 해제 뒤에도 401이라 다시 로그인해야 함 |
| 로그아웃 | 204 → 송금 내역 401 `COMMON_UNAUTHORIZED` |

서비스 로그 WARN 19건은 모두 의도한 상황입니다. payment-service 16건은 같은 키 동시 요청에서 나중 요청의 DB 중복 키(`23505`)를 Hibernate가 남긴 것이고(서버는 먼저 저장된 송금으로 응답), wallet-service 3건은 지갑 없는 회원 조회입니다.

발견한 것:

| 내용 | 영향 | 조치 |
|---|---|---|
| 수취인의 받은 내역·상세에 실패(`FAILED`) 송금도 보임 | 화면이 받은 송금을 모두 `+금액`(입금 색)으로 표시하고, 상세 안내도 송금인 기준 문구("잔액이 빠지지 않았습니다", "다시 송금하지 마세요")라 수취인이 입금으로 오해할 수 있었음 | 프런트 수정: 받은 송금은 `COMPLETED`일 때만 `+`·입금 색, 그 밖은 부호 없이 표시. 상세 안내를 보낸 분·받는 분별로 나눔(`features/transfer/status.ts`) |
| 관리자(`MASTER`) 세션으로 `GET /api/v1/transfers`가 200 | 지갑 API는 관리자에게 403인데 송금 API는 역할을 막지 않음. 관리자 화면에는 송금 메뉴가 없어 프런트 영향은 없음 | 백엔드에 공유 |

프런트 코드는 위 수취인 표시만 고쳤습니다. 확인하지 못한 것:

- `REQUESTED` 송금 취소 성공: 원장 연동 뒤 새 송금은 `PROCESSING`으로 시작해 지금은 `REQUESTED`를 만들 수 없습니다.
- `PROCESSING`이 이어지는 경우와 `MANUAL_REVIEW`: 원장 장애 주입이 필요해 제외했습니다(관리자 `MANUAL_REVIEW` 처리 E2E와 함께 확인할 예정).
- 화면 대조: 요청은 스크립트로 보냈습니다. 같은 계정으로 송금 화면을 열어 위 상태·잔액이 그대로 보이는지는 따로 확인해야 합니다.

### 관리자 자금 운영

관리자 송금·충전·대사·처리 기록·지연 환불 API를 같은 방식(Gateway, 프런트 `features/admin/`과 같은 경로·파라미터·본문)으로 확인했습니다. 관리자 계정과 일반회원(가맹점 주인) 계정 하나씩을 썼고, 확인 항목 50개가 모두 예상대로였습니다. 상태를 바꾸는 요청은 충전 대사 실행과, 없는 대상에 보낸 확정·보정(거절 확인용)뿐입니다.

| 구분 | 확인 내용 | 결과 |
|---|---|---|
| 송금 목록·상세 | `GET /admin/transfers` 페이지 응답, 상태(`MANUAL_REVIEW`)·정렬(`OLDEST`)·회원 필터, `size=200` → 100, 잘못된 상태 400. 상세 필드(지갑 ID·`reviewReason`·`failureReason`·`attemptCount`) | 모두 예상대로 |
| 송금 이력·미리보기 | 이력 200(배열). `MANUAL_REVIEW` 아닌 송금 미리보기 409 `COMMON_CONFLICT` | 예상대로 |
| 없는 송금 | 상세·이력·미리보기·확정 모두 404 `TRANSFER_NOT_FOUND`(확정은 CSRF 통과 후) | 예상대로 |
| 충전 목록·확인 | 페이지 응답, 항목에 `userId`·`attemptCount`, 회원·상태 필터. `MANUAL_REVIEW` 충전 확인 200(`availableActions` 등), 아닌 충전 409 `CHARGE_NOT_IN_MANUAL_REVIEW`, 없는 충전 404 `CHARGE_NOT_FOUND`, `Idempotency-Key` 없는 보정 400 `CHARGE_INVALID_IDEMPOTENCY_KEY` | 예상대로 |
| 충전 대사 | 기간 생략 실행 200(또는 409 기간 없음), 기간 지정 실행 200 `MANUAL`(대상 9건, 어긋남 0), 1일 넘는 기간 400, 실행 목록·상태 필터, 상세(요약+결과)·어긋남 종류 필터, 없는 실행 404 `RECONCILIATION_RUN_NOT_FOUND` | 예상대로 |
| 처리 기록 | 결제·환불·정산·환전 처리 기록 200, 처리 담당자·종류(`REFUND`)·대상 ID 필터, 잘못된 `type` 400 | 예상대로(로컬 기록 0건) |
| 지연 환불 신청 | `size=200` → 100 | 예상대로(로컬 0건) |
| 권한 | 일반회원으로 관리자 조회 9개 경로·대사 실행 모두 403 `COMMON_FORBIDDEN` | 예상대로 |

처음에 대사 기간을 2일로 보내 400을 받았습니다. 서버 규칙(기간 1일 이하, 끝은 지금보다 5분 이전)대로였고, 화면 안내와 400 문구에 이 규칙을 넣었습니다. 확인하지 못한 것:

- 송금 미리보기 성공·확정, 충전 보정 성공: 로컬에 `MANUAL_REVIEW` 송금이 없고, 충전 보정은 실제 상태를 바꿔 실행하지 않았습니다. 미리보기 → 확정, 원장 변경 409 → 다시 미리보기, 결과 모름 재전송(송금 같은 본문, 충전 같은 키)은 컴포넌트 테스트로 확인했습니다.
- 처리 기록·지연 환불 신청이 있는 화면: 로컬 데이터가 0건이라 목록이 빈 경우만 확인했습니다.
- 화면 대조: 요청은 스크립트로 보냈습니다. 관리자 계정으로 화면을 열어 확인하는 일은 따로 해야 합니다.

### 관리자 회원·약관

관리자 회원 검색·정지/해제·세션 종료와 약관 목록·등록 API를 같은 방식(Gateway, 프런트 `features/admin/memberApi.ts`와 같은 경로·파라미터·본문)으로 확인했습니다. 관리자 계정, 일반회원(가맹점 주인), 새로 가입한 일반회원 1명을 썼고, 확인 항목 70개 중 69개가 예상대로였습니다. 나머지 1개는 스크립트의 기대값 오류였습니다(4글자 이름은 서버가 가운데 두 글자를 가려 `김**트`, 가이드 예시는 3글자 `홍*동`). 같은 시간대 user-service·Gateway 로그 ERROR는 0건이고, 감사 로그는 실제로 바뀐 요청만 남았습니다(상태 변경 2, 세션 종료 1, 약관 등록 2).

| 구분 | 확인 내용 | 결과 |
|---|---|---|
| 회원 검색 | 조건 없음 200(`items`·`page`·`size`·`hasNext`, 기본 size 20, 전체 개수 없음). 이메일(대문자·앞뒤 공백)·하이픈 없는 번호·회원 ID·상태 검색, 빈 조건은 무시. 마스킹 이름·이메일·번호, 응답 필드 6개. size 101·page -1·번호 형식·회원 ID 형식·없는 상태 400 | 예상대로 |
| 정지·해제 | 정지 200 → 기존 세션 403 `USER_ACCOUNT_SUSPENDED`, 새 로그인 403. 이미 정지 재요청 200(그대로). 해제 200 → 기존 세션 401, 새 로그인 200. CSRF 없는 요청 403 `COMMON_CSRF_INVALID` | 예상대로 |
| 세션 종료 | 200 `scope: EXISTING_SESSIONS` → 기존 세션 401, 새 로그인은 허용 | 예상대로 |
| 서버 거절 | 본인 정지 409 `USER_MASTER_PROTECTION_CONFLICT`(본인 `ACTIVE` 지정은 200 그대로), 없는 회원 정지·세션 종료 404 `USER_NOT_FOUND`, `CLOSED` 지정 400, 경로 ID 형식 400 | 예상대로 |
| 약관 목록 | 200, 코드 필터, size 101 400. 새 코드 두 버전이 시행 최신 순 | 예상대로 |
| 약관 등록 | 201(`+09:00` 시각 → UTC 응답, 마이크로초 아래 절사). 같은 코드·버전 409, 같은 시행 시각 409 `USER_TERMS_VERSION_CONFLICT`. 지난 시각·30초 뒤 400 `USER_TERMS_EFFECTIVE_AT_NOT_FUTURE`, 10000년 400. 코드 소문자·빈 제목·버전 41자·빈 본문·필수 여부 없음·시행 시각 없음은 400 `details`에 해당 필드. 시행 전 버전은 공개 약관 조회에 안 나옴 | 예상대로 |
| 권한 | 익명 401. 일반회원 2명으로 관리자 회원·약관 5개 API 모두 403 `COMMON_FORBIDDEN`, 시도 뒤 대상 상태·약관 수 그대로 | 예상대로 |

등록한 약관은 지울 수 없어, 로컬 DB에 확인용 코드 `FE_E2E_*`(선택 동의, 시행 2099년) 두 버전이 남았습니다. 시행 전이라 가입 화면에는 나오지 않습니다. 확인하지 못한 것:

- 종료(`CLOSED`) 계정 정지·해제 409 `USER_CLOSED_ACCOUNT_UNCHANGEABLE`: 계정을 종료하는 API가 없어 컴포넌트 테스트로만 확인했습니다.
- 화면 대조: 요청은 스크립트로 보냈습니다. 관리자 계정으로 화면을 열어 확인하는 일은 따로 해야 합니다.

## 협업 규칙

- [브랜치](docs/convention/branch.md): 작업 브랜치는 `dev`에서 만들고 PR도 `dev`로 보냅니다.
- [커밋](docs/convention/commit.md): `type: 설명` 형식, 스코프 없음
- [이슈·PR](docs/convention/issue-pr.md): `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`
