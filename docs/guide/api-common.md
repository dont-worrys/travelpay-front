# 공통 API 규칙 (프런트엔드용)

백엔드 저장소(`travelpay`)의 공통 규칙 중 프런트엔드가 알아야 할 내용만 정리했습니다. 원문은 백엔드의 `docs/guide/common.md`, `docs/guide/gateway.md`, `docs/guide/user-service.md`입니다. 기능별 API 명세는 백엔드 `docs/guide/<서비스>.md`를 기준으로 합니다.

## 주소

| 용도 | 로컬 | 배포 |
|---|---|---|
| 프런트 | `http://localhost:5173` | `https://travelpay.store`, `https://www.travelpay.store` |
| API(Gateway) | `http://localhost:8080` | `https://api.travelpay.store` |

- 모든 외부 API는 Gateway를 거치며 경로는 `/api/v1/**`입니다. `/internal/**`·`/actuator/**`는 외부에서 호출할 수 없습니다.
- 개발 서버는 Vite 프록시로 `/api`를 Gateway에 넘기므로 `VITE_API_BASE_URL`을 비워 둡니다. 배포처럼 다른 출처면 `VITE_API_BASE_URL`에 Gateway 주소를 지정합니다.

### Gateway 라우트

| 경로 | 서비스 |
|---|---|
| `/api/v1/auth/**`, `/api/v1/terms/**`, `/api/v1/users/**`, `/api/v1/admin/users/**`, `/api/v1/admin/terms/**` | User |
| `/api/v1/wallets/**`, `/api/v1/charges/**` | Wallet |
| `/api/v1/payments/**`, `/api/v1/transfers/**`, `/api/v1/admin/transfers/**` | Payment |
| `/api/v1/exchange-rates/**`, `/api/v1/exchange-limits/**`, `/api/v1/exchange-quotes/**`, `/api/v1/exchanges/**` | Exchange |

