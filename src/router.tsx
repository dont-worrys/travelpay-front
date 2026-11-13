import { lazy, type ComponentType } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout'
import { RouteError } from './components/RouteError'
import { RequireAuth } from './features/auth/RequireAuth'
import { RequireRole } from './features/auth/RequireRole'
import { loadChunk } from './lib/chunkReload'

/**
 * 화면(페이지)은 라우트마다 별도 청크로 나눠 처음 들어간 화면 코드만 내려받는다(#55).
 * 페이지 모듈은 이름 있는 내보내기라 `React.lazy`가 요구하는 default로 바꿔 준다.
 * 내려받는 동안의 로딩 표시는 `AppLayout`의 `Suspense`가 맡는다. 배포 직후 이전 청크를 받지 못하면
 * `loadChunk`가 1회 새로고침하고, 그래도 실패하면 `RouteError`가 안내한다.
 */
function lazyPage<K extends string>(load: () => Promise<{ [P in K]: ComponentType }>, name: K) {
  return lazy(() => loadChunk(load).then((module) => ({ default: module[name] })))
}

const AdminChargeListPage = lazyPage(() => import('./pages/admin/AdminChargeListPage'), 'AdminChargeListPage')
const AdminChargeReviewPage = lazyPage(() => import('./pages/admin/AdminChargeReviewPage'), 'AdminChargeReviewPage')
const AdminHomePage = lazyPage(() => import('./pages/admin/AdminHomePage'), 'AdminHomePage')
const AdminMemberListPage = lazyPage(() => import('./pages/admin/AdminMemberListPage'), 'AdminMemberListPage')
const AdminMerchantNewPage = lazyPage(() => import('./pages/admin/AdminMerchantNewPage'), 'AdminMerchantNewPage')
const AdminMerchantPaymentListPage = lazyPage(() => import('./pages/admin/AdminMerchantPaymentListPage'), 'AdminMerchantPaymentListPage')
const AdminOverdueRefundListPage = lazyPage(() => import('./pages/admin/AdminOverdueRefundListPage'), 'AdminOverdueRefundListPage')
const AdminPaymentDetailPage = lazyPage(() => import('./pages/admin/AdminPaymentDetailPage'), 'AdminPaymentDetailPage')
const AdminReconciliationDetailPage = lazyPage(() => import('./pages/admin/AdminReconciliationDetailPage'), 'AdminReconciliationDetailPage')
const AdminReconciliationListPage = lazyPage(() => import('./pages/admin/AdminReconciliationListPage'), 'AdminReconciliationListPage')
const AdminResolutionDetailPage = lazyPage(() => import('./pages/admin/AdminResolutionDetailPage'), 'AdminResolutionDetailPage')
const AdminResolutionListPage = lazyPage(() => import('./pages/admin/AdminResolutionListPage'), 'AdminResolutionListPage')
const AdminReviewDetailPage = lazyPage(() => import('./pages/admin/AdminReviewDetailPage'), 'AdminReviewDetailPage')
const AdminReviewListPage = lazyPage(() => import('./pages/admin/AdminReviewListPage'), 'AdminReviewListPage')
const AdminTermsListPage = lazyPage(() => import('./pages/admin/AdminTermsListPage'), 'AdminTermsListPage')
const AdminTermsNewPage = lazyPage(() => import('./pages/admin/AdminTermsNewPage'), 'AdminTermsNewPage')
const AdminTransferDetailPage = lazyPage(() => import('./pages/admin/AdminTransferDetailPage'), 'AdminTransferDetailPage')
const AdminTransferListPage = lazyPage(() => import('./pages/admin/AdminTransferListPage'), 'AdminTransferListPage')
const ChargeDetailPage = lazyPage(() => import('./pages/ChargeDetailPage'), 'ChargeDetailPage')
const ChargeListPage = lazyPage(() => import('./pages/ChargeListPage'), 'ChargeListPage')
const ChargeNewPage = lazyPage(() => import('./pages/ChargeNewPage'), 'ChargeNewPage')
const ExchangeDetailPage = lazyPage(() => import('./pages/ExchangeDetailPage'), 'ExchangeDetailPage')
const ExchangeListPage = lazyPage(() => import('./pages/ExchangeListPage'), 'ExchangeListPage')
const ExchangeNewPage = lazyPage(() => import('./pages/ExchangeNewPage'), 'ExchangeNewPage')
const ExchangeRatePage = lazyPage(() => import('./pages/ExchangeRatePage'), 'ExchangeRatePage')
const ExchangeReservationDetailPage = lazyPage(() => import('./pages/ExchangeReservationDetailPage'), 'ExchangeReservationDetailPage')
const ExchangeReservationListPage = lazyPage(() => import('./pages/ExchangeReservationListPage'), 'ExchangeReservationListPage')
const ExchangeReservationNewPage = lazyPage(() => import('./pages/ExchangeReservationNewPage'), 'ExchangeReservationNewPage')
const HomePage = lazyPage(() => import('./pages/HomePage'), 'HomePage')
const LoginPage = lazyPage(() => import('./pages/LoginPage'), 'LoginPage')
const MerchantEntryPage = lazyPage(() => import('./pages/MerchantEntryPage'), 'MerchantEntryPage')
const MerchantHomePage = lazyPage(() => import('./pages/MerchantHomePage'), 'MerchantHomePage')
const MerchantPaymentDetailPage = lazyPage(() => import('./pages/MerchantPaymentDetailPage'), 'MerchantPaymentDetailPage')
const MyPage = lazyPage(() => import('./pages/MyPage'), 'MyPage')
const NotFoundPage = lazyPage(() => import('./pages/NotFoundPage'), 'NotFoundPage')
const PaymentDetailPage = lazyPage(() => import('./pages/PaymentDetailPage'), 'PaymentDetailPage')
const PaymentListPage = lazyPage(() => import('./pages/PaymentListPage'), 'PaymentListPage')
const PasswordChangePage = lazyPage(() => import('./pages/PasswordChangePage'), 'PasswordChangePage')
const PaymentNewPage = lazyPage(() => import('./pages/PaymentNewPage'), 'PaymentNewPage')
const SettlementDepositListPage = lazyPage(() => import('./pages/SettlementDepositListPage'), 'SettlementDepositListPage')
const SettlementDetailPage = lazyPage(() => import('./pages/SettlementDetailPage'), 'SettlementDetailPage')
const SettlementListPage = lazyPage(() => import('./pages/SettlementListPage'), 'SettlementListPage')
const SignupPage = lazyPage(() => import('./pages/SignupPage'), 'SignupPage')
const TransferDetailPage = lazyPage(() => import('./pages/TransferDetailPage'), 'TransferDetailPage')
const TransferListPage = lazyPage(() => import('./pages/TransferListPage'), 'TransferListPage')
const TransferNewPage = lazyPage(() => import('./pages/TransferNewPage'), 'TransferNewPage')
const WalletPage = lazyPage(() => import('./pages/WalletPage'), 'WalletPage')

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

export const router = createBrowserRouter(routes)
