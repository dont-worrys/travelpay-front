import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout'
import { RouteError } from './components/RouteError'
import { RequireAuth } from './features/auth/RequireAuth'
import { RequireRole } from './features/auth/RequireRole'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { lazyPage, preloadedPagesReady } from './lib/lazyPage'
import { withDefaultViewTransition } from './lib/viewTransition'

/**
 * 화면(페이지)은 라우트마다 별도 청크로 나누고 앱이 뜬 뒤 미리 받아 둔다(lib/lazyPage, #55).
 * 가장 먼저 열리는 홈·로그인만 첫 번들에 넣어 첫 화면에서 청크를 또 기다리지 않게 한다.
 */
const AdminChargeListPage = lazyPage(() => import('./pages/admin/AdminChargeListPage'), 'AdminChargeListPage', 'admin')
const AdminChargeReviewPage = lazyPage(() => import('./pages/admin/AdminChargeReviewPage'), 'AdminChargeReviewPage', 'admin')
const AdminHomePage = lazyPage(() => import('./pages/admin/AdminHomePage'), 'AdminHomePage', 'admin')
const AdminMemberListPage = lazyPage(() => import('./pages/admin/AdminMemberListPage'), 'AdminMemberListPage', 'admin')
const AdminMerchantNewPage = lazyPage(() => import('./pages/admin/AdminMerchantNewPage'), 'AdminMerchantNewPage', 'admin')
const AdminMerchantPaymentListPage = lazyPage(() => import('./pages/admin/AdminMerchantPaymentListPage'), 'AdminMerchantPaymentListPage', 'admin')
const AdminOverdueRefundListPage = lazyPage(() => import('./pages/admin/AdminOverdueRefundListPage'), 'AdminOverdueRefundListPage', 'admin')
const AdminPaymentDetailPage = lazyPage(() => import('./pages/admin/AdminPaymentDetailPage'), 'AdminPaymentDetailPage', 'admin')
const AdminReconciliationDetailPage = lazyPage(() => import('./pages/admin/AdminReconciliationDetailPage'), 'AdminReconciliationDetailPage', 'admin')
const AdminReconciliationListPage = lazyPage(() => import('./pages/admin/AdminReconciliationListPage'), 'AdminReconciliationListPage', 'admin')
const AdminResolutionDetailPage = lazyPage(() => import('./pages/admin/AdminResolutionDetailPage'), 'AdminResolutionDetailPage', 'admin')
const AdminResolutionListPage = lazyPage(() => import('./pages/admin/AdminResolutionListPage'), 'AdminResolutionListPage', 'admin')
const AdminReviewDetailPage = lazyPage(() => import('./pages/admin/AdminReviewDetailPage'), 'AdminReviewDetailPage', 'admin')
const AdminReviewListPage = lazyPage(() => import('./pages/admin/AdminReviewListPage'), 'AdminReviewListPage', 'admin')
const AdminTermsListPage = lazyPage(() => import('./pages/admin/AdminTermsListPage'), 'AdminTermsListPage', 'admin')
const AdminTermsNewPage = lazyPage(() => import('./pages/admin/AdminTermsNewPage'), 'AdminTermsNewPage', 'admin')
const AdminTransferDetailPage = lazyPage(() => import('./pages/admin/AdminTransferDetailPage'), 'AdminTransferDetailPage', 'admin')
const AdminTransferListPage = lazyPage(() => import('./pages/admin/AdminTransferListPage'), 'AdminTransferListPage', 'admin')
const ChargeDetailPage = lazyPage(() => import('./pages/ChargeDetailPage'), 'ChargeDetailPage', 'user')
const ChargeListPage = lazyPage(() => import('./pages/ChargeListPage'), 'ChargeListPage', 'user')
const ChargeNewPage = lazyPage(() => import('./pages/ChargeNewPage'), 'ChargeNewPage', 'user')
const ExchangeDetailPage = lazyPage(() => import('./pages/ExchangeDetailPage'), 'ExchangeDetailPage', 'user')
const ExchangeListPage = lazyPage(() => import('./pages/ExchangeListPage'), 'ExchangeListPage', 'user')
const ExchangeNewPage = lazyPage(() => import('./pages/ExchangeNewPage'), 'ExchangeNewPage', 'user')
const ExchangeRatePage = lazyPage(() => import('./pages/ExchangeRatePage'), 'ExchangeRatePage', 'public')
const ExchangeReservationDetailPage = lazyPage(() => import('./pages/ExchangeReservationDetailPage'), 'ExchangeReservationDetailPage', 'user')
const ExchangeReservationListPage = lazyPage(() => import('./pages/ExchangeReservationListPage'), 'ExchangeReservationListPage', 'user')
const ExchangeReservationNewPage = lazyPage(() => import('./pages/ExchangeReservationNewPage'), 'ExchangeReservationNewPage', 'user')
const MerchantEntryPage = lazyPage(() => import('./pages/MerchantEntryPage'), 'MerchantEntryPage', 'user')
const MerchantHomePage = lazyPage(() => import('./pages/MerchantHomePage'), 'MerchantHomePage', 'user')
const MerchantPaymentDetailPage = lazyPage(() => import('./pages/MerchantPaymentDetailPage'), 'MerchantPaymentDetailPage', 'user')
const MyPage = lazyPage(() => import('./pages/MyPage'), 'MyPage', 'user')
const NotFoundPage = lazyPage(() => import('./pages/NotFoundPage'), 'NotFoundPage', 'public')
const PaymentDetailPage = lazyPage(() => import('./pages/PaymentDetailPage'), 'PaymentDetailPage', 'user')
const PaymentListPage = lazyPage(() => import('./pages/PaymentListPage'), 'PaymentListPage', 'user')
const PasswordChangePage = lazyPage(() => import('./pages/PasswordChangePage'), 'PasswordChangePage', 'public')
const PaymentNewPage = lazyPage(() => import('./pages/PaymentNewPage'), 'PaymentNewPage', 'user')
const SettlementDepositListPage = lazyPage(() => import('./pages/SettlementDepositListPage'), 'SettlementDepositListPage', 'user')
const SettlementDetailPage = lazyPage(() => import('./pages/SettlementDetailPage'), 'SettlementDetailPage', 'user')
const SettlementListPage = lazyPage(() => import('./pages/SettlementListPage'), 'SettlementListPage', 'user')
const SignupPage = lazyPage(() => import('./pages/SignupPage'), 'SignupPage', 'public')
const TransferDetailPage = lazyPage(() => import('./pages/TransferDetailPage'), 'TransferDetailPage', 'user')
const TransferListPage = lazyPage(() => import('./pages/TransferListPage'), 'TransferListPage', 'user')
const TransferNewPage = lazyPage(() => import('./pages/TransferNewPage'), 'TransferNewPage', 'user')
const WalletPage = lazyPage(() => import('./pages/WalletPage'), 'WalletPage', 'user')

