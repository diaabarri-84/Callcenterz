import { Phone, Search, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useToast } from '../../components/Toast'
import { parseLeadsCsv } from '../../lib/csv'
import { prettyWebsite } from '../../lib/leadVars'
import { fmtDayTime } from '../../lib/schedule'
import { STATUS_LABEL, type Lead, type LeadStatus } from '../../lib/types'
import { useSession } from '../auth/session'
import { LeadCard } from '../dialer/LeadCard'

const STATUSES = Object.keys(STATUS_LABEL) as LeadStatus[]

export function LeadsPage() {
  const { api } = useSession()
  const toast = useToast()
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<LeadStatus | 'all'>('all')
  const [niche, setNiche] = useState('all')
  const [open, setOpen] = useState<Lead | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(
    () => api.listLeads().then(setLeads).catch((e) => toast((e as Error).message, 'error')),
    [api, toast],
  )
  useEffect(() => { reload() }, [reload])

  const niches = useMemo(() => [...new Set((leads ?? []).map((l) => l.niche).filter(Boolean) as string[])].sort(), [leads])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (leads ?? []).filter((l) =>
      (status === 'all' || l.status === status) &&
      (niche === 'all' || l.niche === niche) &&
      (!needle || [l.company_name, l.bolagsnamn, l.kontaktperson, l.city, l.phone, l.org_nr].some((v) => v?.toLowerCase().includes(needle))))
  }, [leads, q, status, niche])

  async function onImport(file: File) {
    setImporting(true)
    try {
      const rows = await parseLeadsCsv(file)
      const { inserted, enriched } = await api.importLeads(rows)
      toast(`${inserted} nya leads importerade${enriched ? `, ${enriched} berikade` : ''} (${rows.length - inserted} fanns redan)`, 'success')
      await reload()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold">Leads <span className="text-muted">{leads ? filtered.length : ''}</span></h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          <button className="btn btn-primary" disabled={importing} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> {importing ? 'Importerar…' : 'Importera CSV'}
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Sök företag, person, ort, telefon, org.nr…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input sm:w-48" value={niche} onChange={(e) => setNiche(e.target.value)}>
          <option value="all">Alla nischer</option>
          {niches.map((n) => <option key={n}>{n}</option>)}
        </select>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
        {(['all', ...STATUSES] as const).map((s) => (
          <button key={s} className={`pill shrink-0 ${status === s ? 'pill-on' : ''}`} onClick={() => setStatus(s)}>
            {s === 'all' ? 'Alla' : STATUS_LABEL[s]}
            <span className="opacity-60">{(leads ?? []).filter((l) => s === 'all' || l.status === s).length}</span>
          </button>
        ))}
      </div>

      {leads === null ? (
        <div className="card h-64 animate-pulse" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="hidden border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted md:table-header-group">
              <tr>
                <th className="px-4 py-3 font-medium">Företag</th>
                <th className="px-4 py-3 font-medium">Kontakt</th>
                <th className="px-4 py-3 font-medium">Nisch / ort</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Nästa samtal</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 300).map((l) => (
                <tr key={l.id} onClick={() => setOpen(l)} className="flex cursor-pointer flex-col border-b border-line px-4 py-3 last:border-0 hover:bg-surface-2 md:table-row md:p-0">
                  <td className="md:px-4 md:py-3">
                    <div className="flex items-center gap-2 font-medium">
                      {l.company_name}
                    </div>
                    <div className="text-xs text-muted">{l.phone} · {prettyWebsite(l.website)}</div>
                  </td>
                  <td className="md:px-4 md:py-3">
                    <div>{l.kontaktperson ?? <span className="text-muted">—</span>}</div>
                    <div className="text-xs text-muted">{l.kontaktperson_roll}</div>
                  </td>
                  <td className="text-muted md:px-4 md:py-3">{l.niche} · {l.city}</td>
                  <td className="py-1 md:px-4 md:py-3"><span className={`chip status-${l.status}`}>{STATUS_LABEL[l.status]}</span></td>
                  <td className="text-muted md:px-4 md:py-3">{l.next_call_at ? fmtDayTime(new Date(l.next_call_at)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 300 && <p className="border-t border-line p-3 text-center text-sm text-muted">Visar 300 av {filtered.length} – förfina sökningen.</p>}
          {filtered.length === 0 && <p className="p-10 text-center text-muted">Inga leads matchar.</p>}
        </div>
      )}

      {open && <LeadDrawer lead={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); reload() }} />}
    </div>
  )
}

function LeadDrawer({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: () => void }) {
  const { api } = useSession()
  const toast = useToast()
  const [notes, setNotes] = useState(lead.notes ?? '')
  const [status, setStatus] = useState(lead.status)
  const [optOut, setOptOut] = useState(lead.email_opt_out)
  const navigate = useNavigate()

  async function save(callNow = false) {
    try {
      await api.updateLead(lead.id, {
        notes: notes || null,
        status,
        email_opt_out: optOut,
        ...(callNow ? { next_call_at: new Date(0).toISOString() } : {}),
      })
      toast(callNow ? 'Leadet ligger först i ringkön' : 'Sparat', 'success')
      onSaved()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="animate-slide h-full w-full max-w-lg space-y-4 overflow-y-auto bg-bg p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end"><button className="btn btn-ghost px-2.5" onClick={onClose} aria-label="Stäng"><X className="size-4" /></button></div>
        <LeadCard lead={lead} />
        <label className="block space-y-1.5">
          <span className="label">Status</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="label">Anteckningar</span>
          <textarea className="input min-h-32" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={optOut} onChange={(e) => setOptOut(e.target.checked)} />
          Avregistrerad – skicka inga fler mejl
          {lead.emails_sent > 0 && <span className="text-muted">· {lead.emails_sent} mejl skickade</span>}
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary flex-1" onClick={() => save()}>Spara</button>
          <button className="btn btn-success" disabled={!lead.phone} onClick={() => navigate(`/?ring=${lead.id}`)}>
            <Phone className="size-4" /> Ring nu
          </button>
          <button className="btn btn-ghost" onClick={() => save(true)} disabled={status === 'not_interested'}>Ring härnäst</button>
        </div>
      </div>
    </div>
  )
}
