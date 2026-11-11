import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { isApiError, isOutcomeUnknown } from '../../api'
import type { TermItem } from '../../features/auth/api'
import { FieldList } from '../../features/admin/FieldList'
import { localDateTimeToIso } from '../../features/admin/input'
import {
  publishAdminTerms,
  TERMS_CODE_PATTERN,
  TERMS_MIN_LEAD_MS,
  TERMS_TITLE_MAX,
  TERMS_VERSION_MAX,
  type TermsPublishInput,
} from '../../features/admin/memberApi'
import { toAdminMessage } from '../../features/admin/reviews'
import { formatDateTime } from '../../lib/datetime'

type FieldName = keyof TermsPublishInput

/** 보내기 전 확인. 서버(`AdminTermsPublishRequest`·`AdminTermsService`)와 같은 규칙이며, 최종 판단은 서버가 한다. */
function validate(input: Omit<TermsPublishInput, 'effectiveAt'> & { effectiveAt: string | null | undefined }) {
  const errors: Partial<Record<FieldName, string>> = {}
  if (!TERMS_CODE_PATTERN.test(input.termsCode)) {
    errors.termsCode = '약관 코드는 대문자로 시작하는 40자 이내의 대문자·숫자·밑줄이어야 합니다.'
  }
  if (!input.termsVersion) {
    errors.termsVersion = '약관 버전을 입력해 주세요.'
  } else if (input.termsVersion.length > TERMS_VERSION_MAX) {
    errors.termsVersion = `약관 버전은 ${TERMS_VERSION_MAX}자 이내로 입력해 주세요.`
  }
  if (!input.title) {
    errors.title = '약관 제목을 입력해 주세요.'
  } else if ([...input.title].length > TERMS_TITLE_MAX) {
    errors.title = `약관 제목은 ${TERMS_TITLE_MAX}자 이내로 입력해 주세요.`
  }
  if (!input.content.trim()) {
    errors.content = '약관 본문을 입력해 주세요.'
  }
  if (input.effectiveAt === undefined) {
    errors.effectiveAt = '시행 시각을 입력해 주세요.'
  } else if (input.effectiveAt === null) {
    errors.effectiveAt = '시행 시각을 해석하지 못했습니다.'
  } else if (new Date(input.effectiveAt).getTime() < Date.now() + TERMS_MIN_LEAD_MS) {
    errors.effectiveAt = '시행 시각은 지금보다 1분 이상 뒤여야 합니다.'
  }
  return errors
}

/**
 * 새 약관 버전 등록. 등록한 버전은 고칠 수 없고, 시행 시각이 되면 가입 화면에 보인다.
 * 멱등성 키는 없지만 같은 코드·버전을 다시 보내면 409라, 결과를 모를 때 다시 보내도 두 번 생기지 않는다.
 */
