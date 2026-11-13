# 배포 (Vercel)

프런트는 Vercel에 정적 사이트로 배포하고, API는 `https://api.travelpay.store`(Cloudflare → AWS ALB → Gateway)로 호출합니다. 백엔드·인프라 기준은 백엔드 `docs/guide/gateway.md` "프런트 CORS와 쿠키", "Cloudflare → ALB → Gateway 배포 시 연결할 것"을 따릅니다.

| 구분 | 주소 |
|---|---|
| 대표 도메인 | `https://travelpay.store` |
| 보조 도메인 | `https://www.travelpay.store` → 대표 도메인으로 308 리다이렉트 |
| API | `https://api.travelpay.store` |
| 저장소 | `dont-worrys/travelpay-front` |

## Vercel 프로젝트 설정

| 항목 | 값 |
|---|---|
| Framework Preset | Vite (`vercel.json`에도 지정) |
| Install / Build / Output | `npm ci` / `npm run build` / `dist` (`vercel.json`) |
| Node.js Version | 22.x (`package.json` `engines`가 `>=20.19.0`) |
| Production Branch | `main` |
| Deployment Protection | Preview는 Vercel Authentication 켬(기본값) |

### 환경 변수

| 이름 | 값 | 적용 환경 |
|---|---|---|
| `VITE_API_BASE_URL` | `https://api.travelpay.store` | **Production만** (Preview·Development에는 넣지 않음) |

- `VITE_` 변수는 빌드 때 번들에 들어갑니다. 값을 바꾸면 재배포해야 반영됩니다.
- 끝에 `/`를 붙여도 코드가 지웁니다.
- `VITE_SHOW_TEST_ACCOUNTS`·`VITE_LOCAL_TEST_ACCOUNT`는 운영에 넣지 않습니다.

## SPA 새로고침 (`vercel.json`)

`/admin/reviews`처럼 화면 경로로 직접 들어오거나 새로고침하면 Vercel에는 그런 파일이 없어 404가 납니다. `vercel.json`의 `rewrites`가 `/api/`·`/assets/`를 뺀 경로를 `index.html`로 돌려 react-router가 화면을 고릅니다.

