# TravelPay 프런트엔드

Vite + React + TypeScript. 모든 API는 Gateway(`/api/v1/**`)를 거쳐 호출합니다.

## 실행

Node 20.19 이상이 필요합니다.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 타입 검사 + 빌드
npm test           # 테스트 타입 검사 + Vitest(jsdom) 컴포넌트·단위 테스트
```

### Gateway 설정

개발 서버는 `/api` 요청을 Gateway(기본 `http://127.0.0.1:8080`)로 넘깁니다. 주소를 바꾸려면 `.env.example`을 `.env.local`로 복사해 `API_PROXY_TARGET`을 고칩니다.

프록시는 브라우저의 `Origin: http://localhost:5173`을 그대로 넘깁니다. Gateway는 목록에 없는 출처의 요청을 `403 COMMON_FORBIDDEN`으로 거절하므로, Gateway를 띄울 때 아래 환경 변수를 지정합니다.

```text
GATEWAY_CORS_ALLOWED_ORIGINS=http://localhost:5173
```

`gradlew bootRun`을 Gradle 데몬으로 실행하면 터미널 환경 변수가 전달되지 않을 수 있습니다. IntelliJ 실행 구성의 Environment variables에 넣거나 `--no-daemon`으로 실행하세요.

`503 COMMON_SERVICE_UNAVAILABLE`은 해당 서비스가 Eureka에 없을 때 납니다. 서비스가 꺼져 있거나(예: 환율·환전은 exchange-service), Gateway보다 늦게 떠서 Gateway가 아직 목록을 갱신하지 않은 경우(기동 후 1분 안팎)입니다. 앱을 처음 열 때 콘솔에 찍히는 `GET /api/v1/users/me 401`은 로그인 상태 확인이라 정상입니다.

## 폴더 구조

```text
src/
  main.tsx            진입점 (AuthProvider + RouterProvider)
  router.tsx          경로 정의. 로그인이 필요한 화면은 RequireAuth 아래에 둔다
  api/                공통 요청 함수
  features/auth/      로그인 상태, 인증 API, 로그인 필요 경로 보호
  features/transfer/  송금 API·상태 표시
  features/wallet/    지갑·잔액·충전 API, 충전 상태·은행 목록
  lib/                금액 최소 단위 변환(money), 멱등성 키(idempotency), 시각 표시(datetime)
  components/         공통 레이아웃
  pages/              화면 단위 컴포넌트
```

로컬 Mock Bank 시드 계좌(충전 테스트): `004`/`12340101234567` 예금주 유재석(성공), `020`/`1002123456789` 유재석(5,000원 초과 시 은행 잔액 부족), `088`/`110123456789` 박지현. 회원 실명이 예금주와 같아야 한다. 개발 서버에서는 충전 화면의 **테스트 계좌** 버튼으로 채울 수 있다(목록: `src/features/wallet/testAccounts.ts`, 배포 빌드는 `VITE_SHOW_TEST_ACCOUNTS=true`일 때만 표시).

### 공통 요청 함수 (`src/api`)

- `apiRequest(path, options)`: 성공이면 `data`만 돌려주고, 실패면 `ApiError(status, code, message, details)`를 던진다. 204는 `undefined`
- `apiRequestWithStatus`: HTTP 상태가 필요할 때(예: 송금 201/202 구분)
- 세션 쿠키: 모든 요청에 `credentials: 'include'`
- CSRF: `GET /api/v1/auth/csrf`로 받은 토큰을 메모리에 두고, POST·PUT·PATCH·DELETE 전에 없으면 받아서 서버가 알려 준 헤더 이름(`headerName`)으로 붙인다. `403 COMMON_CSRF_INVALID`면 토큰을 새로 받아 한 번만 다시 보낸다(CSRF 검사는 업무 처리 전에 거절하므로 안전)
- 로그인·로그아웃 뒤에는 세션 ID가 바뀌므로 토큰을 버리고 다시 받는다(`AuthContext`가 처리)
- `Idempotency-Key`: `options.idempotencyKey`로 넘긴다. 재시도할 때는 같은 값을 쓴다
- 401을 받으면 로그인 상태를 지우고, 보호된 화면은 로그인 화면(`/login?redirect=원래경로`)으로 보낸다. `redirect`는 앱 내부 경로만 허용한다
- 화면 문구: `toUserMessage(error)` — 공통 장애 코드만 바꾸고 나머지는 서버의 한국어 `error.message`를 쓴다

### 화면

| 경로 | 화면 | 로그인 |
|---|---|---|
| `/` | 홈 | 불필요 |
| `/signup` | 회원가입(약관 조회·동의, 필드별 오류 표시) → 로그인 화면으로 이동 | 불필요 |
| `/login` | 로그인 → `redirect` 경로로 이동 | 불필요 |
| `/me` | 내 정보(송금받을 회원 ID 복사) | 필요 |
| `/wallet` | 내 지갑: 지갑 없으면 개설(`PENDING`이면 이어서 개설), 통화별 잔액, 최근 충전 5건 | 필요 |
| `/wallet/charge` | 원화 충전(은행·계좌번호). 계좌 예금주가 회원 실명과 같아야 함 | 필요 |
| `/wallet/charges` | 충전 내역(페이지) | 필요 |
| `/wallet/charges/:chargeId` | 충전 상세. 끝날 때까지 2초마다 최대 2분 다시 조회, 실패 사유 표시 | 필요 |
| `/transfers` | 송금 내역(전체·보낸·받은, 페이지) | 필요 |
| `/transfers/new` | 송금하기: 수취인 확인 → 금액·통화·메모(보낼 수 있는 잔액 안내) → 확인 → 송금 | 필요 |
| `/transfers/:transferId` | 송금 상세. `PROCESSING`이면 3초마다 최대 2분 다시 조회, `REQUESTED`는 취소 가능 | 필요 |

### 송금·충전 멱등성

송금·충전 요청마다 새 `Idempotency-Key`를 만든다. 연결 실패·5xx처럼 결과를 모르면 키를 유지해 "다시 시도"가 같은 키·같은 본문으로 나가고(중복 송금 없음), 서버가 판단을 끝낸 응답(2xx·4xx)을 받거나 내용을 바꾸면 새 키를 쓴다.
