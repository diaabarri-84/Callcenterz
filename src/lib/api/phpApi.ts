import type { Agent, BulkSendResult } from '../types'
import type { Api } from './types'

const ENDPOINT = 'api/index.php'
const BATCH = 10 // matches CC_MAX_BATCH in public/api/lib/mail.php

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly install = false) {
    super(message)
  }
}

/** POSTs { action, ...body } to the PHP API on the same domain (session cookie auth). */
export async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  const data = await res.json().catch(() => null)
  if (data === null) throw new ApiError('Servern svarade inte som väntat', res.status)
  if (!res.ok) throw new ApiError(data.error ?? `Fel ${res.status}`, res.status, !!data.install)
  return data as T
}

export const auth = {
  me: () => call<{ agent: Agent | null }>('me'),
  login: (email: string, password: string) => call<{ agent: Agent }>('login', { email, password }),
  logout: () => call('logout'),
}

export function createPhpApi(): Api {
  return {
    mode: 'server',

    getNextLead: (exclude = []) => call('nextLead', { exclude }),
    listUpcoming: (exclude = []) => call('upcomingLeads', { exclude }),
    claimLead: (id) => call('claimLead', { id }),
    async logOutcome(i) { await call('logOutcome', { ...i }) },
    queueStats: () => call('queueStats'),

    listLeads: () => call('listLeads'),
    async updateLead(id, patch) { await call('updateLead', { id, patch }) },
    async importLeads(rows) {
      let inserted = 0
      let enriched = 0
      for (let i = 0; i < rows.length; i += 500) {
        const r = await call<{ inserted: number; enriched: number }>('importLeads', { rows: rows.slice(i, i + 500) })
        inserted += r.inserted
        enriched += r.enriched
      }
      return { inserted, enriched }
    },

    listBookings: (from, to) => call('listBookings', { from: from.toISOString(), to: to.toISOString() }),
    listScheduled: (from, to) => call('listScheduled', { from: from.toISOString(), to: to.toISOString() }),

    listTemplates: () => call('listTemplates'),
    saveTemplate: (template) => call('saveTemplate', { template }),
    async deleteTemplate(id) { await call('deleteTemplate', { id }) },

    async sendEmail(leadId, templateId) {
      const r = await call<BulkSendResult>('send', { lead_ids: [leadId], template_id: templateId, skip_sole_traders: false })
      if (!r.sent) throw new Error(r.skipped[0]?.reason ?? (r.stopped ? 'Dagens maxgräns för utskick är nådd' : 'Inte skickat'))
    },

    async sendBulk(leadIds, templateId, { skipAlreadyEmailed, onProgress, signal }) {
      const acc: BulkSendResult = { sent: 0, skipped: [], failed: [], stopped: null, daily_remaining: 0 }
      for (let i = 0; i < leadIds.length && !signal?.aborted; i += BATCH) {
        const r = await call<BulkSendResult>('send', {
          lead_ids: leadIds.slice(i, i + BATCH), template_id: templateId, skip_already_emailed: skipAlreadyEmailed,
        })
        acc.sent += r.sent
        acc.skipped.push(...r.skipped)
        acc.failed.push(...r.failed)
        acc.daily_remaining = r.daily_remaining
        acc.stopped = r.stopped
        onProgress?.(Math.min(i + BATCH, leadIds.length), leadIds.length, acc)
        if (r.stopped) break
      }
      return acc
    },

    listMail: (folder, search) => call('mailList', { folder, search }),
    getMail: (id) => call('mailGet', { id }),
    async replyMail(id, text) { await call('mailReply', { id, text }) },
    async markMailRead(id) { await call('mailMarkRead', { id }) },

    listAgents: () => call('listAgents'),
    saveAgent: (agent) => call('saveAgent', { agent }),
  }
}