export function AdminTermsNewPage() {
  const [searchParams] = useSearchParams()
  const [termsCode, setTermsCode] = useState(searchParams.get('termsCode') ?? '')
  const [termsVersion, setTermsVersion] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isRequired, setIsRequired] = useState(true)
  const [effectiveLocal, setEffectiveLocal] = useState('')

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [published, setPublished] = useState<TermItem | null>(null)

  const effectiveIso = localDateTimeToIso(effectiveLocal)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const draft = {
      termsCode: termsCode.trim(),
      termsVersion: termsVersion.trim(),
      title: title.trim(),
      content,
      isRequired,
      effectiveAt: effectiveIso,
    }
    const errors = validate(draft)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0 || !draft.effectiveAt) {
      setError(null)
      return
    }
    const input: TermsPublishInput = { ...draft, effectiveAt: draft.effectiveAt }
    const when = formatDateTime(input.effectiveAt)
    if (
      !window.confirm(
        `${input.termsCode} ${input.termsVersion} 버전을 등록할까요?\n${when}(한국 시간)부터 가입 화면에 보이며, 등록한 뒤에는 고치거나 지울 수 없습니다.`,
      )
    ) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      setPublished(await publishAdminTerms(input))
      setUncertain(false)
    } catch (cause) {
      const conflictAfterUnknown =
        uncertain && isApiError(cause) && cause.code === 'USER_TERMS_VERSION_CONFLICT'
      setUncertain(isOutcomeUnknown(cause))
      setFieldErrors(isApiError(cause) ? cause.fieldMessages() : {})
      if (isOutcomeUnknown(cause)) {
        setError(
          `${toAdminMessage(cause, '등록 결과를 확인하지 못했습니다.')} 등록됐는지 알 수 없습니다. 약관 목록에서 확인하거나 같은 내용으로 다시 보내 주세요(이미 등록됐으면 "같은 버전이 있음"으로 거절됩니다).`,
        )
      } else if (conflictAfterUnknown) {
        setError('앞서 결과를 모르던 요청으로 이미 등록됐을 수 있습니다. 약관 목록에서 확인해 주세요.')
      } else {
        setError(toAdminMessage(cause, '약관을 등록하지 못했습니다.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (published) {
    return (
      <section>
        <h1>약관 등록 완료</h1>
        <p className="notice" role="status">
          새 약관 버전을 등록했습니다. 시행 시각부터 가입 화면에 보입니다.
        </p>
        <FieldList
          fields={[
            { label: '약관 코드', value: published.termsCode, code: true },
            { label: '버전', value: published.termsVersion },
            { label: '제목', value: published.title },
            { label: '동의', value: published.isRequired ? '필수' : '선택' },
            { label: '시행 시각', value: `${formatDateTime(published.effectiveAt)} (${published.effectiveAt})` },
          ]}
        />
        <div className="actions">
          <Link to={`/admin/terms?termsCode=${encodeURIComponent(published.termsCode)}`}>이 코드의 버전 목록</Link>
          <Link to="/admin/terms">약관 목록</Link>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h1>새 약관 버전 등록</h1>
      <p className="hint">
        새 버전을 추가만 합니다. 등록한 버전은 고치거나 지울 수 없으니 본문과 시행 시각을 확인한 뒤 등록해 주세요.
      </p>

      <form className="form" onSubmit={handleSubmit} noValidate>
        <label>
          약관 코드
          <input
            value={termsCode}
            onChange={(event) => setTermsCode(event.target.value)}
            placeholder="예: SERVICE_TERMS"
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            disabled={submitting}
          />
          <span className="hint">대문자로 시작하는 대문자·숫자·밑줄 40자 이내. 기존 코드면 그 약관의 새 버전입니다.</span>
        </label>
        {fieldErrors.termsCode && <p className="field-error">{fieldErrors.termsCode}</p>}

        <label>
          버전
          <input
            value={termsVersion}
            onChange={(event) => setTermsVersion(event.target.value)}
            placeholder="예: 2027-01-01"
            maxLength={TERMS_VERSION_MAX}
            autoComplete="off"
            disabled={submitting}
          />
        </label>
        {fieldErrors.termsVersion && <p className="field-error">{fieldErrors.termsVersion}</p>}

        <label>
          제목
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={TERMS_TITLE_MAX}
            autoComplete="off"
            disabled={submitting}
          />
        </label>
        {fieldErrors.title && <p className="field-error">{fieldErrors.title}</p>}

        <label>
          본문
          <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={10} disabled={submitting} />
        </label>
        {fieldErrors.content && <p className="field-error">{fieldErrors.content}</p>}

        <label className="inline">
          <input
            type="checkbox"
            checked={isRequired}
            onChange={(event) => setIsRequired(event.target.checked)}
            disabled={submitting}
          />
          가입 때 필수 동의
        </label>
        {fieldErrors.isRequired && <p className="field-error">{fieldErrors.isRequired}</p>}

        <label>
          시행 시각 (이 브라우저 시간대)
          <input
            type="datetime-local"
            value={effectiveLocal}
            onChange={(event) => setEffectiveLocal(event.target.value)}
            disabled={submitting}
          />
          {effectiveIso && (
            <span className="hint">
              한국 시간 {formatDateTime(effectiveIso)} · 보낼 값 {effectiveIso}
            </span>
          )}
          <span className="hint">지금보다 1분 이상 뒤여야 합니다(서버 시각 기준).</span>
        </label>
        {fieldErrors.effectiveAt && <p className="field-error">{fieldErrors.effectiveAt}</p>}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? '등록 중…' : '등록'}
        </button>
      </form>
    </section>
  )
}
