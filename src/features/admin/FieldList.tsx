import { Fragment } from 'react'
import type { ReviewField } from './reviews'

/** 관리자 화면의 항목 목록(`dl.info`). `code`인 값은 고정폭으로 보여 준다. */
export function FieldList({ fields }: { fields: ReviewField[] }) {
  return (
    <dl className="info">
      {fields.map((field) => (
        <Fragment key={field.label}>
          <dt>{field.label}</dt>
          <dd>{field.code ? <code>{field.value}</code> : field.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}
