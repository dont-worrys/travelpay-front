import { useEffect, type InputHTMLAttributes } from 'react'
import { CURRENCY_INFO, groupAmountInput, sanitizeAmountInput, type Currency } from '../lib/money'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'inputMode' | 'type'> & {
  currency: Currency
  /** 쉼표 없는 금액 문자열("1000000", "12.5"). `parseAmount`·`toAmountInput`과 같은 모양이다. */
  value: string
  onChange: (value: string) => void
}

/** 쉼표를 넣은 문자열에서 숫자·소수점 `count`개 바로 뒤의 위치. */
function positionAfter(text: string, count: number): number {
  let seen = 0
  for (let i = 0; i < text.length; i++) {
    if (seen === count) {
      return i
    }
    if (text[i] !== ',') {
      seen++
    }
  }
  return text.length
}

/**
 * 금액 입력 칸. 숫자(와 소수가 있는 통화의 소수점)만 들어가고 마이너스·문자는 입력되지 않으며,
 * 칸 안에서 세 자리마다 쉼표를 넣어 보여 줘 칸 아래에 금액을 다시 적지 않아도 읽힌다.
 * 쉼표가 생기고 없어져도 커서는 같은 숫자 뒤에 둔다. 통화가 바뀌거나 미리 채운 값이 규칙에 맞지 않으면
 * 보이는 값과 상태가 어긋나지 않게 상태도 거른 값으로 맞춘다.
 */
export function AmountInput({ currency, value, onChange, ...rest }: Props) {
  const sanitized = sanitizeAmountInput(value, currency)

  useEffect(() => {
    if (sanitized !== value) {
      onChange(sanitized)
    }
  }, [sanitized, value, onChange])

  return (
    <input
      placeholder="0"
      autoComplete="off"
      {...rest}
      inputMode={CURRENCY_INFO[currency].decimals > 0 ? 'decimal' : 'numeric'}
      value={groupAmountInput(sanitized)}
      onChange={(event) => {
        const input = event.target
        const caret = input.selectionStart ?? input.value.length
        const next = sanitizeAmountInput(input.value, currency)
        const display = groupAmountInput(next)
        const keep = Math.min(sanitizeAmountInput(input.value.slice(0, caret), currency).length, next.length)
        // React가 다시 그리기 전에 같은 값을 넣어 두면 값이 같아 덮어쓰지 않으므로 커서가 그대로 남는다.
        input.value = display
        const position = positionAfter(display, keep)
        input.setSelectionRange(position, position)
        onChange(next)
      }}
    />
  )
}
