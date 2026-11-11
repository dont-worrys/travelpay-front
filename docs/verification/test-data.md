# 로컬 검증 데이터

## 충전 보정 테스트 데이터 (2026-11-11)

관리자 충전 보정 화면에서 조치 4개를 하나씩 확인할 수 있게, 조치마다 `MANUAL_REVIEW` 충전 1건을 로컬에 만들어 두었습니다. 보정은 실행하지 않았습니다.

- 계정: 새로 가입한 일반회원 `charge-review-k8fl30@travelpay.local`(실명 유재석, 회원 `8fcca4a7-…`, 지갑 `50a31612-…`). 확인은 관리자 `admin-fe-1e1d1e@travelpay.local`로 합니다.
- 충전: 모두 5,000원, Mock 은행 시드 계좌 004/12340101234567. 재시도 5회 뒤 `RETRY_EXHAUSTED`로 `MANUAL_REVIEW`

| 조치 | 충전 ID | 은행 출금 | 은행 환불 | 원장 |
|---|---|---|---|---|
| 완료로 확정(`CONFIRM_COMPLETED`) | `bb780652-4a0f-47df-812d-097bc8234472` | `SUCCEEDED` | 없음 | `POSTED` |
| 실패로 확정(`CONFIRM_FAILED`) | `b00ce656-f927-4f95-8d52-55b2cd9f53f8` | 없음(확정) | 없음 | 없음 |
| 환불됨으로 확정(`CONFIRM_REFUNDED`) | `ca8e3608-3553-4d0e-b17d-a46a9b5e067f` | `SUCCEEDED` | `SUCCEEDED` | `REJECTED`(`WALLET_SUSPENDED`) |
| 은행 환불 단계로 재개(`RESUME_REFUND`) | `caf0ed20-71ce-44f7-ade6-66fcc6c3e470` | `SUCCEEDED` | 없음(확정) | `REJECTED`(`WALLET_SUSPENDED`) |

관리자 보정 미리보기(`GET /admin/charges/{id}/review`)로 확인한 결과, 4건 모두 `blockers`가 없고 `availableActions`는 표의 조치 하나뿐입니다. 은행 거래와 원장 거래는 실제 서비스가 기록했고, 금액과 거래 ID가 충전 기록과 일치합니다. 회원의 원장 KRW 잔액은 5,000(완료 확정 건이 원장에 반영됨)이고, 충전 내역에는 `MANUAL_REVIEW` 4건이 보입니다. 기존 `MANUAL_REVIEW` 충전 3건은 바꾸지 않았습니다.

만든 방법(재현):

1. Mock 은행·원장에는 원하는 결과를 만들 장애 주입 수단이 없어, wallet-service와 두 서비스 사이에 중계 프록시(Python, 로컬 전용)를 두었습니다. 프록시는 테스트 충전 요청(5,000원, 위 계좌·예금주)만 골라 처리하고, 나머지 요청은 그대로 통과시킵니다.
   - 실패 확정: 출금을 은행에 보내지 않고 503을 돌려줌
   - 완료 확정: 원장 등록은 원장에 보내 반영시키고, 응답만 503으로 바꿈
   - 환불됨 확정: 환불은 은행에 보내 처리시키고, 응답만 503으로 바꿈
   - 환불 단계 재개: 환불을 은행에 보내지 않고 503을 돌려줌
   - 지갑은 5xx를 결과 모름으로 보고 같은 요청 ID로 재시도하며, 5회째에 `MANUAL_REVIEW`가 됩니다(약 8분).
