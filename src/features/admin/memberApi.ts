import { apiRequest } from '../../api'
import type { TermItem, UserRole, UserStatus } from '../auth/api'

/**
 * 관리자 회원·약관 API(user-service). 백엔드 `docs/guide/user-service.md` "관리자 API" 기준.
 * 회원 정지·해제는 같은 상태면 바꾸지 않고 현재 상태를 돌려주고, 세션 종료는 세션 버전만 올리므로
 * 결과를 모를 때 다시 보내도 결과가 같다. 약관 등록은 같은 코드·버전을 다시 보내면 409라 두 번 생기지 않는다.
 */

/** 회원 검색·약관 목록 응답. 전체 개수 없이 다음 페이지 유무만 준다. */
export interface SlicePage<T> {
  items: T[]
  page: number
  size: number
  hasNext: boolean
}

/** 검색 결과 회원. 이름·이메일·번호는 서버가 가려서 준다(비밀번호 로그인 수단이 없으면 이메일 null). */
export interface AdminMember {
  userId: string
  maskedRealName: string
  maskedEmail: string | null
  maskedPhone: string
  status: UserStatus
  role: UserRole
}

/** 값을 준 조건만 정확히 일치로 찾는다. 빈 값은 조건 없음. */
export interface AdminMemberQuery {
  userId?: string
  loginEmail?: string
  phone?: string
  status?: UserStatus
  page?: number
  size?: number
}

/** 관리자가 지정할 수 있는 상태. `CLOSED`는 지정할 수 없다. */
export type AdminMemberStatusTarget = 'ACTIVE' | 'SUSPENDED'

export function searchAdminMembers(query: AdminMemberQuery, signal?: AbortSignal): Promise<SlicePage<AdminMember>> {
  return apiRequest('/api/v1/admin/users', { query: { ...query }, signal })
}

/** 정지·해제. 상태가 바뀌면 대상의 기존 세션이 끝난다(정지 중 403, 해제 뒤 401). */
export function changeAdminMemberStatus(
  userId: string,
  status: AdminMemberStatusTarget,
): Promise<{ userId: string; status: UserStatus }> {
  return apiRequest(`/api/v1/admin/users/${encodeURIComponent(userId)}/status`, { method: 'PATCH', body: { status } })
}

/** 대상 회원의 기존 세션을 모두 끝낸다(다음 요청부터 401). 새 로그인은 막지 않는다. */
export function endAdminMemberSessions(userId: string): Promise<{ userId: string; scope: string }> {
  return apiRequest(`/api/v1/admin/users/${encodeURIComponent(userId)}/sessions`, { method: 'DELETE' })
}

// ---- 약관 ----

export interface AdminTermsQuery {
  termsCode?: string
  page?: number
  size?: number
}

export interface TermsPublishInput {
  termsCode: string
  termsVersion: string
  title: string
  content: string
  isRequired: boolean
  /** ISO-8601 UTC. 등록 시점보다 1분 이상 뒤여야 한다. */
  effectiveAt: string
}

/** 약관 코드 순, 같은 코드는 시행 시각 최신 순. 지난·시행 예정 버전도 모두 포함한다. */
export function fetchAdminTerms(query: AdminTermsQuery, signal?: AbortSignal): Promise<SlicePage<TermItem>> {
  return apiRequest('/api/v1/admin/terms', { query: { ...query }, signal })
}

/** 새 약관 버전 등록(201). 게시한 버전을 고치거나 지우는 API는 없다. */
export function publishAdminTerms(input: TermsPublishInput): Promise<TermItem> {
  return apiRequest('/api/v1/admin/terms', { method: 'POST', body: input })
}

/** 서버 약관 코드 규칙(`AdminTermsPublishRequest`): 대문자로 시작하는 대문자·숫자·밑줄 40자 이내. */
export const TERMS_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,39}$/
export const TERMS_VERSION_MAX = 40
export const TERMS_TITLE_MAX = 200
/** 시행 시각은 등록 시점보다 1분 이상 뒤여야 한다. */
export const TERMS_MIN_LEAD_MS = 60_000
