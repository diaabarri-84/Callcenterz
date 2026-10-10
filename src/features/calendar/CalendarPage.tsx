import { ChevronLeft, ChevronRight, Phone } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../../components/Toast'
import { telHref } from '../../lib/leadVars'
import { addDays, fmtDay, fmtMonth, fmtTime, sameDay, startOfWeek } from '../../lib/schedule'
import { STATUS_LABEL, type Booking, type Lead } from '../../lib/types'
import { useSession } from '../auth/session'

const WEEKDAYS = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön']

export function CalendarPage() {
  const { api } = useSession()
  const toast = useToast()
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selected, setSelected] = useState(() => new Date())
  const [bookings, setBookings] = useState<Booking[]>([])
  const [scheduled, setScheduled] = useState<Lead[]>([])

  const gridStart = useMemo(() => startOfWeek(month), [month])
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart])

  useEffect(() => {
    const end = addDays(gridStart, 42)
    Promise.all([api.listBookings(gridStart, end), api.listScheduled(gridStart, end)])
      .then(([b, s]) => { setBookings(b); setScheduled(s) })
      .catch((e) => toast((e as Error).message, 'error'))
  }, [api, gridStart, toast])

  const dayBookings = bookings.filter((b) => sameDay(new Date(b.starts_at), selected))
  const dayScheduled = scheduled.filter((l) => sameDay(new Date(l.next_call_at!), selected))
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="card p-4 sm:p-5">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="font-display text-xl font-semibold capitalize">{fmtMonth.format(month)}</h1>
          <div className="flex gap-1">
            <button className="btn btn-ghost px-2.5" onClick={() => shift(-1)} aria-label="Föregående månad"><ChevronLeft className="size-4" /></button>
            <button className="btn btn-ghost" onClick={() => { const t = new Date(); setMonth(new Date(t.getFullYear(), t.getMonth(), 1)); setSelected(t) }}>Idag</button>
            <button className="btn btn-ghost px-2.5" onClick={() => shift(1)} aria-label="Nästa månad"><ChevronRight className="size-4" /></button>
          </div>
        </header>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-muted">
          {WEEKDAYS.map((d) => <div key={d} className="pb-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const b = bookings.filter((x) => sameDay(new Date(x.starts_at), d)).length
            const s = scheduled.filter((x) => sameDay(new Date(x.next_call_at!), d)).length
            const isSel = sameDay(d, selected)
            const isToday = sameDay(d, new Date())
            const outside = d.getMonth() !== month.getMonth()
            return (
              <button
                key={d.toISOString()}
                onClick={() => setSelected(d)}
                className={`flex aspect-square flex-col items-start justify-between rounded-xl border p-1.5 text-left transition sm:aspect-[4/3] sm:p-2 ${
                  isSel ? 'border-accent bg-accent-soft' : 'border-transparent hover:border-line'
                } ${outside ? 'opacity-40' : ''}`}
              >
                <span className={`grid size-6 place-items-center rounded-full text-sm ${isToday ? 'bg-accent font-semibold text-white' : ''}`}>{d.getDate()}</span>
                <span className="flex flex-wrap gap-1">
                  {b > 0 && <span className="cal-dot bg-success text-white">{b}</span>}
                  {s > 0 && <span className="cal-dot bg-surface-2 text-muted">{s}</span>}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-4 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-success" /> Bokade samtal</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-surface-2 ring-1 ring-line" /> Återuppringningar</span>
        </div>
      </section>

      <aside className="space-y-4">
        <h2 className="font-display text-lg font-semibold first-letter:uppercase">{fmtDay.format(selected)}</h2>

        <div className="space-y-2">
          <p className="label">Bokade samtal ({dayBookings.length})</p>
          {dayBookings.length === 0 && <p className="text-sm text-muted">Inga bokningar.</p>}
          {dayBookings.map((b) => (
            <div key={b.id} className="card flex items-center gap-3 p-3">
              <div className="w-14 shrink-0 rounded-lg bg-success/10 py-1.5 text-center font-display font-semibold text-success">
                {fmtTime.format(new Date(b.starts_at))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{b.lead?.company_name ?? b.title}</div>
                <div className="truncate text-sm text-muted">{b.lead?.kontaktperson ?? '—'}</div>
              </div>
              {b.lead?.phone && <a className="btn btn-success px-3" href={telHref(b.lead.phone)} aria-label="Ring"><Phone className="size-4" /></a>}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="label">Ringer igen ({dayScheduled.length})</p>
          {dayScheduled.length === 0 && <p className="text-sm text-muted">Inget schemalagt.</p>}
          {dayScheduled.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{l.company_name}</div>
                <div className="text-xs text-muted">{STATUS_LABEL[l.status]} · försök {l.attempts}</div>
              </div>
              <span className="text-xs text-muted">{fmtTime.format(new Date(l.next_call_at!))}</span>
            </div>
          ))}
          {dayScheduled.length > 0 && <p className="text-xs text-muted">Dessa dyker upp automatiskt i ringkön när dagen kommer.</p>}
        </div>
      </aside>
    </div>
  )
}
