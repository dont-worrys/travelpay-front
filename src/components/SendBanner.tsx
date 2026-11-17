import { Link } from 'react-router'
import { Icon } from './Icon'
import handPhoneImage from '../assets/send-hand-phone.webp'

/** 비로그인이 송금하기를 누르면 로그인 화면으로 보내고, 로그인하면 송금 화면으로 이어진다. */
const TRANSFER_AFTER_LOGIN = `/login?redirect=${encodeURIComponent('/transfers/new')}`

/**
 * 홈 아래쪽 송금 안내 배너(xe 홈의 "Send money online" 구성을 참고). 문구는 송금 화면이 실제로 하는 일만 쓴다:
 * 회원 ID로 받는 분(마스킹된 이름)을 확인하고 지갑에서 바로 보내며, 송금 수수료는 없다.
 * 오른쪽(좁은 화면은 아래) 그림은 손이 폰을 잡고 있는 이미지(배경 투명 WebP, 화면에 TravelPay 송금하기 화면)이고
 * 장식이라 읽기 프로그램에는 숨긴다(alt 비움). 화면 속 이름·금액은 보여 주기용 예시 값이다.
 */
export function SendBanner() {
  return (
    <section className="send-banner" aria-labelledby="send-banner-title">
      <div className="send-banner-text">
        <p className="send-banner-eyebrow">송금</p>
        <h2 id="send-banner-title">더 편리하게 보내세요</h2>
        <p className="send-banner-desc">
          받는 분의 회원 ID만 입력하면 이름을 확인하고 바로 보낼 수 있어요.
          <br />
          송금 수수료 없이 즉시 보낼 수 있어요.
        </p>
        <div className="send-banner-actions">
          <Link to={TRANSFER_AFTER_LOGIN} className="button-link">
            지금 송금하기
            <Icon name="arrowRight" />
          </Link>
          <Link to="/exchange-rates" className="button-link on-navy">
            환율 보기
            <Icon name="arrowRight" />
          </Link>
        </div>
      </div>
      <div className="send-banner-art" aria-hidden="true">
        <img className="send-banner-phone" src={handPhoneImage} alt="" width={785} height={882} decoding="async" draggable={false} />
      </div>
    </section>
  )
}