- 실제 파일(`/assets/*.js`, `favicon` 등)은 rewrite보다 먼저 응답됩니다.
- `/api/*`는 rewrite에서 빼서, 잘못된 API 기준 주소로 요청해도 HTML이 아닌 404가 납니다.
- 없는 `/assets/*` 파일은 `index.html` 대신 404가 납니다(배포 직후 이전 번들 요청 구분용).
- 화면 코드는 라우트별 청크로 나뉘어 처음 여는 화면에서 내려받습니다(#55). 배포 직후 이전 버전 탭에서 아직 열지 않은 화면으로 가면 이전 청크가 404가 됩니다. 이때 `lib/chunkReload`가 한 번만 자동 새로고침합니다(`sessionStorage` `travelpay.chunkReloadAt`, 청크를 정상으로 받으면 지움). 새로고침 뒤에도 못 받으면 본문에 "화면을 불러오지 못했습니다" 안내와 새로고침 버튼(`RouteError`)을 보입니다. 동적 import 실패 문구로만 판단하므로 화면 코드의 일반 오류는 새로고침하지 않고 기존처럼 라우터 기본 오류 화면으로 갑니다.

## 응답 헤더 (`vercel.json`)

| 경로 | 헤더 | 이유 |
|---|---|---|
| `/assets/*` | `Cache-Control: public, max-age=31536000, immutable` | 파일 이름에 내용 해시가 붙어 배포마다 이름이 바뀌므로 오래 캐시해도 됩니다. `index.html`은 Vercel 기본값(매번 재검증)이라 새 배포가 바로 반영됩니다. |
| 전체 | `X-Content-Type-Options: nosniff` | 응답 형식 추측 금지 |
| 전체 | `X-Frame-Options: DENY` | 다른 사이트의 iframe에 넣지 못하게 함(클릭재킹 방지) |
| 전체 | `Referrer-Policy: strict-origin-when-cross-origin` | 다른 출처(API 포함)로는 경로 없이 출처만 보냄 |

CSP는 Google Fonts·API 주소 허용 목록을 운영에서 확인한 뒤 따로 정합니다(지금은 넣지 않음).

## 배포 전 확인 (프런트)

- `npm test`·`npm run build` 통과, 빌드에 500kB 청크 경고 없음.
- 운영 빌드에는 `.env.local` 값이 들어가지 않습니다(Vercel은 저장소 기준으로 빌드). 로컬에서 `npm run build`하면 `.env.local`을 읽으므로, 로컬 `dist`를 직접 올리지 않습니다.
- 충전 테스트 계좌 버튼은 개발 서버에서만 보입니다(`VITE_SHOW_TEST_ACCOUNTS` 미설정 시).
- 운영 반영은 `dev` → `main` PR로 합니다(Production Branch `main`).

## Preview 환경 제한

Preview(PR·브랜치 배포)에서는 운영 API 호출과 운영 계정 로그인을 막습니다. 세 겹으로 막습니다.

1. **빌드 차단(코드)**: `vite.config.ts`가 Vercel이 넣는 `VERCEL_ENV`가 `preview`면 `VITE_API_DISABLED=true`로 빌드합니다. 이 빌드의 `apiRequest`·CSRF 요청은 `fetch` 없이 `CLIENT_API_DISABLED` 오류("미리보기 환경에서는 API를 호출하지 않습니다…")로 끝납니다. 환경 변수로 끌 수 없어 `VITE_API_BASE_URL`을 Preview에 잘못 넣어도 요청이 나가지 않습니다. Production 빌드에는 이 코드가 빠집니다.
2. **환경 변수 범위**: `VITE_API_BASE_URL`을 Production에만 둡니다.
3. **Gateway CORS**: 운영 허용 출처는 `https://travelpay.store`, `https://www.travelpay.store`뿐이라 `*.vercel.app` 출처는 403입니다(백엔드 설정, 변경하지 않음).

Preview에서는 화면 모양·라우팅만 확인합니다. 로그인이 필요한 기능은 로컬 개발 서버에서 확인합니다.

## 도메인·DNS

1. Vercel 프로젝트 → Settings → Domains에서 `travelpay.store` 추가(Production).
2. `www.travelpay.store` 추가 → "Redirect to `travelpay.store`", 308.
3. Vercel이 도메인마다 보여 주는 레코드를 DNS(Cloudflare)에 등록합니다. 값은 프로젝트마다 다를 수 있으니 반드시 Vercel 화면 값을 씁니다.

| 이름 | 종류 | 값 (Vercel 화면 기준) | Cloudflare 프록시 |
|---|---|---|---|
| `@` (`travelpay.store`) | A | Vercel 안내 IP (일반값 `76.76.21.21`) | DNS only(회색 구름) |
| `www` | CNAME | Vercel 안내 값 (일반값 `cname.vercel-dns.com`) | DNS only(회색 구름) |
| `api` | CNAME | ALB DNS 이름 (인프라 담당) | 인프라 기준(Full strict) |

- Vercel 레코드를 Cloudflare 프록시(주황 구름)로 두면 Vercel 인증서 발급·갱신이 실패하거나 리다이렉트가 반복될 수 있어 DNS only로 둡니다.
- 도메인이 다른 Vercel 계정에 연결된 적이 있으면 Vercel이 `_vercel` TXT 레코드(소유 확인)를 추가로 요구합니다. 그 값도 함께 등록합니다.
- 레코드가 반영되면 Vercel이 HTTPS 인증서를 자동 발급합니다(Domains 화면 "Valid Configuration").

## 통합 검증 (배포 뒤, 백엔드·인프라와 함께)

| 항목 | 확인 방법 | 기대 |
|---|---|---|
| 접속·HTTPS | 브라우저 `https://travelpay.store` | 화면 표시, 인증서 유효 |
| www 리다이렉트 | `curl -sI https://www.travelpay.store/wallet` | 308, `Location: https://travelpay.store/wallet` |
| 응답 헤더 | `curl -sI https://travelpay.store/` 와 `curl -sI https://travelpay.store/assets/<파일>.js` | 보안 헤더 3개, assets에 `immutable` |
| 새로고침·직접 접근 | `/wallet`, `/admin/reviews` 주소 직접 입력·새로고침 | 404 없이 화면(로그인 전이면 로그인 화면) |
| CSRF·SESSION | 개발자 도구 Network: `GET /api/v1/auth/csrf` → `Set-Cookie: SESSION`(HttpOnly, `api.travelpay.store`) | 200, 이후 요청에 쿠키 전달 |
| 로그인·세션 유지 | 로그인 → 새로고침 → `GET /api/v1/users/me` | 200, 로그인 유지 |
| 인증 API | 지갑 조회 등 | 200 |
| 로그아웃 | 로그아웃 → `/users/me` | 401, 로그인 화면 |
| 허용 출처 preflight | `curl -si -X OPTIONS https://api.travelpay.store/api/v1/wallets/me -H 'Origin: https://travelpay.store' -H 'Access-Control-Request-Method: GET'` | 200, `Access-Control-Allow-Origin: https://travelpay.store`, `Access-Control-Allow-Credentials: true` |
| 비허용 출처 | 위 명령에서 `Origin: https://evil.example`, `Origin: https://<preview>.vercel.app` | 403 |
| Preview 차단 | Preview 주소에서 로그인 시도 | 요청 없이 "미리보기 환경…" 문구 |

결과는 [브라우저 화면 확인](../verification/browser-check.md)처럼 검증 기록에 남깁니다.
