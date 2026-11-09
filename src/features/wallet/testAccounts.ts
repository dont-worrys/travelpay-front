/**
 * 로컬 Mock Bank 시드 계좌(백엔드 mock-bank `V3__seed_mock_bank_accounts.sql`). 실제 은행 계좌가 아니다.
 * Mock Bank는 계좌 예금주와 회원 실명이 정확히 같아야 출금하므로, 테스트 회원은 예금주 이름으로 가입한다.
 *
 * 개발 서버(`npm run dev`)에서만 보이고, 시연 배포처럼 필요할 때는 `VITE_SHOW_TEST_ACCOUNTS=true`로 켠다.
 * 시드 계좌가 바뀌면 이 목록도 함께 고친다.
 */
export interface TestAccount {
  bankCode: string
  accountNumber: string
  holder: string
  /** 버튼에 보여 줄 결과 설명. */
  outcome: string
}

export const SHOW_TEST_ACCOUNTS: boolean =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_TEST_ACCOUNTS === 'true'

// 표시하지 않는 빌드에서는 빈 배열이 되어 계좌번호가 번들에 남지 않는다.
export const TEST_ACCOUNTS: TestAccount[] = !SHOW_TEST_ACCOUNTS
  ? []
  : [
      { bankCode: '004', accountNumber: '12340101234567', holder: '유재석', outcome: '성공' },
      { bankCode: '088', accountNumber: '110123456789', holder: '박지현', outcome: '성공' },
      { bankCode: '020', accountNumber: '1002123456789', holder: '유재석', outcome: '5,000원 초과 시 잔액 부족' },
      { bankCode: '011', accountNumber: '3021234567891', holder: '유재석', outcome: '정지 계좌' },
    ]
