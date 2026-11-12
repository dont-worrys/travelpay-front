import { parseAmount, toAmountInput } from '../lib/money'

/** 원화 금액 프리셋(최소 단위 = 원). */
const KRW_PRESETS = [100_000, 300_000, 500_000]

function presetLabel(amount: number): string {
  return `+${amount / 10_000}만`
}

/**
 * 원화 금액 입력 아래의 프리셋 칩. 누르면 지금 입력한 금액에 더한다(입력이 비었거나 잘못됐으면 0에서 시작).
 * 금액 검증·한도는 기존 폼과 서버가 그대로 판단한다.
 */
export function AmountPresets({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  function add(amount: number) {
    const parsed = parseAmount(value, 'KRW')
    const base = parsed.ok ? parsed.minor : 0
    onChange(toAmountInput(base + amount, 'KRW'))
  }

  return (
    <div className="preset-chips" role="group" aria-label="금액 빠르게 더하기">
      {KRW_PRESETS.map((amount) => (
        <button
          key={amount}
          type="button"
          className="chip"
          onClick={() => add(amount)}
          aria-label={`${amount / 10_000}만 원 더하기`}
        >
          {presetLabel(amount)}
        </button>
      ))}
    </div>
  )
}
