import { Link } from 'react-router'
import { useAuth } from '../features/auth/useAuth'

export function HomePage() {
  const { state } = useAuth()
  return (
    <section>
      <h1>TravelPay</h1>
      {state.status === 'loading' && <p>로그인 상태를 확인하는 중입니다…</p>}
      {state.status === 'anonymous' && (
        <p>
          <Link to="/login">로그인</Link>하면 송금·결제·환전과 지갑을 이용할 수 있습니다.{' '}
          <Link to="/exchange-rates">환율 보기</Link>
        </p>
      )}
      {state.status === 'authenticated' && (
        <>
          <p>{state.me.realName}님, 환영합니다.</p>
          <div className="actions">
            <Link to="/wallet" className="button-link">
              내 지갑
            </Link>
            <Link to="/transfers/new" className="button-link">
              송금하기
            </Link>
            <Link to="/payments/new" className="button-link">
              결제하기
            </Link>
            <Link to="/transfers">송금 내역</Link>
            <Link to="/exchange" className="button-link">
              환전하기
            </Link>
            <Link to="/payments">결제 내역</Link>
            <Link to="/exchanges">환전 내역</Link>
          </div>
        </>
      )}
    </section>
  )
}
