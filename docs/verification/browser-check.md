# 브라우저 화면 확인

개발 서버(`localhost:5173` → Gateway)를 띄워 [화면 목록](../guide/screens.md)의 일반회원 화면(가입·로그인·내 정보·비밀번호 변경·지갑·충전·송금·결제·가맹점 관리·환율·환전·예약 환전)을 브라우저에서 직접 조작해 확인했습니다(2026-11-10).

- 환전 내역·상세의 "예약 체결" 표시는 그 뒤에 추가돼 아직 브라우저로 확인하지 않았습니다(컴포넌트 테스트와 Gateway 응답으로 확인).
- 관리자(`/admin/**`)의 처리 동작(보정·환불·정지·약관 등록 등)은 아직 브라우저로 확인하지 않았습니다(목록 화면 표시는 2026-11-13 확인, 아래 스크린샷). 관리자 기능은 [Gateway 경유 E2E](gateway-e2e.md)의 요청과 컴포넌트 테스트로만 확인한 상태입니다(충전 보정 `RESUME_CREDIT` 1건은 2026-11-11 처리 완료). 확인용 데이터는 [충전 보정 테스트 데이터](test-data.md#충전-보정-테스트-데이터-2026-11-11)·[관리자 브라우저 검증 데이터](test-data.md#관리자-브라우저-검증-데이터-2026-11-11) 절에 있습니다.
- 2026-11-12에 추가한 화면·동작은 컴포넌트 테스트로만 확인했고 브라우저·Gateway로는 아직 확인하지 않았습니다: 환율 5초 갱신·전일 대비 색·견적 전후 수수료 표시(#42, 전일 대비는 백엔드 #274 배포 반영도 함께 확인), 관리자 지연 환불 대리 실행·거절·직접 환불과 가맹점 결제 조회(#43), 충전 보정 재개 안내·충전 목록 회원 복사·필터·대사 안내(#44).
- 송금 실패 사유 안내(#49)는 컴포넌트 테스트·빌드로만 확인했습니다. 스타일 #45는 #54로 대체됐습니다.
- 디자인 재작업(#54: 네이비 헤더·서랍·하단 탭바, 홈·지갑·충전·송금·환율·환전 화면, 매매기준율 표시)과 라우트 코드 스플리팅(#55: 화면 이동·직접 URL 접근·새로고침, 화면별 청크 로딩)은 2026-11-13 사용자가 브라우저로 확인했고 문제 보고는 없었습니다. 배포 직후 이전 청크를 못 받는 경우는 로컬에서 재현하지 않았습니다([배포 가이드](../guide/deployment.md#spa-새로고침-verceljson)).
- 정산 실행(`PAID`)처럼 로컬에서 만들 수 없는 상태는 화면에서도 확인하지 못했습니다([확인하지 못한 것](gateway-e2e.md#확인하지-못한-것) 참고).
- 화면 대조: 요청은 스크립트로 보냈습니다. 같은 계정으로 송금 화면을 열어 [송금 E2E](gateway-e2e.md#송금)의 상태·잔액이 그대로 보이는지는 따로 확인해야 합니다.
- 2026-11-13: 아래 [화면 스크린샷](#화면-스크린샷-2026-11-13)처럼 로그인 전 화면 4개, 일반회원 화면 8개, 관리자 화면 4개(대시보드·충전 관리·회원 관리·약관 관리)가 로컬 Gateway 데이터로 뜨는 것을 확인했습니다. 관리자 화면은 목록 표시까지만 확인했고 정지·보정·약관 등록 같은 처리 동작은 브라우저로 확인하지 않았습니다.
- 2026-11-13(#60, 헤드리스 Chrome 1280·375px, 로컬 Gateway): 지갑(보유 통화·최근 충전, 375px 하단 탭바), 송금 내역 보낸·받은 탭, 보낸 송금 상세(`-`·같은 분에게 또 보내기)·받은 송금 상세(`+`·완료)를 확인했고 송금 상세에 취소 버튼이 없습니다(백엔드 취소 API 제거). 정산 입금 내역(`/wallet/settlements`)과 지갑 "최근 정산 입금" 카드는 로컬 payment-service가 `/settlements/me`(백엔드 #318) 이전 빌드라 404로 확인하지 못했습니다(화면은 "요청한 대상을 찾을 수 없습니다" 안내, 지갑 카드는 숨김).

## 화면 스크린샷 (2026-11-13)

로컬 개발 서버(`localhost:5173` → 로컬 Gateway), 데스크톱 너비에서 찍었습니다. 금액·내역은 로컬 테스트 데이터입니다. 파일은 [`screenshots/`](screenshots/)에 있습니다.

### 로그인 전

| 화면 | 경로 | 스크린샷 |
|---|---|---|
| 첫 화면 | `/` | [01-landing](screenshots/01-landing.jpg) |
| 환율 | `/exchange-rates` | [02-exchange-rates](screenshots/02-exchange-rates.jpg) |
| 로그인 | `/login` | [03-login](screenshots/03-login.jpg) |
| 회원가입 | `/signup` | [04-signup](screenshots/04-signup.jpg) |

### 일반회원

| 화면 | 경로 | 스크린샷 |
|---|---|---|
| 홈 | `/` | [05-home](screenshots/05-home.jpg) |
| 내 지갑 | `/wallet` | [06-wallet](screenshots/06-wallet.jpg) |
| 송금하기 | `/transfers/new` | [07-transfer-new](screenshots/07-transfer-new.jpg) |
| 송금 내역 | `/transfers` | [08-transfers](screenshots/08-transfers.jpg) |
| 환전하기 | `/exchange` | [09-exchange](screenshots/09-exchange.jpg) |
| 예약 환전 내역 | `/exchange-reservations` | [10-exchange-reservations](screenshots/10-exchange-reservations.jpg) |
| 결제하기 | `/payments/new` | [11-payment-new](screenshots/11-payment-new.jpg) |
| 가맹점 관리 | `/merchant` | [12-merchant](screenshots/12-merchant.jpg) |

### 관리자 (`MASTER`)

| 화면 | 경로 | 스크린샷 |
|---|---|---|
| 관리자 대시보드 | `/admin` | [13-admin-dashboard](screenshots/13-admin-dashboard.jpg) |
| 충전 관리 | `/admin/charges` | [14-admin-charges](screenshots/14-admin-charges.jpg) |
| 회원 관리 | `/admin/users` | [15-admin-users](screenshots/15-admin-users.jpg) |
| 약관 관리 | `/admin/terms` | [16-admin-terms](screenshots/16-admin-terms.jpg) |
