# Gateway 경유 E2E 검증 (2026-11-10)

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

## 발견한 문제와 원인

| 문제 | 원인 | 조치 |
|---|---|---|
| 환율·환전 경로 503 `COMMON_SERVICE_UNAVAILABLE` | exchange-service 미실행 | 서비스 실행. 프런트 수정 없음 |
| Gateway 기동 직후 약 40초 동안 503 | Gateway가 User보다 먼저 떠서 Eureka 목록이 갱신되기 전 | Eureka → User → 업무 서비스 → Gateway 순서로 기동하거나 1분 기다림 |
| exchange mock 모드 기동 실패(`defaultMidRates` 바인딩 오류) | 백엔드 `.env`의 `SPRING_CONFIG_NAME=application-prod`가 켜져 있어 운영 설정을 읽음 | 로컬은 `--spring.config.name=application --spring.profiles.active=default`로 실행 |
| 수출입은행 환율이 7일 지나면 견적 거절 | `koreaexim`은 평일 11~13시에만 수집 | 로컬 검증은 `EXCHANGE_RATE_MODE=mock` |
| 정산 요청이 대상 없음이 아니라 지갑 오류로 응답 | 서버가 주인 지갑을 대상 결제보다 먼저 확인(명세대로) | 가맹점 주인도 지갑을 개설해야 정산 가능. 프런트 안내 문구 있음 |

프런트 코드에서 고친 곳은 없습니다.

## 확인하지 못한 것

