import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AmountPresets } from './AmountPresets'
import { HistoryTabs } from './HistoryTabs'

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <input aria-label="금액" value={value} onChange={(e) => setValue(e.target.value)} />
      <AmountPresets value={value} onChange={setValue} />
    </>
  )
}

describe('AmountPresets', () => {
  it('지금 금액에 프리셋을 더한다', async () => {
    const user = userEvent.setup()
    render(<Harness initial="5,000" />)

    await user.click(screen.getByRole('button', { name: '10만 원 더하기' }))
    expect(screen.getByLabelText('금액')).toHaveValue('105000')
    await user.click(screen.getByRole('button', { name: '30만 원 더하기' }))
    expect(screen.getByLabelText('금액')).toHaveValue('405000')
  })

  it('입력이 비었거나 잘못됐으면 0에서 시작한다', async () => {
    const user = userEvent.setup()
    render(<Harness initial="abc" />)

    await user.click(screen.getByRole('button', { name: '50만 원 더하기' }))
    expect(screen.getByLabelText('금액')).toHaveValue('500000')
  })
})

describe('HistoryTabs', () => {
  it('도메인별 내역 화면으로 연결하고 지금 화면을 표시한다', () => {
    const router = createMemoryRouter([{ path: '*', element: <HistoryTabs /> }], { initialEntries: ['/transfers'] })
    render(<RouterProvider router={router} />)

    expect(screen.getByRole('link', { name: '충전' })).toHaveAttribute('href', '/wallet/charges')
    expect(screen.getByRole('link', { name: '환전' })).toHaveAttribute('href', '/exchanges')
    expect(screen.getByRole('link', { name: '결제' })).toHaveAttribute('href', '/payments')
    expect(screen.getByRole('link', { name: '송금' })).toHaveAttribute('aria-current', 'page')
  })
})