2. wallet-service를 `MOCK_BANK_URL`·`LEDGER_SERVICE_URL`만 프록시 주소로 바꿔 재기동했습니다(코드·설정 파일 변경 없음).
3. 새 회원을 Gateway로 가입시키고 지갑을 개설한 뒤, 완료 확정 → 실패 확정 순으로 충전했습니다.
4. 원장 거절은 계정이 정지됐을 때만 나서, 이 회원의 원장 KRW 계정 1행만 DB에서 `SUSPENDED`로 바꾼 뒤 환불 계열 2건을 충전했습니다. 원장 거절이 기록된 직후 `ACTIVE`로 되돌렸습니다.
5. 4건이 모두 `MANUAL_REVIEW`가 된 뒤 wallet-service를 원래 설정(`MOCK_BANK_URL=http://localhost:8090`)으로 재기동했습니다. "없음" 판정은 `MANUAL_REVIEW` 전환 10분 뒤부터 확정되므로, 그 뒤에 미리보기를 조회했습니다.

주의할 점:

- 보정을 실행하면 데이터가 바뀝니다. 다시 확인하려면 위 순서로 새로 만들어야 합니다.
- 자동 대사에서는 이 4건이 어긋남으로 잡힙니다.
- Mock 은행은 Eureka에 등록되지 않습니다. wallet-service를 `MOCK_BANK_URL` 없이 띄우면 은행 조회가 `UNAVAILABLE`이 되어, 보정 화면의 모든 조치가 "은행 출금 조회 불가"로 막힙니다.

## 관리자 브라우저 검증 데이터 (2026-11-11)

관리자 화면을 브라우저에서 확인할 수 있게 `MANUAL_REVIEW`, 지연 환불, 충전 대사 불일치 데이터를 로컬에 만들었습니다. 처리·보정은 하지 않았습니다.

- 계정: 새로 가입한 결제자 `admin-check-tgd9m3@travelpay.local`(실명 유재석, 시드 계좌로 50,000원 충전)과 가맹점 주인 `admin-check-bz73ec@travelpay.local`(박지현, 지갑 개설)을 썼습니다. 가맹점 `c576866b-37c1-45d2-8b00-afe0e86cd249`(KRW)는 관리자가 만들었습니다.

| 구분 | ID | 상태·사유 | 확인 경로 |
|---|---|---|---|
| 결제 | `9f52ff4f-08cf-4745-802f-ee4e5398d249`(2,000) | `MANUAL_REVIEW`, `RETRY_EXHAUSTED` | `/admin/reviews?kind=payment` |
| 환불 | `d7cefdef-aa59-4275-87b6-a47aed6aa73e`(결제 `ded16e09-…`, 1,000) | `MANUAL_REVIEW`, `LEDGER_REQUEST_NOT_ACCEPTED`(원장 409) | `/admin/reviews?kind=refund` |
| 정산 | `f1460d91-15e5-4c98-99f9-c95521b907d2`(3,000) | `MANUAL_REVIEW`, `LEDGER_REQUEST_NOT_ACCEPTED`(원장 400) | `/admin/reviews?kind=settlement` |
| 환전 | `cc64a330-5d7f-4679-b349-e7f44644d0d8`(KRW 10,000 → JPY) | `MANUAL_REVIEW`, `LEDGER_CONFLICT` | `/admin/reviews?kind=exchange` |
| 송금 | `c988f668-c6f0-4d16-930e-d8241d142503`(1,500) | `MANUAL_REVIEW`, `RETRY_EXHAUSTED`. 미리보기는 원장 기록 없음 → 확정 시 `PROCESSING` | `/admin/transfers/c988f668-…` |
| 지연 환불 | 결제 `4f95ea73-3263-47c0-9f17-ead828f9c79c`(4,000) | `REFUND_REQUESTED`, 결제·신청 시각 4.5일 전 | `/admin/refund-requests/overdue` |
| 대사: 출금 성공·적립 없음 | 충전 `251c36a8-8548-48ac-8cd1-2942908536b4`(9,000) | 충전 `FAILED`, 은행 출금 `SUCCEEDED` → `BANK_DEBIT_WITHOUT_CREDIT`(+`STATUS_MISMATCH`) | 실행 `9cd3ac67-…` |
| 대사: 금액 불일치 | 충전 `0b1f4b0d-f726-4124-a857-e34243388265`(7,000) | 충전 `COMPLETED`, 은행 출금 6,500 → `AMOUNT_MISMATCH` | 실행 `7c28add9-…` |
| 대사: 충전 없는 은행 거래 | 은행 요청 `8a7ae551-70f9-4dd2-8c72-57eaa3a81b7e`(8,000) | `BANK_ORPHAN` | 실행 `7c28add9-…` |

