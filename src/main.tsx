import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { PagePreloader } from './components/PagePreloader'
import { AuthProvider } from './features/auth/AuthContext'
import { installSmoothWheel } from './lib/smoothWheel'
import { router } from './router'
import './index.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('#root 요소가 없습니다.')
}

installSmoothWheel()

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
      <PagePreloader />
    </AuthProvider>
  </StrictMode>,
)
