import { LEAD_CSV_COLUMNS, type Lead } from './types'

/** Swedish registry names often include middle names ("Lars Mikael Ahlbeck") — use first + last. */
export function splitName(full: string | null | undefined) {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  return { first: parts[0], last: parts.length > 1 ? parts[parts.length - 1] : '' }
}

export function prettyWebsite(url: string | null | undefined) {
  return (url ?? '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
}

export function telHref(phone: string | null | undefined) {
  return 'tel:' + (phone ?? '').replace(/[^\d+]/g, '')
}

function yearsSince(date: string | null | undefined, now = new Date()) {
  const y = Number((date ?? '').slice(0, 4))
  return y > 1800 ? String(now.getFullYear() - y) : ''
}

/**
 * Every parameter available to the call script and email templates: all leads.csv
 * columns as-is, plus friendlier derived values. Keep in sync with public/api/lib/template.php
 */
export function leadVars(lead: Lead, agentName: string): Record<string, string> {
  const { first, last } = splitName(lead.kontaktperson)
  const raw = Object.fromEntries(LEAD_CSV_COLUMNS.map((c) => [c, lead[c] ?? '']))
  return {
    ...raw,
    agent_name: agentName,
    kontaktperson: [first, last].filter(Boolean).join(' '),
    kontaktperson_fullt: lead.kontaktperson ?? '',
    first_name: first,
    last_name: last,
    website: prettyWebsite(lead.website),
    ar_i_branschen: yearsSince(lead.registreringsdatum),
    registreringsar: (lead.registreringsdatum ?? '').slice(0, 4),
    om_foretaget: lead.om_foretaget ?? '',
    specialitet: lead.specialitet ?? '',
  }
}

export interface Parameter {
  key: string
  label: string
  group: 'Kontaktperson' | 'Företag' | 'Webb' | 'Bolagsverket' | 'Avsändare'
}

/** Shown in the template editor, grouped. Every key here is a {{key}} parameter. */
export const PARAMETERS: Parameter[] = [
  { key: 'first_name', label: 'Förnamn', group: 'Kontaktperson' },
  { key: 'last_name', label: 'Efternamn', group: 'Kontaktperson' },
  { key: 'kontaktperson', label: 'Namn', group: 'Kontaktperson' },
  { key: 'kontaktperson_fullt', label: 'Fullständigt namn', group: 'Kontaktperson' },
  { key: 'kontaktperson_roll', label: 'Roll', group: 'Kontaktperson' },

  { key: 'company_name', label: 'Företag', group: 'Företag' },
  { key: 'niche', label: 'Nisch', group: 'Företag' },
  { key: 'city', label: 'Ort', group: 'Företag' },
  { key: 'lan', label: 'Län', group: 'Företag' },
  { key: 'website', label: 'Webbplats', group: 'Företag' },
  { key: 'email', label: 'E-post', group: 'Företag' },
  { key: 'phone', label: 'Telefon', group: 'Företag' },
  { key: 'source_query', label: 'Sökord (källa)', group: 'Företag' },

  { key: 'om_foretaget', label: 'Om företaget', group: 'Webb' },
  { key: 'specialitet', label: 'Specialitet', group: 'Webb' },

  { key: 'bolagsnamn', label: 'Bolagsnamn', group: 'Bolagsverket' },
  { key: 'org_nr', label: 'Org.nr', group: 'Bolagsverket' },
  { key: 'bolagstyp', label: 'Bolagstyp', group: 'Bolagsverket' },
  { key: 'registreringsdatum', label: 'Registrerad', group: 'Bolagsverket' },
  { key: 'registreringsar', label: 'Registreringsår', group: 'Bolagsverket' },
  { key: 'ar_i_branschen', label: 'År i branschen', group: 'Bolagsverket' },
  { key: 'momsregistrerad', label: 'Momsregistrerad', group: 'Bolagsverket' },
  { key: 'f_skatt', label: 'F-skatt', group: 'Bolagsverket' },
  { key: 'arbetsgivarregistrerad', label: 'Arbetsgivare', group: 'Bolagsverket' },

  { key: 'agent_name', label: 'Ditt namn', group: 'Avsändare' },
]
