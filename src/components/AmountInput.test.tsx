import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Currency } from '../lib/money'
import { AmountInput } from './AmountInput'

function Harness({ currency, initial = '', onValue }: { currency: Currency; initial?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <label>
      금액
      <AmountInput
        currency={currency}
        value={value}
        onChange={(next) => {
          setValue(next)
          onValue?.(next)
        }}
      />
      <output aria-label="상태">{value}</output>
    </label>
  )
}

function setup(currency: Currency, initial?: string) {
  const onValue = vi.fn()
  const view = render(<Harness currency={currency} initial={initial} onValue={onValue} />)
  return { user: userEvent.setup(), input: screen.getByRole('textbox', { name: /금액/ }), onValue, view }
}

describe('AmountInput', () => {
  it('칸 안에서 세 자리마다 쉼표를 넣어 보여 주고, 상태에는 쉼표 없는 숫자를 둔다', async () => {
    const { user, input } = setup('KRW')

    await user.type(input, '1000000')

    expect(input).toHaveValue('1,000,000')
    expect(screen.getByLabelText('상태')).toHaveTextContent('1000000')
  })

  it('마이너스·문자는 입력되지 않는다', async () => {
    const { user, input } = setup('KRW')

    await user.type(input, '-12a3원')

    expect(input).toHaveValue('123')
  })

  it('원화·엔화는 소수점을 받지 않고, 위안화는 소수 둘째 자리까지 받는다', async () => {
    const krw = setup('KRW')
    await krw.user.type(krw.input, '12.5')
    expect(krw.input).toHaveValue('125')
    krw.view.unmount()

    const cny = setup('CNY')
    await cny.user.type(cny.input, '1234.567')
    expect(cny.input).toHaveValue('1,234.56')
  })

  it('가운데에 숫자를 넣어 쉼표 위치가 바뀌어도 커서는 넣은 숫자 바로 뒤에 있다', async () => {
    const { user, input } = setup('KRW', '1000')
    expect(input).toHaveValue('1,000')

    await user.type(input, '5', { initialSelectionStart: 1, initialSelectionEnd: 1 })

    expect(input).toHaveValue('15,000')
    expect((input as HTMLInputElement).selectionStart).toBe(2)
  })

  it('규칙에 맞지 않는 미리 채운 값(링크로 받은 값 등)은 상태도 거른 값으로 맞춘다', async () => {
    const { input, onValue } = setup('KRW', '-1,000원')

    expect(input).toHaveValue('1,000')
    await vi.waitFor(() => expect(onValue).toHaveBeenCalledWith('1000'))
    expect(screen.getByLabelText('상태')).toHaveTextContent('1000')
  })
})
