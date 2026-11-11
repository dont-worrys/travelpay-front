/**
 * 최근 연 가맹점 ID. 내 가맹점 목록 API가 없어 이 브라우저에만 편의로 기억한다.
 * 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 조용히 빈 목록으로 동작한다.
 */
const STORAGE_KEY = 'travelpay.recentMerchants'
const MAX_ITEMS = 5

export interface RecentMerchant {
  merchantId: string
  currency: string
}

export function loadRecentMerchants(): RecentMerchant[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(
      (item): item is RecentMerchant =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as RecentMerchant).merchantId === 'string' &&
        typeof (item as RecentMerchant).currency === 'string',
    )
  } catch {
    return []
  }
}

export function rememberMerchant(merchant: RecentMerchant): void {
  try {
    const rest = loadRecentMerchants().filter(
      (item) => item.merchantId.toLowerCase() !== merchant.merchantId.toLowerCase(),
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify([merchant, ...rest].slice(0, MAX_ITEMS)))
  } catch {
    // 기억하지 못해도 화면 동작에는 문제가 없다.
  }
}

export function forgetMerchant(merchantId: string): void {
  try {
    const rest = loadRecentMerchants().filter((item) => item.merchantId.toLowerCase() !== merchantId.toLowerCase())
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest))
  } catch {
    // 무시
  }
}
