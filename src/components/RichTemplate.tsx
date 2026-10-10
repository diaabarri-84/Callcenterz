import { Fragment } from 'react'
import { resolveConditionals } from '../lib/template'

/**
 * Renders template text with every filled-in parameter highlighted, and missing
 * ones flagged in red, so it's obvious what was tailored for this lead.
 */
export function RichTemplate({ text, vars }: { text: string; vars: Record<string, string> }) {
  const parts = resolveConditionals(text, vars).split(/(\{\{\s*\w+\s*\}\})/)
  return (
    <>
      {parts.map((p, i) => {
        const key = p.match(/^\{\{\s*(\w+)\s*\}\}$/)?.[1]
        if (!key) return <Fragment key={i}>{p}</Fragment>
        return vars[key]
          ? <mark key={i} className="var" title={`{{${key}}}`}>{vars[key]}</mark>
          : <mark key={i} className="var var-missing" title="Saknas för detta lead">[{key}]</mark>
      })}
    </>
  )
}
