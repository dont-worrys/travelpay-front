import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { isApiError, isOutcomeUnknown } from '../api'
import {
  fetchExchangeLimits,
  fetchExchangeRates,
  FOREIGN_CURRENCIES,
  issueQuote,
  placeExchange,
  type ExchangeLimit,
  type ExchangeQuote,
  type ExchangeType,
  type ForeignCurrency,
} from '../features/exchange/api'
import { formatFeeRate, PRE_QUOTE_FEE_RATE } from '../features/exchange/rateDisplay'
import { toExchangeMessage } from '../features/exchange/status'
import { fetchMyWallet, type Wallet } from '../features/wallet/api'
import { newIdempotencyKey } from '../lib/idempotency'
import {
  CURRENCY_INFO,
  formatAmount,
  formatDecimalText,
  formatMajorAmount,
  majorToMinor,
  parseAmount,
  toAmountInput,
  type Currency,
} from '../lib/money'
import { useAutoRefresh } from '../lib/useAutoRefresh'

type Step = 'form' | 'confirm'

/** 견적 하나는 한 번만 쓸 수 있으므로 견적마다 멱등성 키를 하나 둔다. */
interface PendingRequest {
  quoteId: string
  key: string
}

function isForeign(value: string | null): value is ForeignCurrency {
  return value === 'JPY' || value === 'CNY'
}

function loadRates(signal: AbortSignal) {
  return fetchExchangeRates(undefined, signal)
}

