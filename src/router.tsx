import { createBrowserRouter } from 'react-router'
import { AppLayout } from './components/AppLayout'
import { RequireAuth } from './features/auth/RequireAuth'
import { ChargeDetailPage } from './pages/ChargeDetailPage'
import { ChargeListPage } from './pages/ChargeListPage'
import { ChargeNewPage } from './pages/ChargeNewPage'
import { ExchangeDetailPage } from './pages/ExchangeDetailPage'
import { ExchangeListPage } from './pages/ExchangeListPage'
import { ExchangeNewPage } from './pages/ExchangeNewPage'
import { ExchangeRatePage } from './pages/ExchangeRatePage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MerchantEntryPage } from './pages/MerchantEntryPage'
import { MerchantHomePage } from './pages/MerchantHomePage'
import { MerchantPaymentDetailPage } from './pages/MerchantPaymentDetailPage'
import { MyPage } from './pages/MyPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PaymentDetailPage } from './pages/PaymentDetailPage'
import { PaymentListPage } from './pages/PaymentListPage'
import { PaymentNewPage } from './pages/PaymentNewPage'
import { SettlementDetailPage } from './pages/SettlementDetailPage'
import { SettlementListPage } from './pages/SettlementListPage'
import { SignupPage } from './pages/SignupPage'
import { TransferDetailPage } from './pages/TransferDetailPage'
import { TransferListPage } from './pages/TransferListPage'
import { TransferNewPage } from './pages/TransferNewPage'
import { WalletPage } from './pages/WalletPage'

// 로그인이 필요한 화면은 RequireAuth 아래에 경로를 추가한다.
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
          { path: 'merchant', element: <MerchantEntryPage /> },
          { path: 'merchant/:merchantId', element: <MerchantHomePage /> },
          { path: 'merchant/:merchantId/payments/:paymentId', element: <MerchantPaymentDetailPage /> },
          { path: 'merchant/:merchantId/settlements', element: <SettlementListPage /> },
          { path: 'merchant/:merchantId/settlements/:settlementId', element: <SettlementDetailPage /> },
          { path: 'wallet', element: <WalletPage /> },
          { path: 'wallet/charge', element: <ChargeNewPage /> },
          { path: 'wallet/charges', element: <ChargeListPage /> },
          { path: 'wallet/charges/:chargeId', element: <ChargeDetailPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
