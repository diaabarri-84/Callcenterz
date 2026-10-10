import { Inbox, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { MailboxView } from './MailboxView'
import { TailoredView } from './TailoredView'

type View = 'tailored' | 'mailbox'
const VIEW_KEY = 'reklamx-cc-outreach-view'

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'mailbox' ? 'mailbox' : 'tailored'
  } catch {
    return 'tailored'
  }
}

/** Utskick: switch between writing tailored emails and the cPanel mailbox. */
export function OutreachPage() {
  const [view, setView] = useState<View>(savedView)
  const pick = (v: View) => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold">Utskick</h1>
        <div role="tablist" className="ml-auto grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1 text-sm font-medium sm:ml-4">
          {([['tailored', 'Skräddarsytt', Sparkles], ['mailbox', 'Inkorg', Inbox]] as const).map(([v, label, Icon]) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => pick(v)}
              className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 transition ${view === v ? 'bg-accent text-white' : 'text-muted hover:text-fg'}`}>
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </header>
      {view === 'tailored' ? <TailoredView /> : <MailboxView />}
    </div>
  )
}
