import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'

/**
 * 페이지 하나를 메모리 라우터로 그린다. 이동 결과를 확인할 수 있도록 다른 경로는 경로 이름을 그대로 보여 준다.
 */
export function renderRoute(path: string, element: ReactElement, initialEntry: string) {
  const router = createMemoryRouter(
    [
      { path, element },
      { path: '*', Component: () => <p data-testid="navigated">navigated</p> },
    ],
    { initialEntries: [initialEntry] },
  )
  const result = render(<RouterProvider router={router} />)
  return { ...result, router }
}
