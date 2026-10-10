import type { EmailTemplate } from './types'

/**
 * Tiny template language used by emails and the call script:
 *   {{param}}                                  → value (empty if missing)
 *   {{#if param}}…{{else}}…{{/if}}             → when the parameter has any value
 *   {{#if niche = bildekor|wrap}}…{{/if}}      → when the value equals one of the options (case-insensitive)
 * Blocks can't be nested. Keep in sync with public/api/lib/template.php
 */
const IF_BLOCK = /\{\{#if (\w+)(?:\s*=\s*([^}]+?))?\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g

export function resolveConditionals(tpl: string, vars: Record<string, string>) {
  return tpl.replace(IF_BLOCK, (_, key: string, options: string | undefined, yes: string, no?: string) => {
    const value = (vars[key] ?? '').trim().toLowerCase()
    const hit = options
      ? options.split('|').some((o) => o.trim().toLowerCase() === value)
      : value !== ''
    return hit ? yes : no ?? ''
  })
}

/** Appended to every outreach email (server adds it on send). Mirrored in public/api/lib/template.php */
export const OPT_OUT_FOOTER = '\n\n—\nVill du inte få fler mejl från oss? Svara "avregistrera" så tar vi bort er från listan.'

export const VAR_PATTERN = /\{\{\s*(\w+)\s*\}\}/g

export function renderTemplate(tpl: string, vars: Record<string, string>) {
  return resolveConditionals(tpl, vars).replace(VAR_PATTERN, (_, key: string) => vars[key] ?? '')
}

/** Template whose niche list contains the lead's niche, else the default one. */
export function pickTemplate(templates: EmailTemplate[], niche: string | null) {
  const n = (niche ?? '').toLowerCase()
  return (
    templates.find((t) => t.niches.some((x) => x.toLowerCase() === n)) ??
    templates.find((t) => t.is_default) ??
    templates[0] ??
    null
  )
}