/** 일반회원 화면. 관리자(`MASTER`)에게는 제공하지 않는다. */
const userRoutes: RouteObject[] = [
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
  { path: 'wallet/settlements', element: <SettlementDepositListPage /> },
  { path: 'wallet/charges/:chargeId', element: <ChargeDetailPage /> },
]

// 로그인이 필요한 화면은 RequireAuth 아래, 역할에 맞는 RequireRole 아래에 경로를 추가한다.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        // 경로 없는 묶음: 화면 오류를 본문 자리에서 처리해 헤더·탭바를 남긴다(청크 로딩 실패만 안내, 그 밖은 다시 던짐).
        errorElement: <RouteError />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'login', element: <LoginPage /> },
          { path: 'signup', element: <SignupPage /> },
          { path: 'exchange-rates', element: <ExchangeRatePage /> },
          {
            element: <RequireAuth />,
            children: [
              // 일반회원·관리자 공통
              { path: 'me', element: <MyPage /> },
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
                  { path: 'payments', element: <AdminMerchantPaymentListPage /> },
                  { path: 'merchants/:merchantId/payments/:paymentId', element: <AdminPaymentDetailPage /> },
                  { path: 'users', element: <AdminMemberListPage /> },
                  { path: 'terms', element: <AdminTermsListPage /> },
                  { path: 'terms/new', element: <AdminTermsNewPage /> },
                ],
              },
              { element: <RequireRole role="USER" />, children: userRoutes },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]

export const router = withDefaultViewTransition(createBrowserRouter(routes), preloadedPagesReady)
