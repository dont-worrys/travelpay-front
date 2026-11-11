# 처음 실행하기

저장소를 처음 받은 팀원이 프런트를 띄워 화면을 써 보기까지의 순서입니다. 백엔드 설정의 기준 문서는 백엔드 저장소 `docs/guide/local-settings.md`이고, 여기에는 프런트 확인에 필요한 만큼만 적습니다.

## 1. 준비물

| 도구 | 용도 |
|---|---|
| Node.js 20.19 이상 | 프런트 실행·빌드·테스트 |
| Git | 두 저장소 받기 |
| JDK 21, Docker Compose | 백엔드(`travelpay`) 실행. 화면을 실제로 쓰려면 필요하고, 테스트만 돌릴 때는 필요 없음 |

## 2. 프런트 설치

```bash
git clone https://github.com/dont-worrys/travelpay-front.git
cd travelpay-front
git switch dev                 # 작업 브랜치는 dev에서 만든다
npm install
cp .env.example .env.local     # 기본값 그대로 써도 됨
npm test                       # 백엔드 없이 돌아감. 통과하면 설치는 정상
```

`.env.local`은 git에 올라가지 않습니다. 쓸 수 있는 값:

| 이름 | 용도 |
|---|---|
| `API_PROXY_TARGET` | 개발 서버가 `/api`를 넘길 Gateway 주소. 비우면 `http://127.0.0.1:8080`. 브라우저 코드에는 들어가지 않음 |
| `VITE_API_BASE_URL` | 배포처럼 Gateway가 다른 출처일 때 API 기준 주소. 개발 서버에서는 비워 둠. 운영 값은 Vercel Production에만 `https://api.travelpay.store`([배포](guide/deployment.md)) |
| `VITE_SHOW_TEST_ACCOUNTS` | `true`면 배포 빌드에서도 충전 화면에 Mock Bank 테스트 계좌 버튼 표시(개발 서버는 항상 표시) |
| `VITE_LOCAL_TEST_ACCOUNT` | 로컬 Mock Bank DB에만 직접 넣은 계좌를 테스트 계좌 버튼에 "로컬 전용"으로 추가. 형식 `은행코드:계좌번호:예금주`. 실명이 들어가므로 `.env.local`에만 둠 |

## 3. 백엔드 실행

프런트의 모든 API는 Gateway(`/api/v1/**`)를 거칩니다. 백엔드 저장소에서 아래 순서로 준비합니다.

1. **환경 파일** — 백엔드 루트에서 `cp -n .env.example .env`. Wallet의 `WALLET_ACCOUNT_NUMBER_KEY`(Base64 32바이트)는 비어 있으면 기동하지 않으므로 `.env.example` 설명대로 채웁니다. `SPRING_CONFIG_NAME=application-prod`·`SPRING_PROFILES_ACTIVE=prod`는 로컬에서 켜지 않습니다.
2. **인프라** — 확인할 기능에 맞춰 Docker 컨테이너를 띄웁니다.
3. **서비스** — Eureka → User → Ledger → Mock Bank → Wallet → Payment·Exchange → Gateway 순서로 필요한 것만 띄웁니다. 각 서비스 실행 인자는 `--spring.config.name=application --spring.profiles.active=default`입니다.

| 확인할 기능 | Docker 인프라 | 서비스(Eureka·Gateway 외) |
|---|---|---|
| 회원·로그인 | `postgres` `redis-session` | user |
| 지갑·충전 | + `kafka` | + wallet, ledger, mock-bank |
| 송금·결제·가맹점·정산 | 위와 같음 | + payment |
| 환율·환전 | + `redis-cache` | + exchange |

```bash
# 백엔드 루트, 전체 기능 기준
docker compose up -d postgres redis-session kafka redis-cache

set -a; source .env; set +a
./gradlew :eureka-server:bootRun --args='--spring.config.name=application --spring.profiles.active=default'
# 다른 서비스도 터미널을 나눠 모듈 이름만 바꿔 실행 (IntelliJ 실행 구성을 써도 됨)
```

모듈 이름: `eureka-server`, `user-service`, `ledger-service`, `mock-bank`, `wallet-service`, `payment-service`, `exchange-service`, `gateway`. 서비스별로 꼭 넣어야 하는 환경 변수:

| 서비스 | 환경 변수 | 이유 |
|---|---|---|
| Gateway | `GATEWAY_CORS_ALLOWED_ORIGINS=http://localhost:5173` | 개발 서버 프록시는 브라우저의 `Origin`을 그대로 넘깁니다. 목록에 없는 출처는 `403 COMMON_FORBIDDEN` |
| Wallet | `MOCK_BANK_URL=http://localhost:8090` | Mock Bank는 Eureka에 등록하지 않아 직접 주소가 필요 |
| Exchange | `EXCHANGE_RATE_MODE=mock` | API 키 없이 환율을 만듭니다. `koreaexim`은 평일 11~13시에만 수집해 로컬에서 견적이 막히기 쉬움 |

`gradlew bootRun`을 Gradle 데몬으로 실행하면 터미널 환경 변수가 전달되지 않을 수 있습니다. IntelliJ 실행 구성의 Environment variables에 넣거나 `--no-daemon`으로 실행합니다.

기동 확인: Eureka `http://localhost:8761`에 서비스가 `UP`으로 보이고, Gateway `http://localhost:18080/actuator/health`가 `UP`이면 됩니다. Gateway가 다른 서비스보다 먼저 뜨면 1분 안팎 동안 `503`이 날 수 있습니다.

