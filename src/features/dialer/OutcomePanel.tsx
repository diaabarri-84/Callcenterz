import { CalendarClock, CalendarDays, PhoneMissed, ThumbsDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  addDays, BOOKING_SLOTS, dayStart, fmtDay, fmtDayTime, fromInputs, nextBusinessDay, noAnswerRetry, startOfWeek, toDateInput,
} from '../../lib/schedule'
import type { Outcome } from '../../lib/types'

export interface OutcomeChoice {
  outcome: Outcome
  nextCallAt: Date | null
}

type Open = 'another_day' | 'booked' | 'not_interested' | null

export function OutcomePanel({ busy, onSubmit }: { busy: boolean; onSubmit: (c: OutcomeChoice) => void }) {
  const [open, setOpen] = useState<Open>(null)
  const today = new Date()
  const quickDays = [
    { label: 'Imorgon', date: nextBusinessDay(today) },
    { label: 'Om 2 dagar', date: nextBusinessDay(nextBusinessDay(today)) },
    { label: 'Nästa vecka', date: addDays(startOfWeek(today), 7) },
  ]
  const toggle = (o: Open) => setOpen((cur) => (cur === o ? null : o))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <OutcomeButton icon={<PhoneMissed />} label="Svarade inte" hint={fmtDay.format(noAnswerRetry())} disabled={busy}
          onClick={() => onSubmit({ outcome: 'no_answer', nextCallAt: noAnswerRetry() })} />
        <OutcomeButton icon={<CalendarDays />} label="En annan dag" active={open === 'another_day'} disabled={busy}
          onClick={() => toggle('another_day')} />
        <OutcomeButton icon={<CalendarClock />} label="Boka samtal" active={open === 'booked'} tone="success" disabled={busy}
          onClick={() => toggle('booked')} />
      </div>

      {open === 'another_day' && (
        <AnotherDay quickDays={quickDays} busy={busy}
          onPick={(d) => onSubmit({ outcome: 'another_day', nextCallAt: d })} />
      )}
      {open === 'booked' && (
        <BookCall busy={busy} onPick={(d) => onSubmit({ outcome: 'booked', nextCallAt: d })} />
      )}

      {open === 'not_interested' ? (
        <div className="animate-in flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/5 p-3">
          <span className="flex-1 text-sm">Ta bort från ringlistan?</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(null)}>Avbryt</button>
          <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => onSubmit({ outcome: 'not_interested', nextCallAt: null })}>Ja, ej intresserad</button>
        </div>
      ) : (
        <button className="mx-auto flex items-center gap-1.5 text-sm text-muted hover:text-danger" onClick={() => toggle('not_interested')}>
          <ThumbsDown className="size-3.5" /> Inte intresserad
        </button>
      )}
    </div>
  )
}

function OutcomeButton({ icon, label, hint, active, tone, disabled, onClick }: {
  icon: ReactNode; label: string; hint?: string; active?: boolean; tone?: 'success'; disabled?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-expanded={active}
      className={`outcome ${active ? (tone === 'success' ? 'outcome-success' : 'outcome-active') : ''}`}
    >
      <span className="[&>svg]:size-5">{icon}</span>
      <span className="text-[13px] font-semibold leading-tight sm:text-sm">{label}</span>
      {hint && <span className="text-[11px] text-muted">→ {hint}</span>}
    </button>
  )
}

function AnotherDay({ quickDays, busy, onPick }: { quickDays: { label: string; date: Date }[]; busy: boolean; onPick: (d: Date) => void }) {
  const [date, setDate] = useState('')
  return (
    <div className="animate-in space-y-3 rounded-2xl border border-line bg-surface-2 p-3">
      <p className="label">Vilken dag ska vi ringa igen?</p>
      <div className="flex flex-wrap gap-2">
        {quickDays.map((q) => (
          <button key={q.label} className="pill" disabled={busy} onClick={() => onPick(dayStart(toDateInput(q.date)))}>
            {q.label} <span className="text-muted">· {fmtDay.format(q.date)}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input type="date" className="input flex-1" min={toDateInput(addDays(new Date(), 1))} value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn btn-primary" disabled={!date || busy} onClick={() => onPick(dayStart(date))}>Flytta</button>
      </div>
    </div>
  )
}

function BookCall({ busy, onPick }: { busy: boolean; onPick: (d: Date) => void }) {
  const days = [nextBusinessDay(new Date(), 0)] // today, or Monday on weekends
  while (days.length < 6) days.push(nextBusinessDay(days[days.length - 1]))
  const [day, setDay] = useState(toDateInput(days[0]))
  const [time, setTime] = useState<string | null>(null)
  const now = Date.now()
  const chosen = time ? fromInputs(day, time) : null

  return (
    <div className="animate-in space-y-3 rounded-2xl border border-success/40 bg-success/5 p-3">
      <p className="label">Dag</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((d) => {
          const v = toDateInput(d)
          return (
            <button key={v} className={`pill shrink-0 ${day === v ? 'pill-on' : ''}`} onClick={() => { setDay(v); setTime(null) }}>
              {fmtDay.format(d)}
            </button>
          )
        })}
        <input type="date" className="input w-auto shrink-0 py-1.5" min={toDateInput(new Date())} value={day} onChange={(e) => { setDay(e.target.value); setTime(null) }} />
      </div>
      <p className="label">Tid</p>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {BOOKING_SLOTS.map((s) => {
          const past = fromInputs(day, s).getTime() < now
          return (
            <button key={s} disabled={past} className={`pill justify-center ${time === s ? 'pill-on' : ''}`} onClick={() => setTime(s)}>{s}</button>
          )
        })}
      </div>
      <button className="btn btn-success w-full" disabled={!chosen || busy} onClick={() => chosen && onPick(chosen)}>
        {chosen ? `Boka ${fmtDayTime(chosen)}` : 'Välj en tid'}
      </button>
    </div>
  )
}
