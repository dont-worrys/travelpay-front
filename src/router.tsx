import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout'
import { RequireAuth } from './features/auth/RequireAuth'
import { RequireRole } from './features/auth/RequireRole'
import { AdminChargeListPage } from './pages/admin/AdminChargeListPage'
import { AdminChargeReviewPage } from './pages/admin/AdminChargeReviewPage'
import { AdminHomePage } from './pages/admin/AdminHomePage'
import { AdminMerchantNewPage } from './pages/admin/AdminMerchantNewPage'
import { AdminOverdueRefundListPage } from './pages/admin/AdminOverdueRefundListPage'
import { AdminReconciliationDetailPage } from './pages/admin/AdminReconciliationDetailPage'
import { AdminReconciliationListPage } from './pages/admin/AdminReconciliationListPage'
import { AdminResolutionDetailPage } from './pages/admin/AdminResolutionDetailPage'
import { AdminResolutionListPage } from './pages/admin/AdminResolutionListPage'
import { AdminReviewDetailPage } from './pages/admin/AdminReviewDetailPage'
import { AdminReviewListPage } from './pages/admin/AdminReviewListPage'
import { AdminTransferDetailPage } from './pages/admin/AdminTransferDetailPage'
import { AdminTransferListPage } from './pages/admin/AdminTransferListPage'
import { ChargeDetailPage } from './pages/ChargeDetailPage'
import { ChargeListPage } from './pages/ChargeListPage'
import { ChargeNewPage } from './pages/ChargeNewPage'
import { ExchangeDetailPage } from './pages/ExchangeDetailPage'
import { ExchangeListPage } from './pages/ExchangeListPage'
import { ExchangeNewPage } from './pages/ExchangeNewPage'
import { ExchangeRatePage } from './pages/ExchangeRatePage'
import { ExchangeReservationDetailPage } from './pages/ExchangeReservationDetailPage'
import { ExchangeReservationListPage } from './pages/ExchangeReservationListPage'
import { ExchangeReservationNewPage } from './pages/ExchangeReservationNewPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MerchantEntryPage } from './pages/MerchantEntryPage'
import { MerchantHomePage } from './pages/MerchantHomePage'
import { MerchantPaymentDetailPage } from './pages/MerchantPaymentDetailPage'
import { MyPage } from './pages/MyPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PaymentDetailPage } from './pages/PaymentDetailPage'
import { PaymentListPage } from './pages/PaymentListPage'
import { PasswordChangePage } from './pages/PasswordChangePage'
import { PaymentNewPage } from './pages/PaymentNewPage'
import { SettlementDetailPage } from './pages/SettlementDetailPage'
import { SettlementListPage } from './pages/SettlementListPage'
import { SignupPage } from './pages/SignupPage'
import { TransferDetailPage } from './pages/TransferDetailPage'
import { TransferListPage } from './pages/TransferListPage'
import { TransferNewPage } from './pages/TransferNewPage'
import { WalletPage } from './pages/WalletPage'

/** 일반회원 화면. 관리자(`MASTER`)에게는 제공하지 않는다. */
const userRoutes: RouteObject[] = [
  { path: 'me', element: <MyPage /> },
  { path: 'transfers', element: <TransferListPage /> },
  { path: 'transfers/new', element: <TransferNewPage /> },
  { path: 'transfers/:transferId', element: <TransferDetailPage /> },
  { path: 'payments', element: <PaymentListPage /> },
  { path: 'payments/new', element: <PaymentNewPage /> },
  { path: 'payments/:paymentId', element: <PaymentDetailPage /> },
  { path: 'exchange', element: <ExchangeNewPage /> },
  { path: 'exchanges', element: <ExchangeListPage /> },
  { path: 'exchanges/:orderId', element: <ExchangeDetailPage /> },
  { path: 'exchange-reservations', element: <ExchangeReservationListPage /> },
  { path: 'exchange-reservations/new', element: <ExchangeReservationNewPage /> },
  { path: 'exchange-reservations/:reservationId', element: <ExchangeReservationDetailPage /> },
  { path: 'merchant', element: <MerchantEntryPage /> },
  { path: 'merchant/:merchantId', element: <MerchantHomePage /> },
  { path: 'merchant/:merchantId/payments/:paymentId', element: <MerchantPaymentDetailPage /> },
  { path: 'merchant/:merchantId/settlements', element: <SettlementListPage /> },
  { path: 'merchant/:merchantId/settlements/:settlementId', element: <SettlementDetailPage /> },
  { path: 'wallet', element: <WalletPage /> },
  { path: 'wallet/charge', element: <ChargeNewPage /> },
  { path: 'wallet/charges', element: <ChargeListPage /> },
  { path: 'wallet/charges/:chargeId', element: <ChargeDetailPage /> },
]

// 로그인이 필요한 화면은 RequireAuth 아래, 역할에 맞는 RequireRole 아래에 경로를 추가한다.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'signup', element: <SignupPage /> },
      { path: 'exchange-rates', element: <ExchangeRatePage /> },
      {
        element: <RequireAuth />,
        children: [
          // 일반회원·관리자 공통
          { path: 'account/password', element: <PasswordChangePage /> },
          {
            path: 'admin',
            element: <RequireRole role="MASTER" />,
            children: [
              { index: true, element: <AdminHomePage /> },
              { path: 'reviews', element: <AdminReviewListPage /> },
              { path: 'reviews/:kind/:targetId', element: <AdminReviewDetailPage /> },
              { path: 'merchants/new', element: <AdminMerchantNewPage /> },
              { path: 'transfers', element: <AdminTransferListPage /> },
              { path: 'transfers/:transferId', element: <AdminTransferDetailPage /> },
              { path: 'charges', element: <AdminChargeListPage /> },
              { path: 'charges/reconciliations', element: <AdminReconciliationListPage /> },
              { path: 'charges/reconciliations/:runId', element: <AdminReconciliationDetailPage /> },
              { path: 'charges/:chargeId/review', element: <AdminChargeReviewPage /> },
              { path: 'resolutions', element: <AdminResolutionListPage /> },
              { path: 'resolutions/:domain/:targetId', element: <AdminResolutionDetailPage /> },
              { path: 'refund-requests/overdue', element: <AdminOverdueRefundListPage /> },
            ],
          },
          { element: <RequireRole role="USER" />, children: userRoutes },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
