import { Ear } from 'lucide-react'
import { RichTemplate } from '../../components/RichTemplate'
import type { ScriptAnswer } from '../../lib/types'
import { BRANCHES, CLOSE, INTRO, QUESTION, type ScriptLine } from './manus'

function Lines({ lines, vars }: { lines: ScriptLine[]; vars: Record<string, string> }) {
  return (
    <>
      {lines.map((l, i) =>
        l.kind === 'listen' ? (
          <p key={i} className="flex items-center gap-2 text-sm font-medium text-muted">
            <Ear className="size-4" /> Lyssna
          </p>
        ) : (
          <p key={i} className="script-line"><RichTemplate text={l.text} vars={vars} /></p>
        ),
      )}
    </>
  )
}

export function ScriptPanel({ vars, answer, onAnswer }: {
  vars: Record<string, string>
  answer: ScriptAnswer | null
  onAnswer: (a: ScriptAnswer | null) => void
}) {
  return (
    <section className="card flex min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <h2 className="font-display text-lg font-semibold">Manus · Partnersamtal</h2>
        {answer && <button className="text-sm text-muted hover:text-fg" onClick={() => onAnswer(null)}>Återställ svar</button>}
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <Lines lines={INTRO} vars={vars} />

        <div className="rounded-2xl bg-accent-soft p-4">
          <p className="script-line font-medium">{QUESTION}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(Object.keys(BRANCHES) as ScriptAnswer[]).map((k) => (
              <button
                key={k}
                onClick={() => onAnswer(k)}
                aria-pressed={answer === k}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  answer === k ? 'border-accent bg-accent text-white' : 'border-line bg-surface hover:border-accent'
                }`}
              >
                <span className={`grid size-7 shrink-0 place-items-center rounded-lg font-display font-semibold ${answer === k ? 'bg-white/20' : 'bg-surface-2'}`}>{k}</span>
                {BRANCHES[k].label}
              </button>
            ))}
          </div>
        </div>

        {answer && (
          <div key={answer} className="animate-in space-y-5 border-l-2 border-accent pl-4">
            <Lines lines={BRANCHES[answer].lines} vars={vars} />
            <p className="script-line font-semibold">{CLOSE}</p>
            <p className="text-sm text-muted">→ Välj <b>Boka samtal</b> till vänster när ni hittat en tid.</p>
          </div>
        )}
      </div>
    </section>
  )
}
