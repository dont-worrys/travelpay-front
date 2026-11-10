import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { isApiError, isOutcomeUnknown } from '../api'
import {
  createReservation,
  fetchExchangeLimits,
  fetchExchangeRates,
  FOREIGN_CURRENCIES,
  type ExchangeLimit,
  type ExchangeRate,
  type ExchangeType,
  type ForeignCurrency,
  type ReservationInput,
} from '../features/exchange/api'
import { reservationTriggerText, toExchangeMessage } from '../features/exchange/status'
import { fetchMyWallet, type Wallet } from '../features/wallet/api'
import { formatDateTime } from '../lib/datetime'
import { newIdempotencyKey } from '../lib/idempotency'
import {
  compareDecimalText,
  CURRENCY_INFO,
  formatAmount,
  formatDecimalText,
  majorToMinor,
  parseAmount,
  parseRate,
  toAmountInput,
  type Currency,
} from '../lib/money'

const DAY_MS = 24 * 60 * 60 * 1000
const RESERVATION_PERIOD_DAYS = [1, 3, 7, 30] as const
type PeriodDays = (typeof RESERVATION_PERIOD_DAYS)[number]
/**
 * 서버는 "지금부터 30일 이내"를 서버 시각으로 판단한다. 기기 시계가 조금 앞서도 30일이 거절되지 않게
 * 최대 기간을 고르면 1시간 일찍 만료한다(화면에 실제 만료 시각을 보여 준다).
 */
const MAX_PERIOD_MARGIN_MS = 60 * 60 * 1000

function expiryFrom(now: number, days: PeriodDays): Date {
  const margin = days === 30 ? MAX_PERIOD_MARGIN_MS : 0
  return new Date(now + days * DAY_MS - margin)
}

function isForeign(value: string | null): value is ForeignCurrency {
  return value === 'JPY' || value === 'CNY'
}

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

/** 응답을 받지 못한 예약 요청. 다시 보낼 때는 키와 본문(만료 시각 포함)을 그대로 쓴다. */
interface PendingReservation {
  input: ReservationInput
  key: string
}

