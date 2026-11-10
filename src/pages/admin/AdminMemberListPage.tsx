import { useEffect, useState, type FormEvent } from 'react'
import { isApiError, isOutcomeUnknown } from '../../api'
import { StatusBadge, type BadgeTone } from '../../components/StatusBadge'
import type { UserStatus } from '../../features/auth/api'
import { useAuth } from '../../features/auth/useAuth'
import { isAbortError, isUuid } from '../../features/admin/input'
import {
  changeAdminMemberStatus,
  endAdminMemberSessions,
  searchAdminMembers,
  type AdminMember,
  type AdminMemberQuery,
  type AdminMemberStatusTarget,
  type SlicePage,
} from '../../features/admin/memberApi'
import { toAdminMessage } from '../../features/admin/reviews'

const PAGE_SIZE = 20
const PHONE_PATTERN = /^010-?\d{4}-?\d{4}$/

const MEMBER_STATUS: Record<UserStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: '정상', tone: 'success' },
  SUSPENDED: { label: '정지', tone: 'warn' },
  CLOSED: { label: '종료', tone: 'neutral' },
}

type RowAction = 'suspend' | 'activate' | 'sessions'

interface RowMessage {
  tone: 'notice' | 'error'
  text: string
}

/**
 * 회원 검색·정지/해제·세션 종료. 검색 조건(이메일·휴대폰 번호)은 개인정보라 화면 주소에 남기지 않는다.
 * 단건 조회 API가 없어 처리는 검색 결과 줄에서 한다.
 */
