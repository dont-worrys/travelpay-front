import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { fetchMerchantBalance } from '../features/merchant/api'
import { forgetMerchant, loadRecentMerchants, rememberMerchant, type RecentMerchant } from '../features/merchant/recentMerchants'
import { toMerchantMessage } from '../features/merchant/status'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 가맹점 주인 화면 입구. 내 가맹점 목록 API가 없어 가맹점 ID로 들어간다. */
export function MerchantEntryPage() {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [recent, setRecent] = useState<RecentMerchant[]>(() => loadRecentMerchants())

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const merchantId = input.trim()
    if (!UUID_PATTERN.test(merchantId)) {
      setError('가맹점 ID 형식이 아닙니다. 관리자가 알려 준 가맹점 ID를 입력해 주세요.')
      return
    }
    setError(null)
    setChecking(true)
    try {
      // 잔액 조회로 내가 주인인 가맹점인지 확인한다(아니면 404).
      const balance = await fetchMerchantBalance(merchantId)
      rememberMerchant({ merchantId: balance.merchantId, currency: balance.currency })
      navigate(`/merchant/${balance.merchantId}`)
    } catch (cause) {
      setError(toMerchantMessage(cause, '가맹점을 확인하지 못했습니다.'))
    } finally {
      setChecking(false)
    }
  }

  function handleForget(merchantId: string) {
    forgetMerchant(merchantId)
    setRecent(loadRecentMerchants())
  }

  return (
    <section>
      <h1>가맹점 관리</h1>
      <p className="hint">내가 주인인 가맹점의 결제·환불 신청·정산을 관리합니다.</p>
      <p className="hint">
        가맹점 ID는 가맹점을 만든 관리자에게 받습니다. 정산금은 내 지갑으로 들어오니, 지갑이 없다면{' '}
        <Link to="/wallet">내 지갑</Link>에서 먼저 만들어 주세요.
      </p>

      {recent.length > 0 && (
        <>
          <h2>최근 연 가맹점</h2>
          <ul className="item-list">
            {recent.map((item) => (
              <li key={item.merchantId}>
                <div className="item">
                  <span className="item-main">
                    <Link to={`/merchant/${item.merchantId}`}>
                      <code>{item.merchantId}</code>
                    </Link>
                    <span className="hint">{item.currency}</span>
                  </span>
                  <span className="item-sub">
                    <span />
                    <button type="button" className="link-button" onClick={() => handleForget(item.merchantId)}>
                      목록에서 빼기
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <form className="form" onSubmit={handleSubmit} noValidate>
        <label>
          가맹점 ID
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 9b2f3c1e-8a47-4d55-b0c2-7e1f6a9d3b10"
            autoComplete="off"
            spellCheck={false}
          />
          {error && <span className="field-error">{error}</span>}
        </label>
        <button type="submit" disabled={checking || !input.trim()}>
          {checking ? '확인 중…' : '열기'}
        </button>
      </form>
    </section>
  )
}
