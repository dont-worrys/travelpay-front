import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../features/auth/useAuth'

/** 내 정보. 송금을 받으려면 회원 ID를 보내는 분에게 알려 준다. */
export function MyPage() {
  const { state } = useAuth()
  const [copied, setCopied] = useState(false)
  if (state.status !== 'authenticated') {
    return null
  }
  const { me } = state

  async function copyUserId() {
    try {
      await navigator.clipboard.writeText(me.userId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // 클립보드 권한이 없으면 화면의 ID를 직접 복사한다.
    }
  }

  return (
    <section>
      <h1>내 정보</h1>
      <dl className="info">
        <dt>이름</dt>
        <dd>{me.realName}</dd>
        <dt>이메일</dt>
        <dd>{me.loginEmail ?? '-'}</dd>
        <dt>휴대폰</dt>
        <dd>{me.phone}</dd>
        <dt>회원 ID</dt>
        <dd>
          <code>{me.userId}</code>{' '}
          <button type="button" className="link-button" onClick={copyUserId}>
            {copied ? '복사됨' : '복사'}
          </button>
          <br />
          <span className="hint">송금을 받으려면 보내는 분에게 이 회원 ID를 알려 주세요.</span>
        </dd>
      </dl>
      <div className="actions">
        <Link to="/account/password" className="button-link">
          비밀번호 변경
        </Link>
      </div>
    </section>
  )
}