export function AdminMemberListPage() {
  const { state } = useAuth()
  const myUserId = state.status === 'authenticated' ? state.me.userId : null

  const [userId, setUserId] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<UserStatus | ''>('')
  const [inputError, setInputError] = useState<string | null>(null)

  const [query, setQuery] = useState<AdminMemberQuery>({ page: 0 })
  const [reloadToken, setReloadToken] = useState(0)
  const [result, setResult] = useState<SlicePage<AdminMember> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [busy, setBusy] = useState<{ userId: string; action: RowAction } | null>(null)
  const [messages, setMessages] = useState<Record<string, RowMessage>>({})

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError(null)
    searchAdminMembers({ ...query, size: PAGE_SIZE }, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!isAbortError(cause)) {
          setError(toAdminMessage(cause, '회원을 검색하지 못했습니다.'))
        }
      })
    return () => controller.abort()
  }, [query, reloadToken])

  function handleSearch(event: FormEvent) {
    event.preventDefault()
    const trimmedId = userId.trim()
    const trimmedPhone = phone.trim()
    if (trimmedId && !isUuid(trimmedId)) {
      setInputError('회원 ID(UUID) 형식이 아닙니다.')
      return
    }
    if (trimmedPhone && !PHONE_PATTERN.test(trimmedPhone)) {
      setInputError('휴대폰 번호는 010-1234-5678 형식으로 입력해 주세요.')
      return
    }
    setInputError(null)
    setMessages({})
    setQuery({
      userId: trimmedId || undefined,
      loginEmail: loginEmail.trim() || undefined,
      phone: trimmedPhone || undefined,
      status: status || undefined,
      page: 0,
    })
  }

  function goToPage(page: number) {
    setMessages({})
    setQuery((prev) => ({ ...prev, page }))
  }

  function setRowMessage(targetId: string, message: RowMessage) {
    setMessages((prev) => ({ ...prev, [targetId]: message }))
  }

  function replaceStatus(targetId: string, next: UserStatus) {
    setResult((prev) =>
      prev && { ...prev, items: prev.items.map((item) => (item.userId === targetId ? { ...item, status: next } : item)) },
    )
  }

  async function handleStatus(member: AdminMember, target: AdminMemberStatusTarget) {
    const action: RowAction = target === 'SUSPENDED' ? 'suspend' : 'activate'
    const question =
      target === 'SUSPENDED'
        ? `${member.maskedRealName} 회원을 정지할까요?\n정지 중에는 로그인할 수 없고, 기존 세션의 요청도 거절됩니다.`
        : `${member.maskedRealName} 회원의 정지를 해제할까요?\n해제 뒤에는 다시 로그인해야 합니다(기존 세션은 끝납니다).`
    if (!window.confirm(question)) {
      return
    }
    setBusy({ userId: member.userId, action })
    try {
      const changed = await changeAdminMemberStatus(member.userId, target)
      replaceStatus(member.userId, changed.status)
      const unchanged = changed.status === member.status
      setRowMessage(member.userId, {
        tone: 'notice',
        text: unchanged
          ? `이미 ${MEMBER_STATUS[changed.status].label} 상태라 바꾸지 않았습니다.`
          : target === 'SUSPENDED'
            ? '정지했습니다. 기존 세션도 끝났습니다.'
            : '정지를 해제했습니다. 회원은 다시 로그인해야 합니다.',
      })
    } catch (cause) {
      if (isApiError(cause) && cause.code === 'USER_CLOSED_ACCOUNT_UNCHANGEABLE') {
        replaceStatus(member.userId, 'CLOSED')
      }
      setRowMessage(member.userId, {
        tone: 'error',
        text: isOutcomeUnknown(cause)
          ? `${toAdminMessage(cause, '처리 결과를 확인하지 못했습니다.')} 반영됐는지 알 수 없습니다. 다시 눌러도 같은 상태로만 바뀌니 다시 시도하거나 다시 검색해 확인해 주세요.`
          : toAdminMessage(cause, '상태를 바꾸지 못했습니다.'),
      })
    } finally {
      setBusy(null)
    }
  }

  async function handleEndSessions(member: AdminMember) {
    const self = member.userId === myUserId
    const question = self
      ? '본인 계정의 기존 세션을 모두 끝낼까요?\n지금 이 화면의 세션도 끝나 다시 로그인해야 합니다.'
      : `${member.maskedRealName} 회원의 기존 세션을 모두 끝낼까요?\n다음 요청부터 다시 로그인해야 합니다(새 로그인은 막지 않습니다).`
    if (!window.confirm(question)) {
      return
    }
    setBusy({ userId: member.userId, action: 'sessions' })
    try {
      await endAdminMemberSessions(member.userId)
      setRowMessage(member.userId, { tone: 'notice', text: '기존 세션을 모두 끝냈습니다.' })
    } catch (cause) {
      setRowMessage(member.userId, {
        tone: 'error',
        text: isOutcomeUnknown(cause)
          ? `${toAdminMessage(cause, '처리 결과를 확인하지 못했습니다.')} 반영됐는지 알 수 없습니다. 다시 시도해도 기존 세션만 끝납니다.`
          : toAdminMessage(cause, '세션을 끝내지 못했습니다.'),
      })
    } finally {
      setBusy(null)
    }
  }

  const page = query.page ?? 0

  return (
    <section>
      <div className="title-row">
        <h1>회원 관리</h1>
        <button type="button" className="link-button" onClick={() => setReloadToken((value) => value + 1)}>
          새로고침
        </button>
      </div>
      <p className="hint">
        값을 넣은 조건만 정확히 일치하는 회원을 찾습니다(가입 최신 순). 이름·이메일·휴대폰 번호는 가려서 보여 줍니다.
      </p>

      <form className="form" onSubmit={handleSearch} noValidate>
        <label>
          회원 ID
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="UUID"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label>
          로그인 이메일
          <input
            type="email"
            value={loginEmail}
            onChange={(event) => setLoginEmail(event.target.value)}
            maxLength={254}
            autoComplete="off"
          />
        </label>
        <label>
          휴대폰 번호
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="010-1234-5678"
            inputMode="tel"
            autoComplete="off"
          />
        </label>
        <label>
          상태
          <select value={status} onChange={(event) => setStatus(event.target.value as UserStatus | '')}>
            <option value="">전체</option>
            {(Object.keys(MEMBER_STATUS) as UserStatus[]).map((value) => (
              <option key={value} value={value}>
                {MEMBER_STATUS[value].label} ({value})
              </option>
            ))}
          </select>
        </label>
        {inputError && <p className="field-error">{inputError}</p>}
        <button type="submit">검색</button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!result && !error && <p>불러오는 중입니다…</p>}
      {result && result.items.length === 0 && <p className="hint">조건에 맞는 회원이 없습니다.</p>}
      {result && result.items.length > 0 && (
        <ul className="item-list">
          {result.items.map((member) => {
            const self = member.userId === myUserId
            const rowBusy = busy?.userId === member.userId
            const message = messages[member.userId]
            const badge = MEMBER_STATUS[member.status] ?? { label: member.status, tone: 'neutral' as const }
            return (
              <li key={member.userId} className="item" data-testid={`member-${member.userId}`}>
                <span className="item-main">
                  <span>
                    {member.maskedRealName}
                    {member.role === 'MASTER' && ' (관리자)'}
                    {self && ' · 본인'}
                  </span>
                  <StatusBadge label={badge.label} tone={badge.tone} />
                </span>
                <span className="item-sub">
                  <span className="hint">
                    {member.maskedEmail ?? '이메일 없음'} · {member.maskedPhone}
                  </span>
                </span>
                <span className="hint">
                  <code>{member.userId}</code>
                </span>
                <div className="actions inline">
                  {member.status === 'ACTIVE' && !self && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy !== null}
                      onClick={() => handleStatus(member, 'SUSPENDED')}
                    >
                      {rowBusy && busy?.action === 'suspend' ? '정지 중…' : '정지'}
                    </button>
                  )}
                  {member.status === 'SUSPENDED' && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy !== null}
                      onClick={() => handleStatus(member, 'ACTIVE')}
                    >
                      {rowBusy && busy?.action === 'activate' ? '해제 중…' : '정지 해제'}
                    </button>
                  )}
                  {member.status !== 'CLOSED' && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy !== null}
                      onClick={() => handleEndSessions(member)}
                    >
                      {rowBusy && busy?.action === 'sessions' ? '세션 종료 중…' : '세션 종료'}
                    </button>
                  )}
                  {member.status === 'ACTIVE' && self && <span className="hint">본인 계정은 정지할 수 없습니다.</span>}
                  {member.status === 'CLOSED' && <span className="hint">종료된 계정은 바꿀 수 없습니다.</span>}
                </div>
                {message && (
                  <p className={message.tone} role={message.tone === 'error' ? 'alert' : 'status'}>
                    {message.text}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {result && (page > 0 || result.hasNext) && (
        <div className="pagination">
          <button type="button" className="secondary" disabled={page <= 0} onClick={() => goToPage(page - 1)}>
            이전
          </button>
          <span>{page + 1} 페이지</span>
          <button type="button" className="secondary" disabled={!result.hasNext} onClick={() => goToPage(page + 1)}>
            다음
          </button>
        </div>
      )}
    </section>
  )
}