/** 예약 환전 등록. 목표 매매기준율과 만료 기간을 정하면, 환율이 닿았을 때 서버가 환전한다. */
export function ExchangeReservationNewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [type, setType] = useState<ExchangeType>(searchParams.get('type') === 'RE_EXCHANGE' ? 'RE_EXCHANGE' : 'EXCHANGE')
  const currencyParam = searchParams.get('currency')
  const [foreign, setForeign] = useState<ForeignCurrency>(isForeign(currencyParam) ? currencyParam : 'JPY')
  const [amountInput, setAmountInput] = useState('')
  const [rateInput, setRateInput] = useState('')
  const [periodDays, setPeriodDays] = useState<PeriodDays>(7)
  const [amountError, setAmountError] = useState<string | null>(null)
  const [rateError, setRateError] = useState<string | null>(null)

  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [walletProblem, setWalletProblem] = useState<'none' | 'inactive' | null>(null)
  const [limits, setLimits] = useState<ExchangeLimit[] | null>(null)
  const [rates, setRates] = useState<ExchangeRate[] | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 예약 응답을 받지 못한 상태. 입력을 잠그고 같은 요청으로만 다시 보낸다. */
  const [uncertain, setUncertain] = useState(false)
  const pending = useRef<PendingReservation | null>(null)

  const fromCurrency: Currency = type === 'EXCHANGE' ? 'KRW' : foreign
  const toCurrency: Currency = type === 'EXCHANGE' ? foreign : 'KRW'

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
    // 한도·환율은 안내용이라 실패하면 표시만 뺀다(최종 판단은 예약 API).
    fetchExchangeLimits(controller.signal).then(setLimits, () => undefined)
    fetchExchangeRates(undefined, controller.signal).then(setRates, (cause) => {
      if (!isAbort(cause)) {
        setRates([])
      }
    })
    return () => controller.abort()
  }, [])

  const limit = limits?.find((item) => item.currency === fromCurrency)
  const minMinor = limit ? majorToMinor(limit.minAmount, fromCurrency) : null
  const maxMinor = limit ? majorToMinor(limit.maxAmount, fromCurrency) : null
  const balanceMinor = limit?.balance != null ? majorToMinor(limit.balance, fromCurrency) : null
  const rate = rates?.find((item) => item.currency === foreign)
  const parsedAmount = parseAmount(amountInput, fromCurrency)
  const parsedRate = parseRate(rateInput)
  const condition = type === 'EXCHANGE' ? 'AT_OR_BELOW' : 'AT_OR_ABOVE'
  const unitLabel = `${(rate?.unit ?? (foreign === 'JPY' ? 100 : 1)).toLocaleString('ko-KR')}${CURRENCY_INFO[foreign].unit}`
  const expiresAtPreview = pending.current ? new Date(pending.current.input.expiresAt) : expiryFrom(Date.now(), periodDays)

  /** 목표가 이미 현재 매매기준율 조건을 만족하면 다음 환율 수집 때 바로 체결될 수 있다. */
  const rateComparison = rate && parsedRate.ok ? compareDecimalText(parsedRate.value, rate.midRate) : null
  const executesSoon =
    rateComparison !== null && (condition === 'AT_OR_BELOW' ? rateComparison >= 0 : rateComparison <= 0)

  function changeType(next: ExchangeType) {
    setType(next)
    setAmountInput('')
    setRateInput('')
    setAmountError(null)
    setRateError(null)
    setError(null)
  }

  function validate(): ReservationInput | null {
    let valid = true
    if (!parsedAmount.ok) {
      setAmountError(parsedAmount.message)
      valid = false
    } else if (minMinor !== null && parsedAmount.minor < minMinor) {
      setAmountError(`최소 ${formatAmount(minMinor, fromCurrency)}부터 예약할 수 있습니다.`)
      valid = false
    } else if (maxMinor !== null && parsedAmount.minor > maxMinor) {
      setAmountError(`한 번에 ${formatAmount(maxMinor, fromCurrency)}까지 예약할 수 있습니다.`)
      valid = false
    } else {
      setAmountError(null)
    }
    if (!parsedRate.ok) {
      setRateError(parsedRate.message)
      valid = false
    } else {
      setRateError(null)
    }
    if (!valid || !parsedAmount.ok || !parsedRate.ok || !wallet) {
      return null
    }
    return {
      walletId: wallet.walletId,
      fromCurrency,
      toCurrency,
      amount: toAmountInput(parsedAmount.minor, fromCurrency),
      targetRate: parsedRate.value,
      // 만료 시각은 제출하는 순간 한 번만 정한다. 재시도마다 다시 계산하면 본문이 달라져 409가 된다.
      expiresAt: expiryFrom(Date.now(), periodDays).toISOString(),
    }
  }

  async function send(request: PendingReservation) {
    setSubmitting(true)
    setError(null)
    try {
      const reservation = await createReservation(request.input, request.key)
      pending.current = null
      navigate(`/exchange-reservations/${reservation.reservationId}`, { replace: true, state: { justReserved: true } })
    } catch (cause) {
      if (isOutcomeUnknown(cause)) {
        // 예약됐는지 알 수 없다. 같은 키·같은 본문으로 다시 보내면 서버가 처음 예약을 돌려준다.
        setUncertain(true)
        setError(toExchangeMessage(cause, '예약 결과를 확인하지 못했습니다.'))
        return
      }
      pending.current = null
      setUncertain(false)
      if (isApiError(cause) && cause.code === 'EXCHANGE_INVALID_AMOUNT') {
        setAmountError(toExchangeMessage(cause, ''))
      } else if (isApiError(cause) && cause.code === 'EXCHANGE_RESERVATION_INVALID_TARGET_RATE') {
        setRateError(toExchangeMessage(cause, ''))
      } else {
        setError(toExchangeMessage(cause, '예약하지 못했습니다.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending.current) {
      void send(pending.current)
      return
    }
    const input = validate()
    if (!input) {
      return
    }
    pending.current = { input, key: newIdempotencyKey() }
    void send(pending.current)
  }

  /** 결과를 모르는 요청을 버리고 새로 작성한다. 처음 요청이 저장됐다면 예약이 하나 더 생길 수 있다. */
  function startOver() {
    pending.current = null
    setUncertain(false)
    setError(null)
  }

  const locked = uncertain || submitting

  return (
    <section>
      <div className="title-row">
        <h1>예약 환전</h1>
        <div className="actions inline">
          <Link to="/exchange-rates">환율 보기</Link>
          <Link to="/exchange-reservations">예약 내역</Link>
        </div>
      </div>
      <p className="hint">
        목표 환율(매매기준율)에 닿으면 자동으로 환전합니다. 예약할 때는 잔액이 빠지지 않고, 체결될 때 잔액이 부족하면
        환전이 실패합니다. 받을 금액과 수수료는 체결 환율로 정해집니다.
      </p>

      {walletProblem === 'none' && (
        <p className="error">
          예약하려면 지갑이 필요합니다. <Link to="/wallet">지갑 만들기</Link>
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
            disabled={locked}
          >
            {item === 'EXCHANGE' ? '원화 → 외화' : '외화 → 원화'}
          </button>
        ))}
      </div>

      <form className="form" onSubmit={handleSubmit} noValidate>
        <label>
          {type === 'EXCHANGE' ? '받을 외화' : '보낼 외화'}
          <select
            value={foreign}
            disabled={locked}
            onChange={(e) => {
              setForeign(e.target.value as ForeignCurrency)
              setAmountError(null)
              setRateInput('')
              setRateError(null)
            }}
          >
            {FOREIGN_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {CURRENCY_INFO[code].label}
              </option>
            ))}
          </select>
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
              disabled={locked}
            />
            <span>{CURRENCY_INFO[fromCurrency].unit}</span>
          </div>
          {amountInput && parsedAmount.ok && <span className="hint">{formatAmount(parsedAmount.minor, fromCurrency)}</span>}
          {minMinor !== null && maxMinor !== null && (
            <span className="hint">
              1회 {formatAmount(minMinor, fromCurrency)} ~ {formatAmount(maxMinor, fromCurrency)}, 수수료는 체결할 때
              보내는 통화로 따로 빠집니다.
            </span>
          )}
          {balanceMinor !== null && <span className="hint">지금 잔액 {formatAmount(balanceMinor, fromCurrency)}</span>}
          {amountError && <span className="field-error">{amountError}</span>}
        </label>

        <label>
          목표 환율 ({unitLabel}당 원)
          <div className="input-row">
            <input
              inputMode="decimal"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              placeholder="0.00"
              autoComplete="off"
              disabled={locked}
            />
            <span>원</span>
          </div>
          {rate && (
            <span className="hint">
              지금 매매기준율 {formatDecimalText(rate.midRate)}원 (기준일 {rate.rateDate})
            </span>
          )}
          {rates && !rate && <span className="hint">환율 정보를 불러오지 못했습니다.</span>}
          {executesSoon && (
            <span className="hint">지금 환율이 이미 조건을 만족해, 다음 환율 수집 때 바로 체결될 수 있습니다.</span>
          )}
          {rateError && <span className="field-error">{rateError}</span>}
        </label>

        <label>
          만료 기간
          <select
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value) as PeriodDays)}
            disabled={locked}
          >
            {RESERVATION_PERIOD_DAYS.map((days) => (
              <option key={days} value={days}>
                {days}일
              </option>
            ))}
          </select>
          <span className="hint">{formatDateTime(expiresAtPreview.toISOString())}까지 체결되지 않으면 만료됩니다.</span>
        </label>

        {parsedAmount.ok && parsedRate.ok && (
          <p className="notice">
            매매기준율이{' '}
            {reservationTriggerText({
              fromCurrency,
              toCurrency,
              targetRate: parsedRate.value,
              rateUnit: rate?.unit ?? (foreign === 'JPY' ? 100 : 1),
              condition,
            })}{' '}
            {formatAmount(parsedAmount.minor, fromCurrency)}을 {CURRENCY_INFO[toCurrency].label}로 환전합니다.
          </p>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {uncertain && (
          <p className="hint">
            예약이 이미 등록되었을 수 있습니다. <strong>다시 시도</strong>는 같은 요청으로 보내므로 예약이 두 번 생기지
            않습니다. 새로 작성하기 전에 <Link to="/exchange-reservations">예약 내역</Link>을 먼저 확인해 주세요.
          </p>
        )}

        <div className="actions">
          {uncertain && (
            <button type="button" className="secondary" onClick={startOver} disabled={submitting}>
              새로 작성
            </button>
          )}
          <button
            type="submit"
            className="primary"
            disabled={submitting || walletProblem !== null || !wallet || (!uncertain && (!amountInput || !rateInput))}
          >
            {submitting ? '예약 중…' : uncertain ? '다시 시도' : '예약하기'}
          </button>
        </div>
      </form>
    </section>
  )
}
