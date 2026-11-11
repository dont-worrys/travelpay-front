import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { isApiError, isOutcomeUnknown, toUserMessage } from '../api'
import { useAuth } from '../features/auth/useAuth'

/** DB 변경은 끝났지만 세션 갱신에 실패함. 새 비밀번호로 다시 로그인해야 한다. */
const UPDATED_SESSION_UNAVAILABLE = 'USER_ACCOUNT_UPDATED_SESSION_UNAVAILABLE'

/** 서버 오류 코드 중 특정 입력 칸 옆에 보여 줄 것. */
const FIELD_BY_CODE: Record<string, 'currentPassword' | 'newPassword'> = {
  USER_CURRENT_PASSWORD_MISMATCH: 'currentPassword',
  USER_NEW_PASSWORD_SAME_AS_CURRENT: 'newPassword',
}

const EMPTY_FORM = { currentPassword: '', newPassword: '', newPasswordConfirm: '' }

type Outcome =
  | { kind: 'idle' }
  | { kind: 'done' }
  /** 비밀번호는 바뀌었지만 지금 세션은 쓸 수 없다. */
  | { kind: 'relogin' }
  /** 변경됐는지 알 수 없다. */
  | { kind: 'unknown' }

/**
 * 본인 비밀번호 변경. 일반회원·관리자 모두 쓴다.
 * 성공하면 서버가 세션 ID를 바꾸므로 CSRF 토큰을 새로 받는다(`AuthContext.changePassword`).
 */
export function PasswordChangePage() {
  const { changePassword, logout } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })
  const [leaving, setLeaving] = useState(false)

  function update(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    if (form.newPassword !== form.newPasswordConfirm) {
      setFieldErrors({ newPasswordConfirm: '새 비밀번호가 서로 다릅니다.' })
      return
    }

    setSubmitting(true)
    try {
      // 비밀번호 앞뒤 공백도 서버가 그대로 검사하므로 자르지 않는다.
      await changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      setForm(EMPTY_FORM)
      setOutcome({ kind: 'done' })
    } catch (cause) {
      if (isApiError(cause) && cause.code === UPDATED_SESSION_UNAVAILABLE) {
        // 이전 비밀번호로 자동 재시도하지 않는다.
        setForm(EMPTY_FORM)
        setOutcome({ kind: 'relogin' })
        return
      }
      if (isOutcomeUnknown(cause)) {
        setOutcome({ kind: 'unknown' })
        setError(toUserMessage(cause, '비밀번호를 바꾸지 못했습니다.'))
        return
      }
      setOutcome({ kind: 'idle' })
      if (isApiError(cause)) {
        const field = FIELD_BY_CODE[cause.code]
        setFieldErrors(field ? { [field]: cause.message } : cause.fieldMessages())
        if (field) {
          return
        }
      }
      setError(toUserMessage(cause, '비밀번호를 바꾸지 못했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function goToLogin() {
    setLeaving(true)
    try {
      await logout()
    } catch {
      // 세션 갱신에 실패한 상태라 로그아웃 요청도 실패할 수 있다. 화면은 로그아웃 상태로 둔다.
    }
    navigate('/login', { replace: true })
  }

  if (outcome.kind === 'relogin') {
    return (
      <section>
        <h1>비밀번호 변경</h1>
        <p className="notice">비밀번호를 바꿨습니다.</p>
        <p>로그인 상태를 이어 가지 못했습니다. 새 비밀번호로 다시 로그인해 주세요.</p>
        <div className="actions">
          <button type="button" onClick={goToLogin} disabled={leaving}>
            다시 로그인
          </button>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h1>비밀번호 변경</h1>
      {outcome.kind === 'done' && (
        <p className="notice" role="status">
          비밀번호를 바꿨습니다. 다른 기기에 로그인된 세션은 자동으로 로그아웃되지 않습니다.
        </p>
      )}
      <form className="form" onSubmit={handleSubmit} noValidate>
        <label>
          현재 비밀번호
          <input
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(e) => update('currentPassword', e.target.value)}
          />
          {fieldErrors.currentPassword && <span className="field-error">{fieldErrors.currentPassword}</span>}
        </label>
        <label>
          새 비밀번호
          <input
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => update('newPassword', e.target.value)}
          />
          <span className="hint">공백 없이 영문·숫자·특수문자를 모두 포함해 10~72자</span>
          {fieldErrors.newPassword && <span className="field-error">{fieldErrors.newPassword}</span>}
        </label>
        <label>
          새 비밀번호 확인
          <input
            type="password"
            autoComplete="new-password"
            value={form.newPasswordConfirm}
            onChange={(e) => update('newPasswordConfirm', e.target.value)}
          />
          {fieldErrors.newPasswordConfirm && (
            <span className="field-error">{fieldErrors.newPasswordConfirm}</span>
          )}
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {outcome.kind === 'unknown' && (
          <p className="hint">
            비밀번호가 바뀌었는지 확인하지 못했습니다. 다시 시도했을 때 현재 비밀번호가 틀리다고 나오면 이미 바뀐
            것이니, 로그아웃한 뒤 새 비밀번호로 로그인해 확인해 주세요.
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || !form.currentPassword || !form.newPassword || !form.newPasswordConfirm}
        >
          {submitting ? '변경 중…' : '비밀번호 변경'}
        </button>
      </form>
    </section>
  )
}
