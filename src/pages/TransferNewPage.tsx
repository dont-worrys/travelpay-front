import { useEffect, useRef, useState, type FormEvent } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import { AmountPresets } from '../components/AmountPresets'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { isApiError, isOutcomeUnknown } from '../api'
import { useAuth } from '../features/auth/useAuth'
import { checkRecipient, createTransfer, type RecipientCheck, type TransferCreateInput } from '../features/transfer/api'
import { toTransferMessage } from '../features/transfer/status'
import { fetchMyBalances, type Balance } from '../features/wallet/api'
import { newIdempotencyKey } from '../lib/idempotency'
import { CURRENCIES, CURRENCY_INFO, formatAmount, parseAmount, type Currency } from '../lib/money'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MEMO_MAX = 100

type Step = 'form' | 'confirm'

/** 같은 본문으로 다시 보낼 때만 같은 멱등성 키를 쓰기 위해 본문과 키를 함께 기억한다. */
interface PendingRequest {
  fingerprint: string
  key: string
}

export function TransferNewPage() {
  const { state } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const myId = state.status === 'authenticated' ? state.me.userId : null

  const [receiverInput, setReceiverInput] = useState(searchParams.get('receiverId') ?? '')
  const [recipient, setRecipient] = useState<RecipientCheck | null>(null)
  const [recipientError, setRecipientError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const [currency, setCurrency] = useState<Currency>('KRW')
  const [amountInput, setAmountInput] = useState('')
  const [memo, setMemo] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [step, setStep] = useState<Step>('form')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 응답을 받지 못해 결과를 모르는 상태. 같은 내용으로 다시 보내면 중복 송금되지 않는다. */
  const [uncertain, setUncertain] = useState(false)
  const pending = useRef<PendingRequest | null>(null)
  /** 보낼 수 있는 금액 안내용. 실패하면 안내만 빼고 송금은 그대로 할 수 있다(최종 판단은 서버). */
  const [balances, setBalances] = useState<Balance[] | null>(null)
  const [noWallet, setNoWallet] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetchMyBalances(controller.signal)
      .then(setBalances)
      .catch((cause) => {
        if (isApiError(cause) && (cause.code === 'WALLET_NOT_FOUND' || cause.code === 'WALLET_NOT_ACTIVE')) {
          setNoWallet(true)
        }
      })
    return () => controller.abort()
  }, [])
  const available = balances?.find((item) => item.currency === currency)?.balance

  const receiverId = receiverInput.trim()
  const parsedAmount = parseAmount(amountInput, currency)

  function changeReceiver(value: string) {
    setReceiverInput(value)
    setRecipient(null)
    setRecipientError(null)
  }

  async function handleCheckRecipient() {
    setRecipient(null)
    setRecipientError(null)
    if (!UUID_PATTERN.test(receiverId)) {
      setRecipientError('회원 ID 형식이 아닙니다. 받는 분의 내 정보 화면에 있는 회원 ID를 입력해 주세요.')
      return
    }
    if (receiverId.toLowerCase() === myId?.toLowerCase()) {
      setRecipientError('본인에게는 송금할 수 없습니다.')
      return
    }
    setChecking(true)
    try {
      setRecipient(await checkRecipient(receiverId))
    } catch (cause) {
      setRecipientError(toTransferMessage(cause, '받는 분을 확인하지 못했습니다.'))
    } finally {
      setChecking(false)
    }
  }

  function buildInput(): TransferCreateInput | null {
    if (!recipient || !parsedAmount.ok) {
      return null
    }
    const trimmedMemo = memo.trim()
    return {
      receiverId: recipient.receiverId,
      amount: parsedAmount.minor,
      currency,
      ...(trimmedMemo ? { memo: trimmedMemo } : {}),
    }
  }

  function handleReview(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const errors: Record<string, string> = {}
    if (!parsedAmount.ok) {
      errors.amount = parsedAmount.message
    }
    if (memo.trim().length > MEMO_MAX) {
      errors.memo = `메모는 ${MEMO_MAX}자 이하로 입력해 주세요.`
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length === 0 && recipient?.transferable) {
      setStep('confirm')
    }
  }

  async function handleSend() {
    const input = buildInput()
    if (!input) {
      return
    }
    const fingerprint = JSON.stringify(input)
    if (pending.current?.fingerprint !== fingerprint) {
      pending.current = { fingerprint, key: newIdempotencyKey() }
    }

    setSubmitting(true)
    setError(null)
    try {
      const { data } = await createTransfer(input, pending.current.key)
      pending.current = null
      navigate(`/transfers/${data.transferId}`, { replace: true, state: { justSent: true } })
    } catch (cause) {
      if (isOutcomeUnknown(cause)) {
        // 서버가 처리했는지 알 수 없다. 키를 그대로 두어 같은 내용으로 다시 보내도 한 번만 처리되게 한다.
        setUncertain(true)
        setError(toTransferMessage(cause, '송금 결과를 확인하지 못했습니다.'))
        return
      }
      // 서버가 판단을 끝낸 응답(4xx)이다. 다음 송금은 새 키로 보낸다.
      pending.current = null
      setUncertain(false)
      if (isApiError(cause) && cause.details.length > 0) {
        setFieldErrors(cause.fieldMessages())
        setStep('form')
      }
      setError(toTransferMessage(cause, '송금하지 못했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  function backToForm() {
    setStep('form')
    setError(null)
  }

  if (step === 'confirm' && recipient && parsedAmount.ok) {
    return (
      <section>
        <div className="title-row">
          <h1>송금 확인</h1>
          <TransferSteps current={1} />
        </div>
        <dl className="info">
          <dt>받는 분</dt>
          <dd>
            {recipient.receiverName}
            <br />
            <code className="hint">{recipient.receiverId}</code>
          </dd>
          <dt>금액</dt>
          <dd className="amount">{formatAmount(parsedAmount.minor, currency)}</dd>
          <dt>수수료</dt>
          <dd>0원 (보내는 금액만 빠집니다)</dd>
          <dt>메모</dt>
          <dd>{memo.trim() || '-'}</dd>
        </dl>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {uncertain && (
          <p className="hint">
            송금이 이미 처리되었을 수 있습니다. 아래 <strong>다시 시도</strong>는 같은 요청으로 보내므로 두 번 송금되지
            않습니다. 내용을 바꾸면 새 송금으로 처리되니 먼저 <Link to="/transfers?direction=SENT">보낸 내역</Link>을
            확인해 주세요.
          </p>
        )}

        <div className="actions">
          <button type="button" className="secondary" onClick={backToForm} disabled={submitting}>
            수정
          </button>
          <button type="button" className="primary" onClick={handleSend} disabled={submitting}>
            {submitting ? '송금 중…' : uncertain ? '다시 시도' : '송금하기'}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="page-wide">
      <div className="title-row">
        <h1>송금하기</h1>
        <TransferSteps current={0} />
      </div>
      {noWallet && (
        <p className="error">
          송금하려면 지갑이 필요합니다. <Link to="/wallet">지갑 만들기</Link>
        </p>
      )}
      <div className="transfer-grid">
      <form className="form card" onSubmit={handleReview} noValidate>
        <label>
          받는 분 회원 ID
          <div className="input-row">
            <input
              value={receiverInput}
              onChange={(e) => changeReceiver(e.target.value)}
              placeholder="예: 4c6a0178-266b-4f1e-b811-a2767026be70"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="secondary"
              onClick={handleCheckRecipient}
              disabled={checking || !receiverId}
            >
              {checking ? '확인 중…' : '확인'}
            </button>
          </div>
          {recipientError && <span className="field-error">{recipientError}</span>}
          {fieldErrors.receiverId && <span className="field-error">{fieldErrors.receiverId}</span>}
          {recipient?.transferable && (
            <span className="recipient-check">
              <span>받는 분: {recipient.receiverName}</span> <StatusBadge label="송금 가능" tone="success" />
            </span>
          )}
          {recipient && !recipient.transferable && (
            <span className="field-error">{recipient.receiverName}님은 지금 송금을 받을 수 없습니다.</span>
          )}
        </label>

        <label>
          통화
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {CURRENCY_INFO[code].label}
              </option>
            ))}
          </select>
        </label>

        <label>
          금액
          <div className="amount-input">
            <input
              inputMode={CURRENCY_INFO[currency].decimals > 0 ? 'decimal' : 'numeric'}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0"
              autoComplete="off"
            />
            <span className="amount-input-code">{currency}</span>
          </div>
          {amountInput && parsedAmount.ok && (
            <span className="hint">{formatAmount(parsedAmount.minor, currency)}</span>
          )}
          {available !== undefined && (
            <span className="hint">
              보낼 수 있는 금액: {formatAmount(available, currency)}{' '}
              {currency === 'KRW' && <Link to="/wallet/charge">충전하기</Link>}
            </span>
          )}
          {available !== undefined && parsedAmount.ok && parsedAmount.minor > available && (
            <span className="field-error">잔액보다 큰 금액입니다.</span>
          )}
          {fieldErrors.amount && <span className="field-error">{fieldErrors.amount}</span>}
        </label>
        {currency === 'KRW' && <AmountPresets value={amountInput} onChange={setAmountInput} />}

        <label>
          메모 (선택)
          <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={MEMO_MAX} />
          <span className="hint">
            {memo.trim().length}/{MEMO_MAX}
          </span>
          {fieldErrors.memo && <span className="field-error">{fieldErrors.memo}</span>}
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!recipient && <p className="hint">받는 분 회원 ID를 입력하고 확인을 눌러 주세요.</p>}
        <button type="submit" disabled={!recipient?.transferable || !amountInput}>
          다음
        </button>
      </form>

      <aside className="card" aria-labelledby="transfer-summary">
        <div className="card-head">
          <h2 id="transfer-summary">송금 요약</h2>
        </div>
        <dl className="summary-list">
          <dt>보내는 금액</dt>
          <dd>{parsedAmount.ok ? formatAmount(parsedAmount.minor, currency) : '-'}</dd>
          <dt>수수료</dt>
          <dd>{formatAmount(0, currency)}</dd>
          <dt className="summary-total">총 출금 금액</dt>
          <dd className="summary-total">{parsedAmount.ok ? formatAmount(parsedAmount.minor, currency) : '-'}</dd>
        </dl>
        <p className="rate-meta">송금 수수료는 없어요. 보내는 금액만 지갑에서 빠집니다.</p>
      </aside>
      </div>
    </section>
  )
}


const TRANSFER_STEPS = ['정보 입력', '내용 확인', '완료']

/** 송금 단계 표시. 완료는 상세 화면 이동으로 대신하므로 이 화면에서는 앞의 두 단계만 현재가 된다. */
function TransferSteps({ current }: { current: number }) {
  return (
    <ol className="steps" aria-label="송금 단계">
      {TRANSFER_STEPS.map((label, index) => (
        <li
          key={label}
          className={index < current ? 'done' : undefined}
          aria-current={index === current ? 'step' : undefined}
        >
          {label}
        </li>
      ))}
    </ol>
  )
}
