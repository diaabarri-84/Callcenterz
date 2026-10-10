import { ArrowLeft, BellOff, Inbox, PhoneForwarded, RotateCw, Search, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '../../components/Toast'
import { fmtDay, fmtTime, sameDay } from '../../lib/schedule'
import { STATUS_LABEL, type Lead, type MailFolder, type MailMessage } from '../../lib/types'
import { useSession } from '../auth/session'

const FREE_MAIL = new Set(['gmail.com', 'hotmail.com', 'outlook.com', 'live.se', 'live.com', 'yahoo.com', 'icloud.com', 'telia.com'])
const OPT_OUT_WORDS = /avregistrera|avsluta|ta bort (mig|oss)|inte intresserad|unsubscribe/i

const domainOf = (email: string) => email.split('@')[1]?.toLowerCase() ?? ''

/** Finds the lead a mail belongs to: exact address first, then same company domain. */
function useLeadLookup(leads: Lead[]) {
  return useMemo(() => {
    const byEmail = new Map<string, Lead>()
    const byDomain = new Map<string, Lead>()
    for (const l of leads) {
      if (!l.email) continue
      byEmail.set(l.email.toLowerCase(), l)
      const d = domainOf(l.email)
      if (d && !FREE_MAIL.has(d)) byDomain.set(d, l)
    }
    return (address?: string) => {
      const a = (address ?? '').toLowerCase()
      return byEmail.get(a) ?? byDomain.get(domainOf(a)) ?? null
    }
  }, [leads])
}

const counterpart = (m: MailMessage, folder: MailFolder) =>
  folder === 'inbox' ? m.from?.emailAddress : m.toRecipients[0]?.emailAddress

function when(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return sameDay(d, new Date()) ? fmtTime.format(d) : fmtDay.format(d)
}

export function MailboxView() {
  const { api } = useSession()
  const toast = useToast()
  const [folder, setFolder] = useState<MailFolder>('inbox')
  const [search, setSearch] = useState('')
  const [mailbox, setMailbox] = useState('')
  const [messages, setMessages] = useState<MailMessage[] | null>(null)
  const [error, setError] = useState('')
  const [leads, setLeads] = useState<Lead[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const findLead = useLeadLookup(leads)

  const load = useCallback(async () => {
    setError('')
    setMessages(null)
    try {
      const r = await api.listMail(folder, search.trim() || undefined)
      setMailbox(r.mailbox)
      setMessages(r.messages)
    } catch (e) {
      setError((e as Error).message)
      setMessages([])
    }
  }, [api, folder, search])

  // Reload when the folder changes; search runs on submit.
  useEffect(() => { load() }, [folder]) // load() reads the current search too
  useEffect(() => { api.listLeads().then(setLeads).catch(() => {}) }, [api])

  const open = messages?.find((m) => m.id === openId) ?? null
  const unread = messages?.filter((m) => !m.isRead).length ?? 0

  async function select(m: MailMessage) {
    setOpenId(m.id)
    if (folder === 'inbox' && !m.isRead) {
      setMessages((ms) => ms?.map((x) => (x.id === m.id ? { ...x, isRead: true } : x)) ?? ms)
      api.markMailRead(m.id).catch(() => {})
    }
  }

  async function updateLead(lead: Lead, patch: Parameters<typeof api.updateLead>[1], msg: string) {
    try {
      await api.updateLead(lead.id, patch)
      setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, ...patch } : l)))
      toast(msg, 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <div className="card grid min-h-[70dvh] grid-cols-1 overflow-hidden lg:grid-cols-[380px_minmax(0,1fr)]">
      {/* Message list */}
      <div className={`flex min-h-0 flex-col border-line lg:border-r ${open ? 'hidden lg:flex' : 'flex'}`}>
        <div className="space-y-3 border-b border-line p-3">
          <div className="flex items-center gap-2">
            <div className="grid flex-1 grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-medium">
              {(['inbox', 'sentitems'] as const).map((f) => (
                <button key={f} onClick={() => { setFolder(f); setOpenId(null) }}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 transition ${folder === f ? 'bg-surface shadow-sm' : 'text-muted hover:text-fg'}`}>
                  {f === 'inbox' ? <><Inbox className="size-4" /> Inkorg{unread > 0 && folder === 'inbox' && <span className="rounded-full bg-accent px-1.5 text-[11px] text-white">{unread}</span>}</> : <><Send className="size-4" /> Skickat</>}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost px-2.5" onClick={load} aria-label="Uppdatera"><RotateCw className="size-4" /></button>
          </div>
          <form className="relative" onSubmit={(e) => { e.preventDefault(); load() }}>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input className="input py-2 pl-9 text-sm" placeholder="Sök i mejl…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          {mailbox && <p className="truncate text-xs text-muted">{mailbox}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {messages === null && <div className="m-3 h-40 animate-pulse rounded-xl bg-surface-2" />}
          {error && (
            <div className="m-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
              <p className="font-medium">Kunde inte läsa inkorgen</p>
              <p className="mt-1 text-muted">{error}</p>
              <p className="mt-2 text-xs text-muted">Kontrollera e-postkontots lösenord i inställningsfilen (README → "E-post").</p>
            </div>
          )}
          {messages?.length === 0 && !error && <p className="p-8 text-center text-sm text-muted">Inga mejl.</p>}
          {messages?.map((m) => {
            const who = counterpart(m, folder)
            const lead = findLead(who?.address)
            return (
              <button key={m.id} onClick={() => select(m)}
                className={`flex w-full gap-3 border-b border-line px-4 py-3 text-left transition hover:bg-surface-2 ${openId === m.id ? 'bg-accent-soft' : ''}`}>
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${!m.isRead && folder === 'inbox' ? 'bg-accent' : 'bg-transparent'}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${!m.isRead && folder === 'inbox' ? 'font-semibold' : ''}`}>
                      {folder === 'sentitems' && <span className="text-muted">Till: </span>}{who?.name || who?.address}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{when(m.receivedDateTime ?? m.sentDateTime)}</span>
                  </span>
                  <span className="block truncate text-sm">{m.subject || '(inget ämne)'}</span>
                  <span className="block truncate text-xs text-muted">{m.bodyPreview}</span>
                  {lead && <span className="chip chip-accent mt-1.5 py-0.5">{lead.company_name}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Reading pane */}
      <div className={`min-h-0 flex-col ${open ? 'flex' : 'hidden lg:flex'}`}>
        {open ? (
          <MailDetail
            key={open.id}
            message={open}
            folder={folder}
            lead={findLead(counterpart(open, folder)?.address)}
            onBack={() => setOpenId(null)}
            onReplied={() => toast('Svar skickat', 'success')}
            onUpdateLead={updateLead}
          />
        ) : (
          <div className="grid flex-1 place-items-center p-10 text-center text-sm text-muted">Välj ett mejl</div>
        )}
      </div>
    </div>
  )
}

function MailDetail({ message, folder, lead, onBack, onReplied, onUpdateLead }: {
  message: MailMessage
  folder: MailFolder
  lead: Lead | null
  onBack: () => void
  onReplied: () => void
  onUpdateLead: (lead: Lead, patch: Parameters<ReturnType<typeof useSession>['api']['updateLead']>[1], msg: string) => void
}) {
  const { api } = useSession()
  const toast = useToast()
  const [full, setFull] = useState<MailMessage>(message)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => { api.getMail(message.id).then(setFull).catch(() => {}) }, [api, message.id])

  const text = full.body?.content ?? full.bodyPreview
  const wantsOut = folder === 'inbox' && OPT_OUT_WORDS.test(text)
  const from = full.from?.emailAddress
  const date = full.receivedDateTime ?? full.sentDateTime

  async function sendReply() {
    setSending(true)
    try {
      await api.replyMail(message.id, reply)
      setReply('')
      onReplied()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-line p-4 sm:p-5">
        <button className="flex items-center gap-1.5 text-sm text-muted lg:hidden" onClick={onBack}><ArrowLeft className="size-4" /> Tillbaka</button>
        <h2 className="font-display text-xl font-semibold">{full.subject || '(inget ämne)'}</h2>
        <div className="text-sm text-muted">
          <div>Från: <span className="text-fg">{from?.name ? `${from.name} <${from.address}>` : from?.address}</span></div>
          <div>Till: {full.toRecipients.map((r) => r.emailAddress.address).join(', ')}</div>
          {date && <div>{fmtDay.format(new Date(date))} {fmtTime.format(new Date(date))}</div>}
        </div>
      </div>

      {lead && (
        <div className={`flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5 ${wantsOut ? 'bg-warn/10' : 'bg-surface-2'}`}>
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-medium">{lead.company_name}</span>
            <span className="text-muted"> · {lead.kontaktperson ?? 'okänd kontakt'} · {STATUS_LABEL[lead.status]}</span>
            {wantsOut && !lead.email_opt_out && <p className="text-warn">Det låter som att de vill avregistrera sig.</p>}
          </div>
          {lead.email_opt_out ? (
            <span className="chip">Avregistrerad</span>
          ) : (
            <button className={`btn btn-sm ${wantsOut ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => onUpdateLead(lead, { email_opt_out: true }, `${lead.company_name} avregistrerad från mejl`)}>
              <BellOff className="size-3.5" /> Avregistrera
            </button>
          )}
          <button className="btn btn-ghost btn-sm" disabled={lead.status === 'not_interested'}
            onClick={() => onUpdateLead(lead, { next_call_at: new Date(0).toISOString() }, `${lead.company_name} ligger först i ringkön`)}>
            <PhoneForwarded className="size-3.5" /> Ring härnäst
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap p-4 text-[15px] leading-relaxed sm:p-5">{text}</div>

      {folder === 'inbox' && (
        <div className="space-y-2 border-t border-line p-4 sm:p-5">
          <textarea className="input min-h-24 text-sm" placeholder={`Svara ${from?.name ?? from?.address ?? ''}…`} value={reply} onChange={(e) => setReply(e.target.value)} />
          <div className="flex justify-end">
            <button className="btn btn-primary" disabled={!reply.trim() || sending} onClick={sendReply}>
              <Send className="size-4" /> {sending ? 'Skickar…' : 'Svara'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