같은 대사 실행 `7c28add9-…`에는 충전 `cc9505bc-…`(6,000원, 은행 출금만 성공한 `MANUAL_REVIEW`)도 `REVIEW_REQUIRED`로 나옵니다. 대사 확인 경로는 `/admin/charges/reconciliations`입니다.

만든 방법(재현):

1. 위 [충전 보정 테스트 데이터](#충전-보정-테스트-데이터-2026-11-11) 절의 중계 프록시를 규칙 방식으로 넓혔습니다. 규칙을 하나 걸어 두면 다음에 오는 조건에 맞는 새 요청 1건(요청 종류·`referenceType`·금액으로 고름)에 적용되고, 그 요청의 재시도에도 같은 규칙이 적용됩니다.
   - 응답 503(보내지 않음): 결과 모름 → 재시도 5회 뒤 `RETRY_EXHAUSTED`(결제·송금 약 8분)
   - 응답 409·400(보내지 않음): 원장 요청 거절 → 바로 `MANUAL_REVIEW`(환불·정산·환전)
   - 출금 금액 변경: 은행에 6,500원으로 보냄(금액 불일치)
   - 출금 실패 위장: 은행에서는 출금이 성공하고, 지갑에는 `FAILED`(`INSUFFICIENT_BALANCE`) 응답을 줌(출금 성공·적립 없음)
2. 서비스는 원장·은행 주소만 프록시로 바꿔 재기동했습니다(코드·설정 파일 변경 없음).
   - payment-service: `LEDGER_SERVICE_URL`
   - exchange-service: `--exchange.ledger.url`(`EXCHANGE_RATE_MODE=mock`)
   - wallet-service: `MOCK_BANK_URL`·`LEDGER_SERVICE_URL`
3. 정산 대상과 지연 환불은 프록시를 켜기 전에 정상 결제로 만들었습니다. 그 뒤 새로 만든 이 결제 2건의 행만 DB에서 시각을 옮겼습니다.
   - 정산 대상 `3e7449ba-…`: 결제·이력 4일 전. 정산 대상 조건이 승인 후 3일 1시간이라서입니다.
   - 지연 환불: 결제·이력·`updated_at` 4.5일 전. 지연 기준이 `REFUND_REQUESTED`이고 `updated_at`이 3일 지난 것이라서입니다.
4. 충전 없는 은행 거래는 Mock 은행 출금 API(`POST :8090/internal/v1/bank/withdrawals`)를 새 요청 ID로 직접 호출해 만들었습니다.
5. 모두 만든 뒤 세 서비스를 원래 설정으로 재기동했습니다(wallet은 `MOCK_BANK_URL=http://localhost:8090`). 대사는 관리자 수동 실행(`POST /admin/charges/reconciliations?from=&to=`)으로 돌렸습니다. 기간은 1일 이하여야 하고, 끝은 지금보다 5분 이전이어야 합니다.

주의할 점:

- 대사 불일치 3건은 일부러 장부를 어긋나게 만든 것입니다. 9,000원 건은 Mock 은행에서만 빠졌고, 7,000원 건은 은행에서 6,500원만 빠졌는데 지갑에는 7,000원이 적립됐습니다. 모두 모의 거래입니다.
- `MANUAL_REVIEW` 건은 처리하면 다시 쓸 수 없습니다. 다시 확인하려면 위 순서로 새로 만들어야 합니다.
