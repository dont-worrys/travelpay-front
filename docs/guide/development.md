# 개발 가이드

## 폴더 구조

```text
src/
  main.tsx              진입점 (AuthProvider + RouterProvider)
  router.tsx            경로 정의. 로그인이 필요한 화면은 RequireAuth, 역할별 화면은 RequireRole 아래에 둔다
  index.css             전역 스타일(공통 클래스 + 화면별 구역, 색·글씨 크기·배율은 :root 변수, 규칙은 docs/convention/style.md)
  api/                  공통 요청 함수, CSRF, 오류 타입·문구
  components/           공통 레이아웃(AppLayout: 사이드바·상단 바·하단 탭바), 상태 배지(StatusBadge), 선 아이콘(Icon),
                        통화 배지(CurrencyMark), 금액 칩(AmountPresets), 거래내역 탭(HistoryTabs),
                        환율 티커(RateTicker)와 티커·홈이 함께 쓰는 환율(RatesProvider: 처음 1회 + 5분)
  features/auth/        로그인 상태, 인증 API, 로그인·역할(USER·MASTER) 경로 보호
  features/wallet/      지갑·잔액·충전 API, 충전 상태·은행 목록, 테스트 계좌
  features/transfer/    송금 API·상태
  features/payment/     결제·환불 신청 API·상태
  features/merchant/    가맹점 잔액·결제·환불 실행·정산 API, 최근 연 가맹점(localStorage),
                        환불 실행·거절 공통 UI(RefundActions, 가맹점·관리자 화면 공용), 결제 상세 조회 훅(useMerchantPayment)
  features/exchange/    환율·한도·견적·환전·예약 환전 API·상태, 전일 대비·수수료율 표시(rateDisplay)
  features/admin/       관리자 API(가맹점·MANUAL_REVIEW·송금·충전·대사·처리 기록·회원·약관), 처리 대기·처리 기록 화면용 변환
  lib/                  금액 변환(money), 멱등성 키(idempotency), 시각 표시(datetime), 주기 조회 훅(useAutoRefresh)
  pages/                화면 단위 컴포넌트
  test/                 테스트 도우미(fetch 모의, 메모리 라우터)
docs/
  guide/api-common.md   공통 API 규칙(응답 형식, 오류 코드, 세션·CSRF, 멱등성, CORS)
  convention/           브랜치·커밋·이슈·PR 규칙
```

기능별 API 명세와 오류 코드는 백엔드 `docs/guide/<서비스>.md`를 기준으로 합니다. 환전·예약 환전은 `exchange-service.md`와 맞춰 두었습니다. 관리자 충전 보정·대사처럼 가이드에 절이 없는 API는 해당 서비스의 컨트롤러·DTO 코드를 기준으로 했습니다.

## 개발 규칙 요약

자세한 내용은 [공통 API 규칙](api-common.md)을 봅니다.

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
| 환불 실행 | `paymentId`·`amount`가 같을 때(사유만 바뀌어도 같은 키). 가맹점·관리자(대리 실행·직접 환불) 공통 |
| 정산 요청 | 본문 없음. 결과를 모를 때만 같은 키 |
| 환전 | 같은 견적(`quoteId`)일 때. 결과를 모르는 동안은 새 견적을 받지 못하게 함 |
| 예약 환전 | 결과를 모를 때만 같은 키. 서버가 본문 전체(만료 시각 포함)를 비교하므로 제출 순간의 본문을 그대로 다시 보내고, 그동안 입력을 잠금 |
| 관리자 충전 보정 | 결과를 모를 때만 같은 키·같은 본문, 그동안 입력을 잠금. 판정 불가 409·조회 불가 503(`CHARGE_RESOLUTION_SOURCE_UNAVAILABLE`)은 키를 쓰지 않은 거절이라 다음은 새 키 |

관리자 `MANUAL_REVIEW` 처리(결제·환불·정산·환전)와 송금 확정은 `Idempotency-Key`를 받지 않습니다. 이미 처리된 건은 409라 두 번 반영되지 않고, 송금 확정은 같은 운영자·같은 본문 재요청에 현재 상태를 돌려줍니다.
