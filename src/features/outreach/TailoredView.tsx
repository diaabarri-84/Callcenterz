import { AlertTriangle, Plus, Send, Trash2, Wand2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RichTemplate } from '../../components/RichTemplate'
import { useToast } from '../../components/Toast'
import { leadVars } from '../../lib/leadVars'
import { OPT_OUT_FOOTER, pickTemplate } from '../../lib/template'
import type { EmailTemplate, Lead } from '../../lib/types'
import { useSession } from '../auth/session'
import { BulkSend } from './BulkSend'
import { ParameterPanel } from './ParameterPanel'

type Draft = Omit<EmailTemplate, 'id'> & { id?: string }
const EMPTY: Draft = { name: 'Ny mall', niches: [], subject: '', body: '', is_default: false }

/** Template editor where every lead column is a parameter, with a live tailored preview and sending. */
export function TailoredView() {
  const { api, agent } = useSession()
  const toast = useToast()
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [leadId, setLeadId] = useState('')
  const [sending, setSending] = useState(false)
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const subjectRef = useRef<HTMLInputElement>(null)
  const lastFocused = useRef<'subject' | 'body'>('body')

  const reloadTemplates = useCallback(async () => {
    const ts = await api.listTemplates()
    setTemplates(ts)
    return ts
  }, [api])

  const reloadLeads = useCallback(() => {
    api.listLeads().then((ls) => setLeads(ls.filter((l) => l.email && l.status !== 'not_interested')))
  }, [api])

  useEffect(() => {
    Promise.all([reloadTemplates(), api.listLeads()])
      .then(([ts, ls]) => {
        const withEmail = ls.filter((l) => l.email && l.status !== 'not_interested')
        setLeads(withEmail)
        setDraft((d) => d ?? ts[0] ?? EMPTY)
        setLeadId((id) => id || withEmail[0]?.id || '')
      })
      .catch((e) => toast((e as Error).message, 'error'))
  }, [api, reloadTemplates, toast])

  const lead = leads.find((l) => l.id === leadId) ?? null
  const vars = useMemo(() => (lead ? leadVars(lead, agent.display_name) : {}), [lead, agent.display_name])
  const autoTemplate = lead ? pickTemplate(templates, lead.niche) : null
  const soleTrader = !!lead?.bolagstyp?.toLowerCase().includes('enskild')

  /** Inserts at the cursor of whichever field (subject/body) was used last. */
  function insertText(text: string) {
    if (!draft) return
    const field = lastFocused.current
    const el = field === 'subject' ? subjectRef.current : bodyRef.current
    if (!el) return
    const value = draft[field]
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    setDraft({ ...draft, [field]: value.slice(0, start) + text + value.slice(end) })
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + text.length })
  }

  async function save() {
    if (!draft) return
    try {
      const saved = await api.saveTemplate(draft)
      await reloadTemplates()
      setDraft(saved)
      toast('Mallen sparad', 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  async function remove() {
    if (!draft?.id || !confirm(`Ta bort mallen "${draft.name}"?`)) return
    await api.deleteTemplate(draft.id)
    const ts = await reloadTemplates()
    setDraft(ts[0] ?? EMPTY)
  }

  async function send() {
    if (!lead || !draft?.id) return
    setSending(true)
    try {
      await api.sendEmail(lead.id, draft.id)
      if (api.mode === 'server') {
        toast(`Skickat till ${lead.email}`, 'success')
        reloadLeads()
      }
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSending(false)
    }
  }

  if (!draft) return <div className="card h-64 animate-pulse" />

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="label">Mallar</p>
          <button className="btn btn-ghost btn-sm px-2" onClick={() => setDraft(EMPTY)} aria-label="Ny mall"><Plus className="size-4" /></button>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 xl:flex-col">
          {templates.map((t) => (
            <button key={t.id} onClick={() => setDraft(t)}
              className={`shrink-0 rounded-xl border px-3 py-2.5 text-left text-sm transition ${draft.id === t.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-accent'}`}>
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-muted">{t.is_default ? 'Standard' : t.niches.length ? `${t.niches.length} nischer` : 'Ingen nisch'}</div>
            </button>
          ))}
        </div>
      </aside>

      <section className="card space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="label">Mallnamn</span>
            <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Används för nischer</span>
            <input className="input" value={draft.niches.join(', ')} placeholder="kommaseparerade, t.ex. bildekor, wrap"
              onChange={(e) => setDraft({ ...draft, niches: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.is_default} onChange={(e) => setDraft({ ...draft, is_default: e.target.checked })} />
          Standardmall (används när ingen nisch matchar)
        </label>
        <label className="block space-y-1.5">
          <span className="label">Ämnesrad</span>
          <input ref={subjectRef} className="input" value={draft.subject} onFocus={() => { lastFocused.current = 'subject' }}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
        </label>

        <div className="space-y-1.5">
          <span className="label">Parametrar – klicka för att infoga{lead ? ` (värden från ${lead.company_name})` : ''}</span>
          <ParameterPanel vars={vars} onInsert={insertText} />
        </div>

        <label className="block space-y-1.5">
          <span className="label">Text</span>
          <textarea ref={bodyRef} className="input min-h-80 font-mono text-[13px] leading-relaxed" value={draft.body}
            onFocus={() => { lastFocused.current = 'body' }}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
        </label>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={save}>Spara mall</button>
          {draft.id && <button className="btn btn-ghost text-danger" onClick={remove}><Trash2 className="size-4" /> Ta bort</button>}
        </div>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-medium">
          {(['single', 'bulk'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded-lg py-2 transition ${mode === m ? 'bg-surface shadow-sm' : 'text-muted hover:text-fg'}`}>
              {m === 'single' ? 'Enskilt' : 'Massutskick'}
            </button>
          ))}
        </div>

        {mode === 'bulk' ? (
          <BulkSend leads={leads} templates={templates} current={draft.id ? (draft as EmailTemplate) : null} onDone={reloadLeads} />
        ) : (
          <>
            <label className="block space-y-1.5">
              <span className="label">Förhandsgranska för lead ({leads.length} med e-post)</span>
              <select className="input" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                {leads.map((l) => <option key={l.id} value={l.id}>{l.company_name} · {l.niche}</option>)}
              </select>
            </label>

            {autoTemplate && autoTemplate.id !== draft.id && (
              <button className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-left text-sm" onClick={() => setDraft(autoTemplate)}>
                <Wand2 className="size-4 shrink-0 text-accent" />
                <span>Bäst match för nischen <b>{lead?.niche}</b>: <b>{autoTemplate.name}</b> – byt</span>
              </button>
            )}
            {soleTrader && (
              <p className="flex gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
                <AlertTriangle className="size-4 shrink-0 text-warn" />
                Enskild firma räknas som privatperson – kräver samtycke innan e-postreklam (marknadsföringslagen).
              </p>
            )}

            {lead ? (
              <div className="flex-1 overflow-hidden rounded-2xl border border-line">
                <div className="space-y-1 border-b border-line bg-surface-2 px-4 py-3 text-sm">
                  <div><span className="text-muted">Till:</span> {lead.email}</div>
                  <div><span className="text-muted">Ämne:</span> <b><RichTemplate text={draft.subject} vars={vars} /></b></div>
                </div>
                <div className="whitespace-pre-wrap px-4 py-4 text-[15px] leading-relaxed">
                  <RichTemplate text={draft.body} vars={vars} />
                  <span className="text-muted">{OPT_OUT_FOOTER}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">Inga leads med e-post än.</p>
            )}
            <p className="-mt-2 text-xs text-muted">
              <mark className="var">Markerat</mark> = hämtat från leadet · <mark className="var var-missing">[röd]</mark> = saknas för detta lead
            </p>

            <button className="btn btn-primary" disabled={!lead || !draft.id || sending} onClick={send}>
              <Send className="size-4" /> {api.mode === 'demo' ? 'Öppna i e-postprogram' : sending ? 'Skickar…' : 'Skicka'}
            </button>
            {!draft.id && <p className="-mt-2 text-xs text-muted">Spara mallen innan du skickar.</p>}
            {lead && lead.emails_sent > 0 && <p className="-mt-2 text-xs text-muted">Redan mejlad {lead.emails_sent} gång(er).</p>}
          </>
        )}
      </section>
    </div>
  )
}
