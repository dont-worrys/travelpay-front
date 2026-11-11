/**
 * 금전 처리 POST의 `Idempotency-Key`(UUID v4).
 * 사용자 동작 한 번에 하나를 만들고, 응답을 받지 못해 다시 보낼 때는 같은 키와 같은 본문을 쓴다.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // randomUUID는 보안 컨텍스트(HTTPS·localhost)에서만 있다. 그 밖에서는 같은 형식으로 만든다.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
