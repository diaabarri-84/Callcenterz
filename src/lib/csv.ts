import Papa from 'papaparse'
import { ENRICHMENT_COLUMNS, LEAD_CSV_COLUMNS, type LeadCsvColumn, type LeadInsert } from './types'

export function dedupeKey(row: Pick<LeadInsert, 'phone' | 'org_nr' | 'company_name'>) {
  const phone = (row.phone ?? '').replace(/\D/g, '')
  if (phone) return `tel:${phone}`
  if (row.org_nr) return `org:${row.org_nr.replace(/\D/g, '')}`
  return `name:${(row.company_name ?? '').trim().toLowerCase()}`
}

/** Parses leads.csv (same header row as the lead-gen scripts produce). Duplicates are dropped. */
export async function parseLeadsCsv(file: File): Promise<LeadInsert[]> {
  const { data } = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: true })
  const seen = new Set<string>()
  const rows: LeadInsert[] = []
  for (const raw of data) {
    if (!raw.company_name?.trim()) continue
    const cols = Object.fromEntries(
      LEAD_CSV_COLUMNS.map((c) => [c, raw[c]?.trim() || null]),
    ) as Record<LeadCsvColumn, string | null>
    const key = dedupeKey(cols)
    if (seen.has(key)) continue
    seen.add(key)
    const extra = Object.fromEntries(ENRICHMENT_COLUMNS.filter((c) => raw[c]?.trim()).map((c) => [c, raw[c].trim()]))
    rows.push({ ...cols, ...extra, dedupe_key: key })
  }
  return rows
}
