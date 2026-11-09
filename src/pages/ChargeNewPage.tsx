import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { isApiError, isOutcomeUnknown } from '../api'
import { useAuth } from '../features/auth/useAuth'
import { createCharge, type ChargeCreateInput } from '../features/wallet/api'
import { BANKS, bankName, toWalletMessage } from '../features/wallet/status'
import { SHOW_TEST_ACCOUNTS, TEST_ACCOUNTS, type TestAccount } from '../features/wallet/testAccounts'
import { newIdempotencyKey } from '../lib/idempotency'
import { formatAmount, parseAmount } from '../lib/money'

const ACCOUNT_PATTERN = /^\d{10,20}$/

/** 같은 본문으로 다시 보낼 때만 같은 멱등성 키를 쓴다. */
interface PendingRequest {
  fingerprint: string
  key: string
}

export function ChargeNewPage() {
  const { state } = useAuth()
  const navigate = useNavigate()
  const realName = state.status === 'authenticated' ? state.me.realName : ''

  const [amountInput, setAmountInput] = useState('')
  const [bankCode, setBankCode] = useState(BANKS[0]?.code ?? '')
  const [accountInput, setAccountInput] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  /** 지갑이 없거나 사용할 수 없어 실패했는지. 지갑 화면으로 안내한다. */
  const [walletProblem, setWalletProblem] = useState(false)
  const pending = useRef<PendingRequest | null>(null)

  const parsedAmount = parseAmount(amountInput, 'KRW')
  const accountNumber = accountInput.replace(/[\s-]/g, '')

  const selectedTest = TEST_ACCOUNTS.find(
    (account) => account.bankCode === bankCode && account.accountNumber === accountNumber,
  )

  function fillTestAccount(account: TestAccount) {
    setBankCode(account.bankCode)
    setAccountInput(account.accountNumber)
    setFieldErrors({})
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const errors: Record<string, string> = {}
    if (!parsedAmount.ok) {
      errors.amount = parsedAmount.message
    }
    if (!ACCOUNT_PATTERN.test(accountNumber)) {
      errors.accountNumber = '계좌번호는 숫자 10~20자리로 입력해 주세요.'
    }
    setFieldErrors(errors)
    if (!parsedAmount.ok || Object.keys(errors).length > 0) {
      return
    }

    const input: ChargeCreateInput = { amount: parsedAmount.minor, currency: 'KRW', bankCode, accountNumber }
    const fingerprint = JSON.stringify(input)
    if (pending.current?.fingerprint !== fingerprint) {
      pending.current = { fingerprint, key: newIdempotencyKey() }
    }

    setSubmitting(true)
    setError(null)
    setWalletProblem(false)
    try {
      const { data } = await createCharge(input, pending.current.key)
      pending.current = null
      navigate(`/wallet/charges/${data.chargeId}`, { replace: true, state: { justRequested: true } })
    } catch (cause) {
      if (isOutcomeUnknown(cause)) {
        // 접수됐는지 알 수 없다. 키를 유지해 같은 내용으로 다시 보내면 한 번만 처리된다.
        setUncertain(true)
        setError(toWalletMessage(cause, '충전 요청 결과를 확인하지 못했습니다.'))
        return
      }
      pending.current = null
      setUncertain(false)
      if (isApiError(cause)) {
        setFieldErrors(cause.fieldMessages())
        setWalletProblem(cause.code === 'WALLET_NOT_FOUND' || cause.code === 'WALLET_NOT_ACTIVE')
      }
      setError(toWalletMessage(cause, '충전을 요청하지 못했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section>
      <h1>충전하기</h1>
      <p className="hint">
        내 은행 계좌에서 출금해 지갑에 원화(KRW)로 넣습니다. 계좌 예금주가 회원 이름({realName})과 같아야 합니다.
      </p>
      {SHOW_TEST_ACCOUNTS && (
        <div className="test-accounts">
          <p className="hint">
            <strong>테스트 계좌</strong> (Mock Bank 더미 데이터, 개발용) — 누르면 은행과 계좌번호가 채워집니다.
          </p>
          <div className="test-account-buttons">
            {TEST_ACCOUNTS.map((account) => (
              <button
                key={`${account.bankCode}-${account.accountNumber}`}
                type="button"
                className={selectedTest === account ? 'secondary selected' : 'secondary'}
                onClick={() => fillTestAccount(account)}
              >
                {account.holder} · {bankName(account.bankCode)}
                <span className="hint"> ({account.outcome})</span>
              </button>
            ))}
          </div>
          {selectedTest && selectedTest.holder !== realName && (
            <p className="field-error">
              예금주({selectedTest.holder})가 회원 이름({realName})과 달라 예금주 불일치로 실패합니다. 이 계좌로
              성공하려면 {selectedTest.holder} 이름으로 가입한 회원으로 로그인하세요.
            </p>
          )}
        </div>
      )}
      <form className="form" onSubmit={handleSubmit} noValidate>
        <label>
          금액
          <div className="input-row">
            <input
              inputMode="numeric"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0"
              autoComplete="off"
            />
            <span>원</span>
          </div>
          {amountInput && parsedAmount.ok && <span className="hint">{formatAmount(parsedAmount.minor, 'KRW')}</span>}
          {fieldErrors.amount && <span className="field-error">{fieldErrors.amount}</span>}
        </label>

        <label>
          은행
          <select value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
            {BANKS.map((bank) => (
              <option key={bank.code} value={bank.code}>
                {bank.name} ({bank.code})
              </option>
            ))}
          </select>
          {fieldErrors.bankCode && <span className="field-error">{fieldErrors.bankCode}</span>}
        </label>

        <label>
          계좌번호
          <input
            inputMode="numeric"
            value={accountInput}
            onChange={(e) => setAccountInput(e.target.value)}
            placeholder="숫자만 입력 (- 없이)"
            autoComplete="off"
          />
          {fieldErrors.accountNumber && <span className="field-error">{fieldErrors.accountNumber}</span>}
        </label>

        {error && (
          <p className="error" role="alert">
            {error} {walletProblem && <Link to="/wallet">지갑으로 이동</Link>}
          </p>
        )}
        {uncertain && (
          <p className="hint">
            충전이 이미 접수되었을 수 있습니다. 아래 <strong>다시 시도</strong>는 같은 요청으로 보내므로 두 번 출금되지
            않습니다. 내용을 바꾸면 새 충전으로 처리되니 먼저 <Link to="/wallet/charges">충전 내역</Link>을 확인해 주세요.
          </p>
        )}
        <button type="submit" disabled={submitting || !amountInput || !accountInput}>
          {submitting
            ? '요청 중…'
            : uncertain
              ? '다시 시도'
              : parsedAmount.ok
                ? `${bankName(bankCode)}에서 ${formatAmount(parsedAmount.minor, 'KRW')} 충전`
                : '충전하기'}
        </button>
      </form>
    </section>
  )
}