## 4. 프런트 실행

```bash
npm run dev        # http://localhost:5173
```

개발 서버가 `/api` 요청을 `API_PROXY_TARGET`(기본 `http://127.0.0.1:8080`)으로 넘깁니다. 앱을 처음 열 때 콘솔에 찍히는 `GET /api/v1/users/me 401`은 로그인 상태 확인이라 정상입니다.

그 밖의 명령:

```bash
npm run build      # 타입 검사 + 빌드 (dist/)
npm run typecheck  # 타입 검사만
npm test           # 테스트 타입 검사 + Vitest
npm run preview    # 빌드 결과 미리 보기
```

## 5. 처음 써 보기

1. `/signup`에서 가입합니다. 충전하려면 **실명을 Mock Bank 계좌 예금주와 같게**(예: 유재석) 넣어야 합니다.
2. 로그인 → **내 지갑**에서 지갑을 만듭니다. 지갑은 가입 때 자동으로 생기지 않고, 없으면 충전·송금·결제를 못 합니다.
3. **충전하기**에서 테스트 계좌 버튼으로 계좌를 채우고 충전합니다.
4. 송금은 받는 회원의 회원 ID(상대 **내 정보** 화면에서 복사)로, 결제는 관리자가 만든 가맹점 ID로 합니다. 가맹점 주인도 정산을 받으려면 지갑이 있어야 합니다.

### 충전 테스트 계좌

로컬 Mock Bank 시드 계좌입니다. 회원 실명이 예금주와 같아야 출금됩니다. 개발 서버에서는 충전 화면의 **테스트 계좌** 버튼으로 채울 수 있습니다(목록: `src/features/wallet/testAccounts.ts`).

| 은행 | 계좌번호 | 예금주 | 결과 |
|---|---|---|---|
| `004` KB국민 | `12340101234567` | 유재석 | 성공 |
| `088` 신한 | `110123456789` | 박지현 | 성공 |
| `020` 우리 | `1002123456789` | 유재석 | 5,000원 초과 시 은행 잔액 부족 |
| `011` NH농협 | `3021234567891` | 유재석 | 정지 계좌 |

### 관리자 계정 만들기

관리자(`MASTER`) 가입 화면이나 API는 없습니다. 일반회원으로 가입한 뒤 로컬 DB에서 역할을 바꿉니다(접속 값은 백엔드 `.env`의 `POSTGRES_USER`·`POSTGRES_DB`).

```bash
# 백엔드 루트
docker compose exec postgres psql -U <POSTGRES_USER> -d <POSTGRES_DB>
```

```sql
update user_service.users set role = 'MASTER'
where id = (select user_id from user_service.user_credentials where login_email = '가입한 이메일');
```

다시 로그인하면 관리자 메뉴만 보입니다. 관리자는 지갑·충전·송금 같은 일반회원 화면을 쓰지 않으므로, 가맹점 주인처럼 일반회원 기능이 필요한 계정은 바꾸지 않습니다.

## 6. 자주 나는 문제

| 증상 | 확인할 것 |
|---|---|
| 화면에 "서버에 연결하지 못했습니다", 개발 서버 터미널에 `ECONNREFUSED` | Gateway가 꺼졌거나 `API_PROXY_TARGET` 주소가 다름 |
| `403 COMMON_FORBIDDEN`(로그인 전부터) | Gateway에 `GATEWAY_CORS_ALLOWED_ORIGINS=http://localhost:5173`이 전달되지 않음(데몬 실행 여부 확인) |
| `503 COMMON_SERVICE_UNAVAILABLE` | 해당 서비스가 꺼져 있거나 Eureka에 아직 등록 전(기동 후 1분 안팎). 환율·환전이면 exchange |
| 환전 견적이 503 `EXCHANGE_QUOTE_STORE_UNAVAILABLE` | `redis-cache` 컨테이너가 꺼짐 |
| exchange 기동 실패(`defaultMidRates` 바인딩 오류) | 운영 설정을 읽는 중. `SPRING_CONFIG_NAME`·`SPRING_PROFILES_ACTIVE`를 지우고 로컬 인자로 실행 |
| 충전이 예금주 불일치로 실패 | 회원 실명과 계좌 예금주가 다름. 위 표의 예금주 이름으로 가입 |
| 충전이 끝나지 않음·은행 조회 실패 | Wallet에 `MOCK_BANK_URL`이 없거나 Mock Bank가 꺼짐 |
| 정산 요청이 `PAYMENT_SETTLEMENT_WALLET_NOT_AVAILABLE` | 가맹점 주인 지갑이 없음. 주인 계정으로 지갑 개설 |
| 정산 요청이 `PAYMENT_NO_SETTLEMENT_TARGET` | 결제 승인 후 3일 1시간이 지나야 대상이 생김(정상) |

백엔드 로그는 백엔드 `infra/monitoring/.local-logs/<서비스>.log`(JSON)에 남습니다. CORS 거절은 ERROR로 남지 않습니다.

## 다음에 볼 문서

- [화면 목록](guide/screens.md) — 경로별 화면과 미구현·제약
- [개발 가이드](guide/development.md) — 폴더 구조, API 호출·금액·멱등성 규칙
- [테스트·검증 가이드](guide/testing.md) — 테스트 실행·작성, PR 전 확인 순서
