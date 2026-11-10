import { useState, type FormEvent } from 'react'
import { isOutcomeUnknown } from '../../api'
import { createMerchant, retryMerchantLedgerAccount, type Merchant, type MerchantStatus } from '../../features/admin/api'
import { toAdminMessage } from '../../features/admin/reviews'
import { formatDateTime } from '../../lib/datetime'
import { CURRENCIES, CURRENCY_INFO, type Currency } from '../../lib/money'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NAME_MAX = 255

const MERCHANT_STATUS_LABEL: Record<MerchantStatus, string> = {
  PENDING: '준비 중(원장 계정 없음, 결제 불가)',
  ACTIVE: '사용 가능',
  SUSPENDED: '정지(결제 불가, 정산 가능)',
}

/**
 * 가맹점 생성. 원장 계정까지 만들어지면 201 `ACTIVE`, 원장 호출이 실패하면 202 `PENDING`이고 재시도로 `ACTIVE`가 된다.
 * 생성 요청은 멱등성 키가 없어, 결과를 모를 때 다시 보내면 가맹점이 두 개 생길 수 있다.
 */
export function AdminMerchantNewPage() {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<Currency>('KRW')
  const [ownerUserId, setOwnerUserId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  const trimmedName = name.trim()
  const trimmedOwner = ownerUserId.trim()
  const ownerInvalid = trimmedOwner !== '' && !UUID_PATTERN.test(trimmedOwner)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!trimmedName || !UUID_PATTERN.test(trimmedOwner)) {
      return
    }
    if (
      uncertain &&
      !window.confirm('이전 요청으로 가맹점이 이미 만들어졌을 수 있습니다. 다시 보내면 같은 가맹점이 하나 더 생길 수 있습니다. 계속할까요?')
    ) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { data } = await createMerchant({ name: trimmedName, currency, ownerUserId: trimmedOwner })
      setMerchant(data)
      setUncertain(false)
    } catch (cause) {
      setUncertain(isOutcomeUnknown(cause))
      setError(toAdminMessage(cause, '가맹점을 만들지 못했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRetry() {
    if (!merchant) {
      return
    }
    setRetrying(true)
    setRetryError(null)
    try {
      setMerchant(await retryMerchantLedgerAccount(merchant.merchantId))
    } catch (cause) {
      setRetryError(toAdminMessage(cause, '원장 계정을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setRetrying(false)
    }
  }

  function reset() {
    setMerchant(null)
    setName('')
    setOwnerUserId('')
    setRetryError(null)
  }

  if (merchant) {
    return (
      <section>
        <h1>가맹점 생성</h1>
        {merchant.status === 'ACTIVE' && <p className="notice">가맹점을 만들었습니다. 바로 결제를 받을 수 있습니다.</p>}
        {merchant.status === 'PENDING' && (
          <p className="hint">
            가맹점은 저장됐지만 원장 계정을 아직 만들지 못했습니다. 결제를 받으려면 원장 계정 생성을 다시 시도해 주세요.
          </p>
        )}
        <dl className="info">
          <dt>가맹점 ID</dt>
          <dd>
            <code>{merchant.merchantId}</code>
            <br />
            <span className="hint">결제하는 회원과 가맹점 주인에게 이 ID를 알려 주세요.</span>
          </dd>
          <dt>이름</dt>
          <dd>{merchant.name}</dd>
          <dt>통화</dt>
          <dd>{CURRENCY_INFO[merchant.currency]?.label ?? merchant.currency}</dd>
          <dt>주인 회원 ID</dt>
          <dd>
            <code>{merchant.ownerUserId}</code>
          </dd>
          <dt>상태</dt>
          <dd>{MERCHANT_STATUS_LABEL[merchant.status] ?? merchant.status}</dd>
          <dt>생성 시각</dt>
          <dd>{formatDateTime(merchant.createdAt)}</dd>
        </dl>
        {retryError && (
          <p className="error" role="alert">
            {retryError}
          </p>
        )}
        <div className="actions">
          {merchant.status === 'PENDING' && (
            <button type="button" className="primary" onClick={handleRetry} disabled={retrying}>
              {retrying ? '시도 중…' : '원장 계정 생성 다시 시도'}
            </button>
          )}
          <button type="button" className="secondary" onClick={reset}>
            다른 가맹점 만들기
          </button>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h1>가맹점 생성</h1>
      <p className="hint">가맹점은 통화 하나만 받습니다. 한 회원이 여러 가맹점의 주인이 될 수 있습니다.</p>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          가맹점 이름
          <input value={name} maxLength={NAME_MAX} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          받는 통화
          <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
            {CURRENCIES.map((item) => (
              <option key={item} value={item}>
                {CURRENCY_INFO[item].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          주인 회원 ID
          <input
            value={ownerUserId}
            onChange={(event) => setOwnerUserId(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            required
          />
          {ownerInvalid && <span className="field-error">회원 ID 형식(UUID)이 아닙니다.</span>}
          <span className="hint">활성 상태의 일반회원이어야 합니다. 회원은 내 정보 화면에서 회원 ID를 볼 수 있습니다.</span>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {uncertain && (
          <p className="hint">
            가맹점이 만들어졌는지 확인하지 못했습니다. 가맹점 목록 API가 없어 화면에서는 확인할 수 없으니, 필요하면 DB에서
            주인 회원의 가맹점을 확인한 뒤 다시 보내 주세요. 그냥 다시 보내면 같은 가맹점이 하나 더 생길 수 있습니다.
          </p>
        )}
        <button type="submit" disabled={submitting || !trimmedName || !UUID_PATTERN.test(trimmedOwner)}>
          {submitting ? '만드는 중…' : '가맹점 만들기'}
        </button>
      </form>
    </section>
  )
}
