import { CheckCircle2, ListOrdered, Phone, PhoneCall, RotateCw, SkipForward, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useToast } from '../../components/Toast'
import { leadVars, splitName, telHref } from '../../lib/leadVars'
import { fmtDayTime } from '../../lib/schedule'
import { STATUS_LABEL, type Lead, type QueueStats, type ScriptAnswer } from '../../lib/types'
import { useSession } from '../auth/session'
import { ScriptPanel } from '../script/ScriptPanel'
import { LeadCard } from './LeadCard'
import { OutcomePanel, type OutcomeChoice } from './OutcomePanel'

const OUTCOME_TOAST: Record<OutcomeChoice['outcome'], string> = {
  no_answer: 'Svarade inte – ringer igen',
  another_day: 'Flyttad till',
  booked: 'Samtal bokat',
  not_interested: 'Borttagen från listan',
}

export function DialerPage() {
  const { api, agent } = useSession()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [lead, setLead] = useState<Lead | null | undefined>(undefined)
  const [upcoming, setUpcoming] = useState<Lead[]>([])
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [calling, setCalling] = useState(false)
  const [answer, setAnswer] = useState<ScriptAnswer | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  // Leads swapped away with "Nästa" this session. They stay in the queue for later and for colleagues.
  const skipped = useRef<string[]>([])
  const [skippedCount, setSkippedCount] = useState(0)

  /** Shows a lead and resets the per-call state. */
  const show = useCallback(async (next: Lead | null) => {
    setLead(next)
    setCalling(false)
    setAnswer(null)
    setNotes('')
    const [up, s] = await Promise.all([api.listUpcoming(skipped.current), api.queueStats()])
    setUpcoming(up.filter((l) => l.id !== next?.id))
    setStats(s)
  }, [api])

  const loadNext = useCallback(async () => {
    setLead(undefined)
    try {
      await show(await api.getNextLead(skipped.current))
    } catch (e) {
      toast((e as Error).message, 'error')
      setLead(null)
    }
  }, [api, show, toast])

  /** Calls a specific lead now (tapped in "Nästa i kön", or "Ring nu" on the Leads page). */
  const pick = useCallback(async (id: string) => {
    try {
      skipped.current = skipped.current.filter((x) => x !== id)
      setSkippedCount(skipped.current.length)
      await show(await api.claimLead(id))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      toast((e as Error).message, 'error')
      if (lead === undefined) loadNext()
    }
  }, [api, show, toast, lead, loadNext])

  useEffect(() => {
    const ring = params.get('ring')
    if (ring) {
      setParams({}, { replace: true })
      pick(ring)
    } else {
      loadNext()
    }
  }, []) // run once when the page opens

  function skip() {
    if (!lead) return
    skipped.current = [...skipped.current, lead.id]
    setSkippedCount(skipped.current.length)
    loadNext()
  }

  function resetSkipped() {
    skipped.current = []
    setSkippedCount(0)
    if (lead) show(lead)
    else loadNext()
  }

  const vars = useMemo(() => (lead ? leadVars(lead, agent.display_name) : {}), [lead, agent.display_name])

  async function submit(choice: OutcomeChoice) {
    if (!lead) return
    setBusy(true)
    try {
      await api.logOutcome({
        leadId: lead.id,
        outcome: choice.outcome,
        nextCallAt: choice.nextCallAt?.toISOString() ?? null,
        scriptAnswer: answer,
        notes: notes.trim() || null,
      })
      const when = choice.nextCallAt ? ` ${fmtDayTime(choice.nextCallAt)}` : ''
      toast(`${lead.company_name}: ${OUTCOME_TOAST[choice.outcome]}${when}`, 'success')
      await loadNext()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid h-full max-w-7xl grid-cols-1 gap-5 lg:grid-cols-[minmax(380px,480px)_1fr]">
      <div className="flex min-h-0 flex-col gap-4 pb-40 lg:-mx-4 lg:overflow-y-auto lg:px-4 lg:pb-6 [&>*]:shrink-0">
        <QueueBar stats={stats} onRefresh={loadNext} />

        {lead === undefined && <div className="card h-72 animate-pulse" />}
        {lead === null && <EmptyQueue stats={stats} skipped={skippedCount} onReset={resetSkipped} />}
        {lead && (
          <>
            <LeadCard lead={lead} />

            {/* Big thumb-zone call button + swap to the next number: fixed on phones, inline on desktop. */}
            <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 flex justify-center gap-2 bg-gradient-to-t from-bg via-bg/90 to-transparent px-4 pb-4 pt-8 lg:static lg:bg-none lg:p-0">
              <a
                href={telHref(lead.phone)}
                onClick={() => setCalling(true)}
                className={`call-btn ${calling ? 'call-btn-active' : ''}`}
              >
                {calling ? <PhoneCall className="size-6" /> : <Phone className="size-6" />}
                <span className="truncate">{calling ? 'Ring igen' : `Ring ${vars.first_name || lead.company_name}`}</span>
              </a>
              {!calling && (
                <button className="next-btn" onClick={skip} title="Hoppa över – ta nästa nummer i listan">
                  <SkipForward className="size-5" />
                  <span>Nästa</span>
                </button>
              )}
            </div>

            {calling && (
              <div className="animate-in space-y-3">
                <OutcomePanel busy={busy} onSubmit={submit} />
                <textarea
                  className="input min-h-20 resize-y text-sm"
                  placeholder="Anteckning (valfritt) – sparas på leadet"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            )}
          </>
        )}

        {lead !== undefined && (
          <UpNext leads={upcoming} skipped={skippedCount} onPick={pick} onReset={resetSkipped} />
        )}
      </div>

      <div className="hidden min-h-0 lg:flex lg:flex-col">
        {lead ? (
          <ScriptPanel vars={vars} answer={answer} onAnswer={setAnswer} />
        ) : (
          <div className="card grid flex-1 place-items-center text-muted">Manuset visas när nästa samtal laddats.</div>
        )}
      </div>
    </div>
  )
}

/** The next numbers on the list. Tap one to call it instead of the current lead. */
function UpNext({ leads, skipped, onPick, onReset }: {
  leads: Lead[]; skipped: number; onPick: (id: string) => void; onReset: () => void
}) {
  if (!leads.length && !skipped) return null
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <ListOrdered className="size-4 text-muted" />
        <h2 className="text-sm font-semibold">Nästa i kön</h2>
        {skipped > 0 && (
          <button className="ml-auto flex items-center gap-1 text-xs text-muted hover:text-fg" onClick={onReset}>
            <Undo2 className="size-3.5" /> {skipped} överhoppade – ta tillbaka
          </button>
        )}
      </header>
      <ul>
        {leads.map((l) => {
          const { first, last } = splitName(l.kontaktperson)
          return (
            <li key={l.id} className="border-b border-line last:border-0">
              <button onClick={() => onPick(l.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{l.company_name}</span>
                  <span className="block truncate text-xs text-muted">
                    {[first, last].filter(Boolean).join(' ') || 'Okänd kontakt'}
                    {l.status !== 'new' && ` · ${STATUS_LABEL[l.status]}`}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted">{l.phone}</span>
                <Phone className="size-4 shrink-0 text-success" />
              </button>
            </li>
          )
        })}
      </ul>
      {!leads.length && <p className="px-4 py-3 text-sm text-muted">Inga fler i kön just nu.</p>}
    </section>
  )
}

function QueueBar({ stats, onRefresh }: { stats: QueueStats | null; onRefresh: () => void }) {
  const items = [
    { label: 'I kö nu', value: stats?.dueNow },
    { label: 'Schemalagda', value: stats?.later },
    { label: 'Bokade', value: stats?.booked },
  ]
  return (
    <div className="flex items-center gap-2">
      <div className="grid flex-1 grid-cols-3 gap-2">
        {items.map((i) => (
          <div key={i.label} className="rounded-xl border border-line bg-surface px-3 py-2">
            <div className="font-display text-lg font-semibold tabular-nums">{i.value ?? '–'}</div>
            <div className="text-[11px] uppercase tracking-wide text-muted">{i.label}</div>
          </div>
        ))}
      </div>
      <button className="btn btn-ghost aspect-square px-3" onClick={onRefresh} aria-label="Uppdatera kö"><RotateCw className="size-4" /></button>
    </div>
  )
}

function EmptyQueue({ stats, skipped, onReset }: { stats: QueueStats | null; skipped: number; onReset: () => void }) {
  return (
    <div className="card grid place-items-center gap-2 px-6 py-14 text-center">
      <CheckCircle2 className="size-10 text-success" />
      <h2 className="font-display text-xl font-semibold">Kön är tom just nu</h2>
      <p className="max-w-xs text-sm text-muted">
        {stats?.total ? `${stats.later} samtal är schemalagda senare. Kolla kalendern eller importera fler leads.` : 'Importera leads under fliken Leads för att börja ringa.'}
      </p>
      {skipped > 0 && <button className="btn btn-ghost mt-2" onClick={onReset}><Undo2 className="size-4" /> Ta tillbaka {skipped} överhoppade</button>}
    </div>
  )
}