### 로그인 없이 호출할 수 있는 API

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/api/v1/auth/csrf` | CSRF 토큰 조회(세션 쿠키 발급) |
| GET | `/api/v1/terms` | 약관 조회 |
| POST | `/api/v1/users` | 회원가입 |
| POST | `/api/v1/auth/login` | 로그인 |
| POST | `/api/v1/auth/logout` | 로그아웃 |
| GET | `/api/v1/exchange-rates/**` | 환율 조회 |

그 밖의 경로는 로그인 세션이 필요합니다. 관리자 API(`/api/v1/admin/**`)는 ACTIVE `MASTER`만 통과합니다.

## 데이터 형식

- **ID**: UUID 문자열
- **JSON 필드**: camelCase
- **Enum 값**: 대문자 snake_case (예: `ACTIVE`, `MANUAL_REVIEW`)
- **금액**: 통화별 최소 단위의 정수. 화면 표시용 변환만 하고 계산에 소수(`number`의 소수점 연산)를 쓰지 않습니다. 다른 통화끼리 더하거나 비교하지 않습니다.
- **시간**: ISO-8601 문자열. 서버는 UTC로 저장하며, 화면에서 KST로 바꿔 보여 줍니다.

## 공통 응답

성공 (`message` 필드는 없습니다. 성공 안내 문구는 프런트에서 정합니다):

```json
{ "success": true, "data": {}, "error": null }
```

실패:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "USER_EMAIL_ALREADY_EXISTS",
    "message": "이미 사용 중인 이메일입니다.",
    "details": [{ "field": "loginEmail", "message": "..." }]
  }
}
```

- 분기는 `error.code` 문자열로 합니다. `error.message`는 화면에 보여 줄 수 있는 한국어 문구입니다.
- `details`는 필드별 오류 목록이며 없으면 `[]`입니다.
- `204`·`HEAD` 응답은 본문이 없습니다(로그아웃, 비밀번호 변경 등).
- 타입 정의: `src/api/types.ts`

### 공통 오류 코드

| HTTP | code | 프런트 처리 |
|---|---|---|
| 400 | `COMMON_INVALID_REQUEST` | `details`로 필드별 오류 표시 |
| 401 | `COMMON_UNAUTHORIZED` | 로그인 상태 지우고 `/login?redirect=...` |
| 403 | `COMMON_FORBIDDEN` | 권한 없음(허용되지 않은 출처도 이 코드) |
| 403 | `COMMON_CSRF_INVALID` | 토큰 다시 받아 한 번만 재시도 |
| 404 | `COMMON_NOT_FOUND` | 타인 리소스도 404로 옵니다 |
| 405 | `COMMON_METHOD_NOT_ALLOWED` | |
| 406 | `COMMON_NOT_ACCEPTABLE` | |
| 409 | `COMMON_CONFLICT` | 현재 상태에서 처리 불가 |
| 413 | `COMMON_PAYLOAD_TOO_LARGE` | |
| 415 | `COMMON_UNSUPPORTED_MEDIA_TYPE` | |
| 429 | `COMMON_TOO_MANY_REQUESTS` | `Retry-After` 확인 후 안내 |
| 500 | `COMMON_INTERNAL_SERVER_ERROR` | |
| 502 | `COMMON_BAD_GATEWAY` | |
| 503 | `COMMON_SERVICE_UNAVAILABLE` | |
| 504 | `COMMON_GATEWAY_TIMEOUT` | 금전 요청은 성공 여부를 단정하지 말고 조회로 확인 |

서비스별 업무 오류는 `USER_`, `WALLET_`, `PAYMENT_`처럼 서비스 접두사가 붙습니다.

## 목록 조회

- 페이지 번호 방식이며 `page`는 **0부터** 시작합니다.
- 기본 `size` 20, 최대 100입니다.
- 응답 `data`는 `PageResponse`(`items`, `page`, `size`, `totalElements`, `totalPages`)입니다.

## 인증: 세션 쿠키 + CSRF

외부 API는 JWT가 아니라 Redis 세션 쿠키(`SESSION`, HttpOnly)를 씁니다. 프런트는 쿠키 값을 읽지 않습니다.

- 모든 요청에 `credentials: 'include'`를 지정합니다.
- POST·PUT·PATCH·DELETE에는 CSRF 헤더가 필요합니다. 헤더 이름은 `GET /api/v1/auth/csrf` 응답의 `headerName`(현재 `Csrf-Token`)을 씁니다. GET에 붙여도 무해합니다.
- **로그인·로그아웃·비밀번호 변경 뒤에는 세션 ID가 바뀌어 이전 CSRF 토큰이 무효**입니다. 토큰을 버리고 다시 받습니다. 빠뜨리면 `403 COMMON_CSRF_INVALID`.
- 요청 본문에 사용자 ID를 넣지 않습니다. 서버는 세션의 회원으로 처리합니다.
- 구현: `src/api/csrf.ts`, `src/api/client.ts`, `src/features/auth/AuthContext.tsx`

```text
1. GET  /api/v1/auth/csrf   → SESSION 쿠키와 { headerName, token }
2. POST /api/v1/auth/login  → Csrf-Token 포함. 성공 시 세션 ID 교체
3. GET  /api/v1/auth/csrf   → 새 토큰
4. GET  /api/v1/users/me
5. POST /api/v1/auth/logout → 새 Csrf-Token 포함
```

비밀번호 변경에서 `503 USER_ACCOUNT_UPDATED_SESSION_UNAVAILABLE`을 받으면 DB 변경은 완료된 상태입니다. 자동 재시도하지 말고 새 비밀번호로 다시 로그인하도록 안내합니다.

## 멱등성 (`Idempotency-Key`)

송금·결제·충전처럼 금전이 움직이는 POST는 `Idempotency-Key` 헤더가 필요합니다.

- 사용자 동작 한 번에 키 하나(UUID)를 만듭니다.
- 타임아웃·네트워크 오류로 **재시도할 때는 같은 키**를 씁니다. 새 키로 보내면 중복 처리될 수 있습니다.
- 5xx·타임아웃만으로 실패라고 단정하지 않습니다. 상세 조회로 결과를 확인합니다.
- 공통 요청 함수의 `options.idempotencyKey`로 넘깁니다.

## CORS (Gateway)

| 항목 | 정책 |
|---|---|
| 허용 출처 | 정확한 주소만. 로컬은 Gateway의 `GATEWAY_CORS_ALLOWED_ORIGINS`로 지정(기본값 없음) |
| 요청 헤더 | `Accept`, `Content-Type`, `Csrf-Token`, `Idempotency-Key` |
| 자격 증명 | 쿠키 포함 요청 허용 |
| 노출 응답 헤더 | `Request-Id`, `Location`, `Retry-After` |
| 거절 | 403 공통 JSON |

- 위 목록 외의 요청 헤더를 추가하면 preflight에서 막힙니다. 필요하면 Gateway 담당자와 협의합니다.
- `*.vercel.app` 같은 와일드카드는 허용하지 않습니다. 미리보기 주소가 필요하면 정확한 주소를 Gateway에 등록해야 합니다.

## 로컬 개발 환경

1. 백엔드: `docker compose up -d postgres redis-session` 후 Eureka → User → 필요한 업무 서비스 → Gateway 순서로 실행
2. Gateway 실행 시 환경 변수 지정:
   ```text
   GATEWAY_CORS_ALLOWED_ORIGINS=http://localhost:5173
   ```
   Gradle 데몬으로 실행하면 터미널 환경 변수가 전달되지 않을 수 있으므로 IntelliJ 실행 구성의 Environment variables에 넣거나 `--no-daemon`을 씁니다.
3. 프런트: `npm run dev` (Gateway 주소가 다르면 `.env.local`의 `API_PROXY_TARGET` 수정)
