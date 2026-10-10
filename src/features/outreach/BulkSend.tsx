import { Send, Square } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useToast } from '../../components/Toast'
import { pickTemplate } from '../../lib/template'
import type { BulkSendResult, EmailTemplate, Lead } from '../../lib/types'
import { useSession } from '../auth/session'

const SECONDS_PER_EMAIL = 2.5 // pause_ms (2 s) in public/api/lib/mail.php + SMTP time

export function BulkSend({ leads, templates, current, onDone }: {
  leads: Lead[]
  templates: EmailTemplate[]
  current: EmailTemplate | null
  onDone: () => void
}) {
  const { api } = useSession()
  const toast = useToast()
  const [niche, setNiche] = useState('all')
  const [onlyNew, setOnlyNew] = useState(true)
  const [templateChoice, setTemplateChoice] = useState<'auto' | 'current'>('auto')
  const [max, setMax] = useState(50)
  const [progress, setProgress] = useState<{ done: number; total: number; acc: BulkSendResult } | null>(null)
  const [result, setResult] = useState<BulkSendResult | null>(null)
  const abort = useRef<AbortController | null>(null)

  const niches = useMemo(() => [...new Set(leads.map((l) => l.niche).filter(Boolean) as string[])].sort(), [leads])
  const eligible = useMemo(() => leads.filter((l) =>
    l.email && !l.email_opt_out && l.status !== 'not_interested' &&
    !l.bolagstyp?.toLowerCase().includes('enskild') &&
    (niche === 'all' || l.niche === niche) &&
    (!onlyNew || l.emails_sent === 0)), [leads, niche, onlyNew])
  const recipients = eligible.slice(0, max)

  const perTemplate = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of recipients) {
      const t = templateChoice === 'auto' ? pickTemplate(templates, l.niche) : current
      if (t) counts.set(t.name, (counts.get(t.name) ?? 0) + 1)
    }
    return [...counts]
  }, [recipients, templateChoice, templates, current])

  async function start() {
    const templateId = templateChoice === 'auto' ? 'auto' : current?.id
    if (!templateId || !recipients.length) return
    if (!confirm(`Skicka ${recipients.length} mejl nu?`)) return
    abort.current = new AbortController()
    setResult(null)
    try {
      const r = await api.sendBulk(recipients.map((l) => l.id), templateId, {
        skipAlreadyEmailed: onlyNew,
        signal: abort.current.signal,
        onProgress: (done, total, acc) => setProgress({ done, total, acc: { ...acc } }),
      })
      setResult(r)
      if (r.stopped === 'daily_limit') toast('Dagens maxgräns nådd – resten skickas imorgon', 'info')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setProgress(null)
      onDone()
    }
  }

  const minutes = Math.ceil((recipients.length * SECONDS_PER_EMAIL) / 60)
  const skippedByReason = result
    ? Object.entries(result.skipped.reduce<Record<string, number>>((m, s) => ({ ...m, [s.reason]: (m[s.reason] ?? 0) + 1 }), {}))
    : []

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="label">Nisch</span>
          <select className="input" value={niche} onChange={(e) => setNiche(e.target.value)}>
            <option value="all">Alla nischer</option>
            {niches.map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="label">Max antal denna körning</span>
          <input className="input" type="number" min={1} max={500} value={max} onChange={(e) => setMax(Math.max(1, Number(e.target.value) || 1))} />
        </label>
      </div>

      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={templateChoice === 'auto'} onChange={() => setTemplateChoice('auto')} />
          Bästa mall per nisch (automatiskt)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={templateChoice === 'current'} disabled={!current} onChange={() => setTemplateChoice('current')} />
          Bara mallen <b>{current?.name ?? '(spara mallen först)'}</b>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
          Bara leads som inte mejlats tidigare
        </label>
      </div>

      <div className="rounded-2xl bg-surface-2 p-4">
        <div className="font-display text-3xl font-semibold tabular-nums">{recipients.length}</div>
        <div className="text-sm text-muted">
          mottagare{eligible.length > recipients.length && ` (av ${eligible.length} möjliga)`} · ca {minutes} min
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {perTemplate.map(([name, n]) => <li key={name} className="flex justify-between"><span>{name}</span><span className="text-muted">{n}</span></li>)}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Avregistrerade, ej intresserade och enskilda firmor tas alltid bort. Varje mejl får en avregistreringsrad.
        </p>
      </div>

      {progress ? (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Skickar… {progress.acc.sent} skickade</span>
            <span className="text-muted">{progress.done}/{progress.total}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <button className="btn btn-ghost w-full" onClick={() => abort.current?.abort()}><Square className="size-4" /> Stoppa efter pågående omgång</button>
        </div>
      ) : (
        <button className="btn btn-primary" disabled={!recipients.length || api.mode === 'demo'} onClick={start}>
          <Send className="size-4" /> Skicka {recipients.length} mejl
        </button>
      )}
      {api.mode === 'demo' && <p className="-mt-2 text-xs text-muted">Massutskick fungerar bara på servern (outreach.reklamx.se).</p>}

      {result && (
        <div className="animate-in rounded-2xl border border-line p-4 text-sm">
          <p className="font-medium">{result.sent} skickade · {result.failed.length} misslyckades · {result.skipped.length} hoppades över</p>
          {skippedByReason.map(([reason, n]) => <p key={reason} className="text-muted">{reason}: {n}</p>)}
          {result.failed.slice(0, 3).map((f) => <p key={f.id} className="text-danger">{f.reason}</p>)}
          <p className="mt-2 text-muted">{result.daily_remaining} mejl kvar av dagens gräns.</p>
        </div>
      )}
    </div>
  )
}