- 정산 실행(`PAID`): 결제 승인 후 3일 1시간이 지나야 대상이 생깁니다. 로컬에서는 대상 없음 응답까지만 확인했습니다.
- `MANUAL_REVIEW` 처리, 원장 장애 상황: 아래 [관리자 MANUAL_REVIEW 처리](#관리자-manual_review-처리) 절에서 원장을 내려 따로 확인했습니다. 은행 장애는 확인하지 않았습니다.
- 송금: 아래 [송금](#송금) 절에서 따로 확인했습니다.
- 화면 대조: 위 요청은 스크립트로 보냈고, 일반회원 화면은 [브라우저 화면 확인](browser-check.md) 절에서 따로 확인했습니다.

## 예약 환전

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
| 체결 주문의 `reservationId`(2026-11-11, 백엔드 #254 반영 뒤 새 회원으로 따로 확인) | KRW 7,000 예약 체결(주문 `COMPLETED`, 831엔) → 환전 내역(전체·`type`·`status` 필터)과 상세의 `reservationId`가 예약 ID. 직접 신청한 환전은 신청 응답·내역·상세 모두 `reservationId: null`. 체결 주문의 `quoteId`로 견적 조회는 404 `EXCHANGE_QUOTE_NOT_FOUND`. 잔액 KRW 50,000 → 37,880, JPY 0 → 1,424 |

발견한 문제와 원인:

| 문제 | 원인 | 조치 |
|---|---|---|
| 예약 경로 404 | 실행 중인 Gateway가 예약 라우트(`/api/v1/exchange-reservations/**`) 추가 전 빌드 | 백엔드 dev로 gateway·exchange-service 재빌드 |
| 재빌드 뒤에도 체결되지 않을 환경 | exchange-service가 `koreaexim` 모드로 떠 있어 환율이 평일 11~13시에만 수집됨 | `EXCHANGE_RATE_MODE=mock`, `--spring.config.name=application --spring.profiles.active=default`로 재기동 |
| 백엔드 `.env`를 `source`할 때 `MOCK_BANK_URL: command not found` | `MOCK_BANK_URL = "..."`처럼 `=` 양옆에 공백이 있어 값이 설정되지 않음 | `MOCK_BANK_URL="http://localhost:8090"`으로 고쳐야 함(개인 `.env`, 같은 방식으로 띄운 wallet은 Mock Bank 주소를 받지 못함) |

프런트 코드에서 고친 곳은 없습니다. 등록·목록·상세 화면은 [브라우저 화면 확인](browser-check.md) 절에서 확인했습니다. 확인하지 못한 것은 `koreaexim` 모드의 실제 수집 시각 체결과, 환전 내역·상세의 "예약 체결" 표시를 브라우저에서 보는 일입니다.

## 송금

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
- `PROCESSING`이 이어지는 경우와 `MANUAL_REVIEW`: 아래 [관리자 MANUAL_REVIEW 처리](#관리자-manual_review-처리) 절에서 확인했습니다(원장 중지 중 202 `PROCESSING` → 약 8분 뒤 `MANUAL_REVIEW` → 운영자 확정 → `COMPLETED`).
- 화면 대조: 요청은 스크립트로 보냈고, 송금 화면은 [브라우저 화면 확인](browser-check.md) 절에서 따로 확인했습니다.

## 관리자 자금 운영

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

- 송금 미리보기 성공·확정, 충전 보정 성공: 이 확인 때는 로컬에 데이터가 없었습니다. 이후 [관리자 MANUAL_REVIEW 처리](#관리자-manual_review-처리) 절에서 원장을 내려 만든 송금으로 미리보기 → 확정(기록 없음 → `PROCESSING`)을 확인했습니다. 원장 변경 409 → 다시 미리보기, 충전 같은 키 재전송은 컴포넌트 테스트로만 확인했습니다.
- 처리 기록·지연 환불 신청이 있는 화면: 로컬 데이터가 0건이라 목록이 빈 경우만 확인했습니다.
- 화면 대조: 요청은 스크립트로 보냈습니다. 관리자 계정으로 화면을 열어 확인하는 일은 따로 해야 합니다.

## 관리자 회원·약관

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

## 관리자 MANUAL_REVIEW 처리

원장(ledger-service)을 약 10분 내려 실제 `MANUAL_REVIEW` 데이터를 만들고, 원장을 다시 띄운 뒤 관리자 API로 처리했습니다. 관리자·가맹점 주인 계정과 새로 가입한 결제자(충전용 Mock 은행 시드 계좌 예금주와 같은 이름)·수취인 1명씩을 썼습니다.

| 구분 | 확인 내용 | 결과 |
|---|---|---|
| 원장 중지 중 요청 | 결제 201 `PENDING`(같은 키 재요청 같은 결제), 가맹점 환불 실행 200(결제 `REFUND_PENDING`·환불 `REQUESTED`), 송금 202 `PROCESSING`, 충전 202. 환전은 주문을 만들지 않고 503 `EXCHANGE_LEDGER_UNAVAILABLE`, 잔액 조회 503 `WALLET_LEDGER_UNAVAILABLE` | 예상대로 |
| `MANUAL_REVIEW` 전환 | 결제·환불·송금은 결과 모름 5회 뒤 약 7분 56초, 충전은 약 7분 32초에 `MANUAL_REVIEW`. 결제·환불·송금 `reviewReason` `RETRY_EXHAUSTED`. 관리자 목록 4종에 모두 표시 | 예상대로 |
| 원장 조회 실패 | 결제·환불 상세 200 `ledgerLookupFailed: true`·`expected: null`, 처리 503 `PAYMENT_LEDGER_LOOKUP_UNAVAILABLE`. 송금 미리보기 503. 충전 확인 200 `blockers: ["원장 조회 불가"]`·가능한 조치 없음. 거절 뒤 상태는 모두 `MANUAL_REVIEW` 그대로 | 예상대로 |
| 결제 | 원장 기록 없음(`NOT_FOUND`) → 예상 `DECLINED`, 처리 200 `DECLINED`, 다시 처리 409 `PAYMENT_NOT_MANUAL_REVIEW`. 결제자 조회에 거절 사유 "결제 처리 시간이 초과되어 취소되었습니다." 처리 기록 1건 | 예상대로 |
| 환불 | 원장 기록 없음 → 예상 `REQUESTED`(재시도), 처리 200 → 스케줄러 재전송으로 환불 `COMPLETED`·결제 `REFUNDED`. 결제 ID로 처리 기록 조회 시 환불 기록 포함 | 예상대로 |
| 송금 | 미리보기 `found: false`·`expectedStatus: PROCESSING`, 확정 200 `PROCESSING`, 같은 본문 재확정 200, 재전송으로 `COMPLETED`. 이력에 운영자 확정(`MANUAL_REVIEW` → `PROCESSING`, 사유·운영자 ID) | 예상대로 |
| 충전 | 원장 재기동 뒤 확인: 은행 출금 `SUCCEEDED`, 원장 `NOT_FOUND`. 원장 없음은 전환 10분 뒤(`notFoundConfirmedAt`)부터 확정으로 보아 그 전에는 5개 조치 모두 이유와 함께 불가 | 예상대로. 보정 실행은 미검증(아래) |
| 잔액 | 결제자 97,000 → 98,000(결제 거절 0, 환불 +3,000, 송금 −2,000), 수취인 0 → 2,000. 충전 5,000은 이 시점에 보정하지 않아 미반영(은행 출금만 성공, 충전 `MANUAL_REVIEW`). 2026-11-11 보정 뒤 결제자 103,000(아래) | 일치 |
| 충전 보정 실행 | 2026-11-11 11:03 KST 관리자 계정으로 `RESUME_CREDIT` 처리 → 충전 `CREDIT_PROCESSING` → `COMPLETED`, 결제자 원장 KRW 잔액 98,000 → 103,000 | 예상대로 |

같은 건 재처리는 처리 뒤 다시 보내는 방식으로 확인했습니다(동시에 보내는 경쟁 상황은 만들지 않음). 확인하지 못한 것:

- 송금 `TRANSFER_RESOLUTION_MISMATCH`: 미리보기와 다른 값으로 `FAILED` 확정을 보냈으나 원장 거래 ID가 없어 형식 검사 400 `COMMON_INVALID_REQUEST`가 먼저 났습니다. 송금이 이미 처리돼 다시 만들려면 원장을 또 내려야 해서 컴포넌트 테스트 확인으로 둡니다.
- 정산 `MANUAL_REVIEW`: 승인 후 3일 1시간이 지나야 정산 대상이 생겨 로컬에서 만들 수 없습니다.
- 환전 `MANUAL_REVIEW`: 원장 장애 때는 지갑이 잔액을 못 읽어 주문을 만들지 않고, 처리 중 주문이 `MANUAL_REVIEW`가 되려면 24시간이 지나거나 원장이 400·409를 돌려줘야 합니다.
- 원장 반영(`POSTED`) 경로(결제 승인 확정, 송금 `COMPLETED` 확정, 충전 `CONFIRM_COMPLETED`): 원장에 반영된 뒤 응답만 사라지는 상황이 필요해 원장 중지로는 만들 수 없습니다.
- 충전 보정의 나머지 조치 4개(`CONFIRM_COMPLETED`·`CONFIRM_FAILED`·`CONFIRM_REFUNDED`·`RESUME_REFUND`)는 원장 중지로 만들 수 없었습니다. [충전 보정 테스트 데이터](test-data.md#충전-보정-테스트-데이터-2026-11-11) 절에서 조치별 데이터를 따로 만들었고, 실행은 아직 하지 않았습니다.
- 위 항목은 컴포넌트 테스트(`AdminReviewDetailPage`, 관리자 자금 운영 테스트)로만 확인했습니다.
