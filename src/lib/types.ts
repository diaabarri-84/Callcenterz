export type LeadStatus = 'new' | 'no_answer' | 'rescheduled' | 'booked' | 'not_interested'
export type Outcome = 'no_answer' | 'another_day' | 'booked' | 'not_interested'
export type ScriptAnswer = 'A' | 'B' | 'C' | 'D'

/** Columns exactly as they appear in contactlista/leads.csv. */
export const LEAD_CSV_COLUMNS = [
  'company_name', 'email', 'phone', 'niche', 'city', 'website', 'source_query',
  'bolagsnamn', 'org_nr', 'bolagstyp', 'registreringsdatum', 'momsregistrerad',
  'f_skatt', 'arbetsgivarregistrerad', 'lan', 'enrich_source_url',
  'enrich_match_confidence', 'kontaktperson', 'kontaktperson_roll',
] as const

/** Optional columns produced by the web enrichment (Brave Search); merged into existing leads on import. */
export const ENRICHMENT_COLUMNS = ['om_foretaget', 'specialitet'] as const

export type LeadCsvColumn = (typeof LEAD_CSV_COLUMNS)[number]
export type EnrichmentColumn = (typeof ENRICHMENT_COLUMNS)[number]
export type LeadInsert = { dedupe_key: string } & Record<LeadCsvColumn, string | null> & Partial<Record<EnrichmentColumn, string | null>>

export interface Lead extends LeadInsert {
  id: string
  om_foretaget: string | null
  specialitet: string | null
  webb_berikad_at: string | null
  email_opt_out: boolean
  emails_sent: number
  last_emailed_at: string | null
  status: LeadStatus
  next_call_at: string | null
  queue_rank: number
  attempts: number
  last_called_at: string | null
  last_outcome: Outcome | null
  script_answer: ScriptAnswer | null
  notes: string | null
}

export interface Booking {
  id: string
  lead_id: string
  agent_id: string | null
  starts_at: string
  ends_at: string
  title: string
  notes: string | null
  lead?: Pick<Lead, 'company_name' | 'kontaktperson' | 'phone'> | null
}

export interface EmailTemplate {
  id: string
  name: string
  niches: string[]
  subject: string
  body: string
  is_default: boolean
}

export interface Agent {
  id: string
  display_name: string
  role: 'agent' | 'admin'
}

/** Agent as managed by an admin (Agenter page). password is only sent when set/changed. */
export interface AgentAccount extends Agent {
  email: string
  active: boolean
  last_login_at: string | null
  password?: string
}

export interface LogOutcomeInput {
  leadId: string
  outcome: Outcome
  nextCallAt: string | null
  scriptAnswer: ScriptAnswer | null
  notes: string | null
}

export interface QueueStats {
  dueNow: number
  later: number
  booked: number
  done: number
  total: number
}

export interface BulkSendResult {
  sent: number
  skipped: { id: string; reason: string }[]
  failed: { id: string; reason: string }[]
  stopped: 'daily_limit' | null
  daily_remaining: number
}

export type MailFolder = 'inbox' | 'sentitems'

export interface MailAddress {
  emailAddress: { name?: string; address: string }
}

/** A message in the cPanel mailbox, read over IMAP (id = "inbox:<uid>" / "sentitems:<uid>"). */
export interface MailMessage {
  id: string
  subject: string
  from?: MailAddress
  toRecipients: MailAddress[]
  receivedDateTime?: string
  sentDateTime?: string
  bodyPreview: string
  isRead: boolean
  conversationId?: string
  body?: { contentType: string; content: string }
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Ny',
  no_answer: 'Svarade inte',
  rescheduled: 'En annan dag',
  booked: 'Bokat samtal',
  not_interested: 'Ej intresserad',
}
