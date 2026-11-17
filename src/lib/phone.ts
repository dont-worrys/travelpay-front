/**
 * 휴대폰 번호 입력을 입력하는 동안 010-1234-5678 모양으로 맞춘다.
 * 회원가입 API는 하이픈까지 포함한 `010-[0-9]{4}-[0-9]{4}`만 받으므로, 숫자만 넣어도 그 형식으로 보내지게 한다.
 * 숫자가 아닌 글자는 버리고 11자리에서 자르며, 하이픈은 다음 자리 숫자가 들어올 때 붙인다(지울 때 하이픈에 걸리지 않음).
 */
export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) {
    return digits
  }
  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}
