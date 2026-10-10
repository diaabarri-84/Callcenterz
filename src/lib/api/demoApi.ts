import { dedupeKey } from '../csv'
import { leadVars } from '../leadVars'
import { renderTemplate } from '../template'
import { ENRICHMENT_COLUMNS, type Booking, type EmailTemplate, type Lead, type LeadInsert, type LeadStatus, type MailFolder, type MailMessage } from '../types'
import type { Api } from './types'
import { DEMO_LEADS, DEFAULT_TEMPLATES, demoMail } from './demoSeed'

// Browser-only backend for `npm run dev` on your own computer (no PHP server).
// Data lives in localStorage of this browser and is never uploaded anywhere.

const KEY = 'reklamx-cc-demo-v5'

interface DemoDb {
  leads: Lead[]
  bookings: Booking[]
  templates: EmailTemplate[]
  mail: Record<MailFolder, MailMessage[]>
  nextRank: number
}

function enrichment(row: LeadInsert) {
  return { om_foretaget: row.om_foretaget ?? null, specialitet: row.specialitet ?? null }
}

function toLead(row: LeadInsert, rank: number): Lead {
  return {
    ...row,
    id: crypto.randomUUID(),
    email_opt_out: false, emails_sent: 0, last_emailed_at: null,
    ...enrichment(row), webb_berikad_at: null,
    status: 'new', next_call_at: null, queue_rank: rank, attempts: 0,
    last_called_at: null, last_outcome: null, script_answer: null, notes: null,
  }
}

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* fall through to seed */ }
  const leads = DEMO_LEADS.map((l, i) => toLead({ ...l, dedupe_key: dedupeKey(l) }, i + 1))
  return {
    leads,
    bookings: [],
    templates: DEFAULT_TEMPLATES.map((t) => ({ ...t, id: crypto.randomUUID() })),
    mail: demoMail(),
    nextRank: leads.length + 1,
  }
}