/** 남은 시간을 "4:59"처럼 표시한다. */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** 환전(원화 → 외화)·재환전(외화 → 원화). 금액 입력 → 견적 확인(5분 유효) → 신청. */
export function ExchangeNewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [type, setType] = useState<ExchangeType>(searchParams.get('type') === 'RE_EXCHANGE' ? 'RE_EXCHANGE' : 'EXCHANGE')
  const currencyParam = searchParams.get('currency')
  const [foreign, setForeign] = useState<ForeignCurrency>(isForeign(currencyParam) ? currencyParam : 'JPY')
  const [amountInput, setAmountInput] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)

  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [walletProblem, setWalletProblem] = useState<'none' | 'inactive' | null>(null)
  const [limits, setLimits] = useState<ExchangeLimit[] | null>(null)

  const [step, setStep] = useState<Step>('form')
  const [quote, setQuote] = useState<ExchangeQuote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 환전 신청 응답을 받지 못한 상태. 같은 키로 다시 보내면 한 번만 처리된다. */
  const [uncertain, setUncertain] = useState(false)
  const pending = useRef<PendingRequest | null>(null)
  /** 서버가 견적 만료·사용됨으로 거절한 상태. 화면 시계와 관계없이 새 견적을 받게 한다. */
  const [quoteRejected, setQuoteRejected] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const fromCurrency: Currency = type === 'EXCHANGE' ? 'KRW' : foreign
  const toCurrency: Currency = type === 'EXCHANGE' ? foreign : 'KRW'

  // 참고 환율은 견적 받기 전에만 5초마다 갱신한다. 견적 이후에는 견적 환율(5분 보장)만 보여 준다.
  // 안내용이라 실패하면 마지막 값을 두고, 처음부터 실패하면 표시만 뺀다(최종 판단은 견적·환전 API).
  const { data: rates, error: ratesError } = useAutoRefresh(loadRates, { enabled: step === 'form' })

  useEffect(() => {
    const controller = new AbortController()
    fetchMyWallet(controller.signal)
      .then((data) => {
        setWallet(data)
        setWalletProblem(data.status === 'ACTIVE' ? null : 'inactive')
      })
      .catch((cause) => {
        if (isApiError(cause) && cause.code === 'WALLET_NOT_FOUND') {
          setWalletProblem('none')
        }
      })
    // 한도는 안내용이라 실패하면 표시만 뺀다(최종 판단은 견적·환전 API).
    fetchExchangeLimits(controller.signal).then(setLimits, () => undefined)
    return () => controller.abort()
  }, [])

  // 견적 확인 화면에서 남은 시간을 1초마다 갱신한다.
  useEffect(() => {
    if (step !== 'confirm') {
      return
    }
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [step])

  const limit = limits?.find((item) => item.currency === fromCurrency)
  const minMinor = limit ? majorToMinor(limit.minAmount, fromCurrency) : null
  const maxMinor = limit ? majorToMinor(limit.maxAmount, fromCurrency) : null
  const availableMinor = limit?.availableAmount != null ? majorToMinor(limit.availableAmount, fromCurrency) : null
  const balanceMinor = limit?.balance != null ? majorToMinor(limit.balance, fromCurrency) : null
  const rate = rates?.find((item) => item.currency === foreign)
  const parsedAmount = parseAmount(amountInput, fromCurrency)

  function changeType(next: ExchangeType) {
    setType(next)
    setAmountInput('')
    setFieldError(null)
    setError(null)
  }

  async function handleQuote(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!parsedAmount.ok) {
      setFieldError(parsedAmount.message)
      return
    }
    if (minMinor !== null && parsedAmount.minor < minMinor) {
      setFieldError(`최소 ${formatAmount(minMinor, fromCurrency)}부터 환전할 수 있습니다.`)
      return
    }
    if (maxMinor !== null && parsedAmount.minor > maxMinor) {
      setFieldError(`한 번에 ${formatAmount(maxMinor, fromCurrency)}까지 환전할 수 있습니다.`)
      return
    }
    setFieldError(null)
    setQuoting(true)
    try {
      const issued = await issueQuote({
        fromCurrency,
        toCurrency,
        amount: toAmountInput(parsedAmount.minor, fromCurrency),
      })
      setQuote(issued)
      setQuoteRejected(false)
      setUncertain(false)
      pending.current = null
      setStep('confirm')
    } catch (cause) {
      if (isApiError(cause) && cause.code === 'EXCHANGE_INVALID_AMOUNT') {
        setFieldError(toExchangeMessage(cause, ''))
      } else {
        setError(toExchangeMessage(cause, '견적을 받지 못했습니다.'))
      }
    } finally {
      setQuoting(false)
    }
  }

  /** 같은 금액으로 견적을 새로 받는다(만료·사용된 견적을 대신할 때). */
  async function handleRequote() {
    if (!quote) {
      return
    }
    setQuoting(true)
    setError(null)
    try {
      const issued = await issueQuote({
        fromCurrency: quote.fromCurrency,
        toCurrency: quote.toCurrency,
        amount: quote.fromAmount,
      })
      setQuote(issued)
      setQuoteRejected(false)
      setUncertain(false)
      pending.current = null
    } catch (cause) {
      setError(toExchangeMessage(cause, '견적을 받지 못했습니다.'))
    } finally {
      setQuoting(false)
    }
  }

  async function handleExchange() {
    if (!quote || !wallet) {
      return
    }
    if (pending.current?.quoteId !== quote.quoteId) {
      pending.current = { quoteId: quote.quoteId, key: newIdempotencyKey() }
    }
    setSubmitting(true)
    setError(null)
    try {
      const { data } = await placeExchange(quote.quoteId, wallet.walletId, pending.current.key)
      pending.current = null
      navigate(`/exchanges/${data.orderId}`, { replace: true, state: { justExchanged: true } })
    } catch (cause) {
      if (isOutcomeUnknown(cause)) {
        // 처리됐는지 알 수 없다. 같은 키로 다시 보내면 서버가 견적을 다시 읽지 않고 처음 결과를 돌려준다.
        setUncertain(true)
        setError(toExchangeMessage(cause, '환전 결과를 확인하지 못했습니다.'))
        return
      }
      pending.current = null
      setUncertain(false)
      if (isApiError(cause) && (cause.code === 'EXCHANGE_QUOTE_EXPIRED' || cause.code === 'EXCHANGE_QUOTE_ALREADY_USED')) {
        setQuoteRejected(true)
      }
      setError(toExchangeMessage(cause, '환전하지 못했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  function backToForm() {
    setStep('form')
    setError(null)
    setUncertain(false)
    pending.current = null
  }

  if (step === 'confirm' && quote) {
    const remainingMs = new Date(quote.expiresAt).getTime() - now
    const expired = remainingMs <= 0 || quoteRejected
    const unitLabel = `${quote.rateUnit.toLocaleString('ko-KR')}${CURRENCY_INFO[quote.toCurrency === 'KRW' ? quote.fromCurrency : quote.toCurrency].unit}`
    return (
      <section>
        <h1>{type === 'EXCHANGE' ? '환전' : '재환전'} 확인</h1>
        <p className="amount-large">{formatMajorAmount(quote.toAmount, quote.toCurrency)}</p>
        <p className="hint">받을 금액</p>

        <dl className="info">
          <dt>보내는 금액</dt>
          <dd>{formatMajorAmount(quote.fromAmount, quote.fromCurrency)}</dd>
          <dt>수수료</dt>
          <dd>
            {formatMajorAmount(quote.feeAmount, quote.fromCurrency)} (수수료율 {formatFeeRate(quote.feeRate)})
          </dd>
          <dt>지갑에서 빠질 금액</dt>
          <dd className="amount">{formatMajorAmount(quote.totalDebitAmount, quote.fromCurrency)}</dd>
          <dt>적용 환율</dt>
          <dd>
            {unitLabel}당 {formatDecimalText(quote.appliedRate)}원 (기준일 {quote.rateDate})
          </dd>
          <dt>견적 유효 시간</dt>
          <dd>{remainingMs <= 0 ? '만료됨' : formatRemaining(remainingMs)}</dd>
        </dl>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {uncertain && (
          <p className="hint">
            환전이 이미 처리되었을 수 있습니다. <strong>다시 시도</strong>는 같은 요청으로 보내므로 두 번 환전되지
            않습니다(견적 시간이 지나도 됩니다). 새 견적으로 바꾸기 전에 <Link to="/exchanges">환전 내역</Link>을 먼저
            확인해 주세요.
          </p>
        )}
        {expired && !uncertain && <p className="hint">이 견적으로는 환전할 수 없습니다. 같은 금액으로 견적을 다시 받아 주세요.</p>}

        <div className="actions">
          <button type="button" className="secondary" onClick={backToForm} disabled={submitting || quoting}>
            수정
          </button>
          {uncertain ? (
            <button type="button" className="primary" onClick={handleExchange} disabled={submitting || !wallet}>
              {submitting ? '환전 중…' : '다시 시도'}
            </button>
          ) : expired ? (
            <button type="button" className="primary" onClick={handleRequote} disabled={quoting}>
              {quoting ? '견적 받는 중…' : '견적 다시 받기'}
            </button>
          ) : (
            <button type="button" className="primary" onClick={handleExchange} disabled={submitting || !wallet}>
              {submitting ? '환전 중…' : '환전하기'}
            </button>
          )}
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="title-row">
        <h1>환전하기</h1>
        <div className="actions inline">
          <Link to="/exchange-rates">환율 보기</Link>
          <Link to="/exchanges">환전 내역</Link>
          <Link to="/exchange-reservations/new">예약 환전</Link>
        </div>
      </div>

      {walletProblem === 'none' && (
        <p className="error">
          환전하려면 지갑이 필요합니다. <Link to="/wallet">지갑 만들기</Link>
        </p>
      )}
      {walletProblem === 'inactive' && (
        <p className="error">
          지금은 지갑을 사용할 수 없습니다. <Link to="/wallet">지갑 상태 보기</Link>
        </p>
      )}

      <div className="tabs" role="tablist">
        {(['EXCHANGE', 'RE_EXCHANGE'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={type === item}
            className={type === item ? 'tab active' : 'tab'}
            onClick={() => changeType(item)}
          >
            {item === 'EXCHANGE' ? '원화 → 외화' : '외화 → 원화'}
          </button>
        ))}
      </div>

      <form className="form" onSubmit={handleQuote} noValidate>
        <label>
          {type === 'EXCHANGE' ? '받을 외화' : '보낼 외화'}
          <select
            value={foreign}
            onChange={(e) => {
              setForeign(e.target.value as ForeignCurrency)
              setFieldError(null)
            }}
          >
            {FOREIGN_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {CURRENCY_INFO[code].label}
              </option>
            ))}
          </select>
          {rate && (
            <span className="hint">
              {rate.unit.toLocaleString('ko-KR')}
              {CURRENCY_INFO[foreign].unit}당 매매기준율 {formatDecimalText(rate.midRate)}원 (기준일 {rate.rateDate}),
              수수료 {formatFeeRate(PRE_QUOTE_FEE_RATE)}. 참고용이며 적용 환율은 견적에서 정해집니다.
            </span>
          )}
          {(rates || ratesError != null) && !rate && (
            <span className="hint">환율 정보를 불러오지 못했습니다. 견적에서 확인할 수 있습니다.</span>
          )}
        </label>

        <label>
          보내는 금액 ({CURRENCY_INFO[fromCurrency].label})
          <div className="input-row">
            <input
              inputMode={CURRENCY_INFO[fromCurrency].decimals > 0 ? 'decimal' : 'numeric'}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0"
              autoComplete="off"
            />
            <span>{CURRENCY_INFO[fromCurrency].unit}</span>
          </div>
          {amountInput && parsedAmount.ok && (
            <span className="hint">{formatAmount(parsedAmount.minor, fromCurrency)}</span>
          )}
          {minMinor !== null && maxMinor !== null && (
            <span className="hint">
              1회 {formatAmount(minMinor, fromCurrency)} ~ {formatAmount(maxMinor, fromCurrency)}, 수수료(
              {formatFeeRate(PRE_QUOTE_FEE_RATE)})는 보내는 통화로 따로 빠집니다.
            </span>
          )}
          {balanceMinor !== null && (
            <span className="hint">
              잔액 {formatAmount(balanceMinor, fromCurrency)}
              {availableMinor !== null && ` · 수수료 포함 최대 ${formatAmount(availableMinor, fromCurrency)}`}{' '}
              {availableMinor !== null && availableMinor > 0 && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setAmountInput(toAmountInput(availableMinor, fromCurrency))}
                >
                  최대
                </button>
              )}
              {fromCurrency === 'KRW' && <Link to="/wallet/charge">충전하기</Link>}
            </span>
          )}
          {availableMinor !== null && parsedAmount.ok && parsedAmount.minor > availableMinor && (
            <span className="field-error">수수료를 포함하면 잔액보다 큰 금액입니다.</span>
          )}
          {fieldError && <span className="field-error">{fieldError}</span>}
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={quoting || !amountInput || walletProblem !== null}>
          {quoting ? '견적 받는 중…' : '견적 받기'}
        </button>
      </form>
    </section>
  )
}
