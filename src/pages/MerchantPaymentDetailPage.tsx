import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { RefundActions, RefundHistory, remainingAmount } from '../features/merchant/RefundActions'
import { toMerchantMessage } from '../features/merchant/status'
import { useMerchantPayment } from '../features/merchant/useMerchantPayment'
import { PaymentStatusBadge } from '../features/payment/PaymentStatusBadge'
import { isProcessingPayment } from '../features/payment/status'
import { formatDateTime } from '../lib/datetime'
import { formatAmount } from '../lib/money'

/** 가맹점 주인용 결제 상세: 고객 환불 신청을 실행(부분·전액)하거나 거절한다. */
export function MerchantPaymentDetailPage() {
  const { merchantId = '', paymentId = '' } = useParams()
  const { payment, setPayment, error, pollStopped, reload } = useMerchantPayment(merchantId, paymentId, toMerchantMessage)
  const [notice, setNotice] = useState<string | null>(null)

  const backLink = `/merchant/${merchantId}`

  if (error) {
    return (
      <section>
        <h1>결제 상세</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <Link to={backLink}>가맹점 관리로</Link>
      </section>
    )
  }
  if (!payment) {
    return <p>불러오는 중입니다…</p>
  }

  const remaining = remainingAmount(payment)
  const canAct = payment.status === 'REFUND_REQUESTED'

  return (
    <section>
      <h1>결제 상세</h1>
      {notice && <p className="notice">{notice}</p>}

      <p className="amount-large">
        +{formatAmount(payment.amount, payment.currency)} <PaymentStatusBadge status={payment.status} />
      </p>
      {canAct && <p className="hint">고객이 환불을 신청했습니다. 환불 금액을 정해 실행하거나 신청을 거절해 주세요.</p>}
      {payment.status === 'REFUND_PENDING' && <p className="hint">환불을 처리하고 있습니다.</p>}
      {isProcessingPayment(payment.status) && !pollStopped && (
        <p className="hint">결과를 자동으로 확인하는 중입니다…</p>
      )}
      {pollStopped && <p className="hint">처리가 늦어지고 있습니다. 잠시 후 다시 확인해 주세요.</p>}

      <dl className="info">
        <dt>결제 내용</dt>
        <dd>{payment.paymentInfo ?? '-'}</dd>
        <dt>환불 가능 남은 금액</dt>
        <dd className="amount">{formatAmount(remaining, payment.currency)}</dd>
        <dt>결제 시각</dt>
        <dd>{formatDateTime(payment.createdAt)}</dd>
        <dt>결제 ID</dt>
        <dd>
          <code>{payment.paymentId}</code>
        </dd>
      </dl>

      <RefundHistory payment={payment} />

      <RefundActions
        payment={payment}
        onPaymentChange={(data) => {
          setPayment(data)
          if (isProcessingPayment(data.status)) {
            reload()
          }
        }}
        onNotice={setNotice}
        onReload={reload}
        leading={<Link to={backLink}>가맹점 관리</Link>}
      />
    </section>
  )
}