export function createDemoApi(agentName: () => string): Api {
  let db = load()
  let current: string | null = null // the lead on the agent's screen (the server locks it instead)
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* storage full/blocked: keep in memory */ }
  }
  const due = (l: Lead, now: number) =>
    l.status !== 'not_interested' && !!l.phone && (!l.next_call_at || Date.parse(l.next_call_at) <= now)
  const queueOrder = (a: Lead, b: Lead) =>
    (a.next_call_at ? Date.parse(a.next_call_at) : Infinity) - (b.next_call_at ? Date.parse(b.next_call_at) : Infinity) ||
    a.queue_rank - b.queue_rank

  return {
    mode: 'demo',

    async getNextLead(exclude = []) {
      const now = Date.now()
      const next = db.leads.filter((l) => due(l, now) && !exclude.includes(l.id)).sort(queueOrder)[0] ?? null
      current = next?.id ?? null
      return next
    },

    async listUpcoming(exclude = []) {
      const now = Date.now()
      return db.leads.filter((l) => due(l, now) && l.id !== current && !exclude.includes(l.id)).sort(queueOrder).slice(0, 8)
    },

    async claimLead(id) {
      const lead = db.leads.find((l) => l.id === id)
      if (!lead) throw new Error('Lead saknas')
      current = id
      return lead
    },

    async logOutcome({ leadId, outcome, nextCallAt, scriptAnswer, notes }) {
      const lead = db.leads.find((l) => l.id === leadId)
      if (!lead) throw new Error('Lead saknas')
      const status: Record<typeof outcome, LeadStatus> = {
        no_answer: 'no_answer', another_day: 'rescheduled', booked: 'booked', not_interested: 'not_interested',
      }
      Object.assign(lead, {
        status: status[outcome],
        next_call_at: outcome === 'not_interested' ? null : nextCallAt,
        attempts: lead.attempts + 1,
        last_called_at: new Date().toISOString(),
        last_outcome: outcome,
        script_answer: scriptAnswer ?? lead.script_answer,
        notes: notes ? [lead.notes, `${new Date().toLocaleString('sv-SE').slice(0, 16)} — ${notes}`].filter(Boolean).join('\n') : lead.notes,
      })
      if (outcome === 'booked' && nextCallAt) {
        db.bookings.push({
          id: crypto.randomUUID(), lead_id: lead.id, agent_id: null,
          starts_at: nextCallAt, ends_at: new Date(Date.parse(nextCallAt) + 30 * 60_000).toISOString(),
          title: `Samtal: ${lead.company_name}`, notes,
        })
      }
      save()
    },

    async queueStats() {
      const now = Date.now()
      const active = db.leads.filter((l) => l.status !== 'not_interested')
      return {
        dueNow: active.filter((l) => !l.next_call_at || Date.parse(l.next_call_at) <= now).length,
        later: active.filter((l) => l.next_call_at && Date.parse(l.next_call_at) > now).length,
        booked: db.leads.filter((l) => l.status === 'booked').length,
        done: db.leads.length - active.length,
        total: db.leads.length,
      }
    },

    async listLeads() {
      return [...db.leads].sort((a, b) => a.queue_rank - b.queue_rank)
    },

    async updateLead(id, patch) {
      const lead = db.leads.find((l) => l.id === id)
      if (lead) Object.assign(lead, patch)
      save()
    },

    async importLeads(rows) {
      const byKey = new Map(db.leads.map((l) => [l.dedupe_key, l]))
      let inserted = 0
      let enriched = 0
      for (const r of rows) {
        const lead = byKey.get(r.dedupe_key)
        if (!lead) {
          db.leads.push(toLead(r, db.nextRank++))
          inserted++
        } else if (ENRICHMENT_COLUMNS.some((c) => r[c])) {
          for (const [k, v] of Object.entries(enrichment(r))) if (v != null) Object.assign(lead, { [k]: v })
          lead.webb_berikad_at = new Date().toISOString()
          enriched++
        }
      }
      save()
      return { inserted, enriched }
    },

    async listBookings(from, to) {
      return db.bookings
        .filter((b) => Date.parse(b.starts_at) >= +from && Date.parse(b.starts_at) < +to)
        .map((b) => ({ ...b, lead: db.leads.find((l) => l.id === b.lead_id) ?? null }))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    },

    async listScheduled(from, to) {
      return db.leads
        .filter((l) => (l.status === 'no_answer' || l.status === 'rescheduled') && l.next_call_at &&
          Date.parse(l.next_call_at) >= +from && Date.parse(l.next_call_at) < +to)
        .sort(queueOrder)
    },

    async listTemplates() {
      return [...db.templates].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name))
    },

    async saveTemplate(t) {
      const saved = { ...t, id: t.id ?? crypto.randomUUID() }
      db.templates = [...db.templates.filter((x) => x.id !== saved.id), saved]
      save()
      return saved
    },

    async deleteTemplate(id) {
      db.templates = db.templates.filter((t) => t.id !== id)
      save()
    },

    async sendBulk() {
      throw new Error('Massutskick fungerar bara på servern (outreach.reklamx.se).')
    },

    async listMail(folder, search) {
      const needle = search?.toLowerCase()
      const messages = db.mail[folder].filter((m) => !needle ||
        [m.subject, m.bodyPreview, m.from?.emailAddress.address, ...m.toRecipients.map((r) => r.emailAddress.address)]
          .some((v) => v?.toLowerCase().includes(needle)))
      return { mailbox: 'partner@reklamx.se (demo)', messages }
    },

    async getMail(id) {
      const m = [...db.mail.inbox, ...db.mail.sentitems].find((x) => x.id === id)
      if (!m) throw new Error('Mejlet finns inte')
      return m
    },

    async replyMail(id, text) {
      const m = db.mail.inbox.find((x) => x.id === id)
      if (!m?.from) throw new Error('Mejlet finns inte')
      db.mail.sentitems.unshift({
        id: crypto.randomUUID(), subject: `Sv: ${m.subject.replace(/^(sv|re):\s*/i, '')}`,
        from: { emailAddress: { address: 'partner@reklamx.se' } }, toRecipients: [m.from],
        sentDateTime: new Date().toISOString(), bodyPreview: text.slice(0, 200), isRead: true,
        body: { contentType: 'text', content: text },
      })
      save()
    },

    async markMailRead(id) {
      const m = db.mail.inbox.find((x) => x.id === id)
      if (m) m.isRead = true
      save()
    },

    async listAgents() {
      return [{ id: 'demo', email: 'demo@reklamx.se', display_name: agentName(), role: 'admin', active: true, last_login_at: null }]
    },

    async saveAgent() {
      throw new Error('Agenter hanteras bara på servern (outreach.reklamx.se).')
    },

    async sendEmail(leadId, templateId) {
      // Demo mode cannot send — open the agent's mail client with the rendered email instead.
      const lead = db.leads.find((l) => l.id === leadId)
      const tpl = db.templates.find((t) => t.id === templateId)
      if (!lead?.email || !tpl) throw new Error('Saknar e-post eller mall')
      const vars = leadVars(lead, agentName())
      const href = `mailto:${lead.email}?subject=${encodeURIComponent(renderTemplate(tpl.subject, vars))}&body=${encodeURIComponent(renderTemplate(tpl.body, vars))}`
      window.location.href = href
    },
  }
}

export function resetDemo() {
  localStorage.removeItem(KEY)
}
