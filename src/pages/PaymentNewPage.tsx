import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { isApiError, isOutcomeUnknown } from '../api'
import { createPayment, type PaymentCreateInput } from '../features/payment/api'
import { toPaymentMessage } from '../features/payment/status'
import { fetchMyBalances, type Balance } from '../features/wallet/api'
import { newIdempotencyKey } from '../lib/idempotency'
import { CURRENCIES, CURRENCY_INFO, formatAmount, isCurrency, parseAmount, type Currency } from '../lib/money'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAYMENT_INFO_MAX = 255

type Step = 'form' | 'confirm'

/** 같은 본문으로 다시 보낼 때만 같은 멱등성 키를 쓰기 위해 본문과 키를 함께 기억한다. */
interface PendingRequest {
  fingerprint: string
  key: string
}

/**
 * 결제하기. 가맹점이 알려 준 가맹점 ID로 결제한다.
 * `?merchantId=&currency=&amount=&paymentInfo=`로 값을 미리 채울 수 있다(가맹점 결제 링크·QR).
 */
export function PaymentNewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [merchantInput, setMerchantInput] = useState(searchParams.get('merchantId') ?? '')
  const currencyParam = searchParams.get('currency') ?? ''
  const [currency, setCurrency] = useState<Currency>(isCurrency(currencyParam) ? currencyParam : 'KRW')
  const [amountInput, setAmountInput] = useState(searchParams.get('amount') ?? '')
  const [paymentInfo, setPaymentInfo] = useState(searchParams.get('paymentInfo') ?? '')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [step, setStep] = useState<Step>('form')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 응답을 받지 못해 결과를 모르는 상태. 같은 내용으로 다시 보내면 중복 결제되지 않는다. */
  const [uncertain, setUncertain] = useState(false)
  const pending = useRef<PendingRequest | null>(null)
  /** 결제할 수 있는 금액 안내용. 실패하면 안내만 빼고 결제는 그대로 할 수 있다(최종 판단은 서버). */
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

  const merchantId = merchantInput.trim()
  const parsedAmount = parseAmount(amountInput, currency)

  function buildInput(): PaymentCreateInput | null {
    if (!UUID_PATTERN.test(merchantId) || !parsedAmount.ok) {
      return null
    }
    const info = paymentInfo.trim()
    return {
      merchantId,
      currency,
      amount: parsedAmount.minor,
      ...(info ? { paymentInfo: info } : {}),
    }
  }

  function handleReview(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const errors: Record<string, string> = {}
    if (!UUID_PATTERN.test(merchantId)) {
      errors.merchantId = '가맹점 ID 형식이 아닙니다. 가맹점이 알려 준 ID를 그대로 입력해 주세요.'
    }
    if (!parsedAmount.ok) {
      errors.amount = parsedAmount.message
    }
    if (paymentInfo.trim().length > PAYMENT_INFO_MAX) {
      errors.paymentInfo = `결제 내용은 ${PAYMENT_INFO_MAX}자 이하로 입력해 주세요.`
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length === 0) {
      setStep('confirm')
    }
  }

  async function handlePay() {
    const input = buildInput()
    if (!input) {
      return
    }
    // 서버는 merchantId·currency·amount로 같은 요청인지 본다. 결제 내용만 고쳐 다시 보내도 같은 키를 써야 두 번 결제되지 않는다.
    const fingerprint = JSON.stringify([input.merchantId.toLowerCase(), input.currency, input.amount])
    if (pending.current?.fingerprint !== fingerprint) {
      pending.current = { fingerprint, key: newIdempotencyKey() }
    }

    setSubmitting(true)
    setError(null)
    try {
      const { data } = await createPayment(input, pending.current.key)
      pending.current = null
      navigate(`/payments/${data.paymentId}`, { replace: true, state: { justPaid: true } })
    } catch (cause) {
      if (isOutcomeUnknown(cause)) {
        // 서버가 처리했는지 알 수 없다. 키를 그대로 두어 같은 내용으로 다시 보내도 한 번만 처리되게 한다.
        setUncertain(true)
        setError(toPaymentMessage(cause, '결제 결과를 확인하지 못했습니다.'))
        return
      }
      // 서버가 판단을 끝낸 응답(4xx)이다. 다음 결제는 새 키로 보낸다.
      pending.current = null
      setUncertain(false)
      if (isApiError(cause)) {
        if (cause.code === 'PAYMENT_CURRENCY_MISMATCH') {
          setFieldErrors({ currency: toPaymentMessage(cause, '') })
          setStep('form')
        } else if (cause.code === 'PAYMENT_MERCHANT_NOT_FOUND' || cause.code === 'PAYMENT_MERCHANT_NOT_ACTIVE') {
          setFieldErrors({ merchantId: toPaymentMessage(cause, '') })
          setStep('form')
        } else if (cause.code === 'COMMON_INVALID_REQUEST' && cause.details.length > 0) {
          setFieldErrors(cause.fieldMessages())
          setStep('form')
        }
      }
      setError(toPaymentMessage(cause, '결제하지 못했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  function backToForm() {
    setStep('form')
    setError(null)
  }

  if (step === 'confirm' && parsedAmount.ok) {
    return (
      <section>
        <h1>결제 확인</h1>
        <dl className="info">
          <dt>가맹점 ID</dt>
          <dd>
            <code>{merchantId}</code>
          </dd>
          <dt>금액</dt>
          <dd className="amount">{formatAmount(parsedAmount.minor, currency)}</dd>
          <dt>결제 내용</dt>
          <dd>{paymentInfo.trim() || '-'}</dd>
        </dl>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {uncertain && (
          <p className="hint">
            결제가 이미 처리되었을 수 있습니다. 아래 <strong>다시 시도</strong>는 같은 요청으로 보내므로 두 번 결제되지
            않습니다. 가맹점·통화·금액을 바꾸면 새 결제로 처리되니 먼저 <Link to="/payments">결제 내역</Link>을 확인해
            주세요.
          </p>
        )}

        <div className="actions">
          <button type="button" className="secondary" onClick={backToForm} disabled={submitting}>
            수정
          </button>
          <button type="button" className="primary" onClick={handlePay} disabled={submitting}>
            {submitting ? '결제 중…' : uncertain ? '다시 시도' : '결제하기'}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h1>결제하기</h1>
      {noWallet && (
        <p className="error">
          결제하려면 지갑이 필요합니다. <Link to="/wallet">지갑 만들기</Link>
        </p>
      )}
      <form className="form" onSubmit={handleReview} noValidate>
        <label>
          가맹점 ID
          <input
            value={merchantInput}
            onChange={(e) => setMerchantInput(e.target.value)}
            placeholder="예: 9b2f3c1e-8a47-4d55-b0c2-7e1f6a9d3b10"
            autoComplete="off"
            spellCheck={false}
          />
          {fieldErrors.merchantId && <span className="field-error">{fieldErrors.merchantId}</span>}
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
          <span className="hint">가맹점이 받는 통화로만 결제할 수 있습니다.</span>
          {fieldErrors.currency && <span className="field-error">{fieldErrors.currency}</span>}
        </label>

        <label>
          금액
          <div className="input-row">
            <input
              inputMode={CURRENCY_INFO[currency].decimals > 0 ? 'decimal' : 'numeric'}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0"
              autoComplete="off"
            />
            <span>{CURRENCY_INFO[currency].unit}</span>
          </div>
          {amountInput && parsedAmount.ok && (
            <span className="hint">{formatAmount(parsedAmount.minor, currency)}</span>
          )}
          {available !== undefined && (
            <span className="hint">
              결제할 수 있는 금액: {formatAmount(available, currency)}{' '}
              {currency === 'KRW' && <Link to="/wallet/charge">충전하기</Link>}
            </span>
          )}
          {available !== undefined && parsedAmount.ok && parsedAmount.minor > available && (
            <span className="field-error">잔액보다 큰 금액입니다.</span>
          )}
          {fieldErrors.amount && <span className="field-error">{fieldErrors.amount}</span>}
        </label>

        <label>
          결제 내용 (선택)
          <input
            value={paymentInfo}
            onChange={(e) => setPaymentInfo(e.target.value)}
            maxLength={PAYMENT_INFO_MAX}
            placeholder="예: 아메리카노 2잔"
          />
          <span className="hint">
            {paymentInfo.trim().length}/{PAYMENT_INFO_MAX}
          </span>
          {fieldErrors.paymentInfo && <span className="field-error">{fieldErrors.paymentInfo}</span>}
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={!merchantId || !amountInput}>
          다음
        </button>
      </form>
    </section>
  )
}
