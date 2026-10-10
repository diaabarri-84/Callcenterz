// All scheduling is in the agent's local time (Europe/Stockholm in practice).

/** 08:00 … 16:00 in 30-minute steps. */
export const BOOKING_SLOTS = Array.from({ length: 17 }, (_, i) => {
  const minutes = 8 * 60 + i * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6

export function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function nextBusinessDay(from: Date, step = 1) {
  let d = addDays(from, step)
  while (isWeekend(d)) d = addDays(d, 1)
  return d
}

export function atTime(d: Date, hh: number, mm = 0) {
  const r = new Date(d)
  r.setHours(hh, mm, 0, 0)
  return r
}

/** "Svarade inte": try again next business day, around the same hour but inside 09–15:30. */
export function noAnswerRetry(now = new Date()) {
  const hour = Math.min(Math.max(now.getHours(), 9), 15)
  return atTime(nextBusinessDay(now), hour, now.getMinutes() < 30 ? 0 : 30)
}

/** "En annan dag": the lead becomes due at 08:00 on the chosen day. */
export function dayStart(dateInput: string) {
  return fromInputs(dateInput, '08:00')
}

export function fromInputs(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

export function toDateInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function startOfWeek(d: Date) {
  const r = atTime(d, 0)
  return addDays(r, -((r.getDay() + 6) % 7)) // Monday
}

export const fmtDay = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })
export const fmtTime = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' })
export const fmtMonth = new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric' })
export const fmtDayTime = (d: Date) => `${fmtDay.format(d)} ${fmtTime.format(d)}`
