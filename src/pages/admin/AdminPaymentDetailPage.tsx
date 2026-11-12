import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { isApiError } from '../../api'
import { RefundActions, RefundHistory, remainingAmount } from '../../features/merchant/RefundActions'
import { toMerchantMessage } from '../../features/merchant/status'
import { useMerchantPayment } from '../../features/merchant/useMerchantPayment'
import { PaymentStatusBadge } from '../../features/payment/PaymentStatusBadge'
import { isProcessingPayment } from '../../features/payment/status'
import { formatDateTime } from '../../lib/datetime'
import { formatAmount } from '../../lib/money'

const OVERDUE_LINK = '/admin/refund-requests/overdue'

/** 관리자 화면에서는 "내가 주인인 가맹점" 안내 대신 결제를 못 찾았다고만 알린다. */
function toAdminPaymentMessage(cause: unknown, fallback: string): string {
  if (isApiError(cause) && (cause.code === 'PAYMENT_MERCHANT_NOT_FOUND' || cause.code === 'PAYMENT_NOT_FOUND')) {
    return '결제를 찾을 수 없습니다. 가맹점 ID와 결제 ID를 확인해 주세요.'
  }
  return toMerchantMessage(cause, fallback)
}

/**
 * 관리자(`MASTER`)용 결제 상세: 가맹점이 처리하지 않은 고객 환불 신청을 대신 실행하거나 거절한다(분쟁 개입).
 * 신청이 없는 결제 완료(`APPROVED`) 결제도 직접 환불할 수 있다(서버의 운영 예외 통로, 기간 제한 없음).
 * 정산에 들어간 결제는 관리자도 환불할 수 없다(409 `PAYMENT_ALREADY_SETTLED`).
 */
export function AdminPaymentDetailPage() {
  const { merchantId = '', paymentId = '' } = useParams()
  const { payment, setPayment, error, pollStopped, reload } = useMerchantPayment(
    merchantId,
    paymentId,
    toAdminPaymentMessage,
  )
  const [notice, setNotice] = useState<string | null>(null)
  const listLink = `/admin/payments?merchantId=${encodeURIComponent(merchantId)}`

  if (error) {
    return (
      <section>
        <h1>결제 상세</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <div className="actions">
          <Link to={listLink}>가맹점 결제 목록</Link>
          <Link to={OVERDUE_LINK}>지연 환불 신청</Link>
        </div>
      </section>
    )
  }
  if (!payment) {
    return <p className="loading">불러오는 중입니다…</p>
  }

  const remaining = remainingAmount(payment)
  const canAct = payment.status === 'REFUND_REQUESTED'

  return (
    <section>
      <h1>결제 상세</h1>
      {notice && <p className="notice">{notice}</p>}

      <p className="amount-large">
        {formatAmount(payment.amount, payment.currency)} <PaymentStatusBadge status={payment.status} />
      </p>
      {canAct && (
        <p className="hint">
          고객이 환불을 신청했지만 가맹점이 처리하지 않았습니다. 가맹점 대신 환불을 실행하거나, 부당한 신청이면
          거절해 주세요. 처리 기록에는 관리자로 남습니다.
        </p>
      )}
      {payment.status === 'APPROVED' && remaining > 0 && (
        <p className="hint">
          고객 환불 신청이 없는 결제입니다. 운영상 필요하면 관리자가 직접 환불할 수 있습니다(환불 기간 제한 없음).
        </p>
      )}
      <p className="hint">정산에 들어간 결제는 관리자도 환불할 수 없습니다.</p>
      {payment.status === 'REFUND_PENDING' && <p className="hint">환불을 처리하고 있습니다.</p>}
      {isProcessingPayment(payment.status) && !pollStopped && (
        <p className="hint">결과를 자동으로 확인하는 중입니다…</p>
      )}
      {pollStopped && <p className="hint">처리가 늦어지고 있습니다. 잠시 후 다시 확인해 주세요.</p>}

      <dl className="info">
        <dt>가맹점</dt>
        <dd>
          {payment.merchantName} (<code>{merchantId}</code>)
        </dd>
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
        leading={
          <>
            <Link to={listLink}>가맹점 결제 목록</Link>
            <Link to={OVERDUE_LINK}>지연 환불 신청</Link>
          </>
        }
        allowDirectRefund
      />
    </section>
  )
}
