import { GitBranch } from 'lucide-react'
import { useState } from 'react'
import { PARAMETERS, type Parameter } from '../../lib/leadVars'

const GROUPS = [...new Set(PARAMETERS.map((p) => p.group))] as Parameter['group'][]

/**
 * Every lead column as a clickable parameter, with the preview lead's value next to it,
 * plus a helper that inserts a value-based condition ("if niche = bildekor …").
 */
export function ParameterPanel({ vars, onInsert }: { vars: Record<string, string>; onInsert: (text: string) => void }) {
  const [condKey, setCondKey] = useState('niche')
  const [condValue, setCondValue] = useState('')
  const value = condValue || vars[condKey] || ''

  return (
    <div className="max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-line bg-surface-2/50 p-3">
      {GROUPS.map((g) => (
        <div key={g}>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{g}</p>
          <div className="flex flex-wrap gap-1.5">
            {PARAMETERS.filter((p) => p.group === g).map((p) => (
              <button
                key={p.key}
                onClick={() => onInsert(`{{${p.key}}}`)}
                title={`{{${p.key}}}`}
                className="group flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-xs transition hover:border-accent"
              >
                <span className="font-medium">{p.label}</span>
                <span className={`truncate ${vars[p.key] ? 'max-w-32 text-accent' : 'text-muted'}`}>
                  {vars[p.key] || '—'}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="border-t border-line pt-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          <GitBranch className="size-3.5" /> Villkor – olika text beroende på värde
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted">Om</span>
          <select className="input w-auto py-1.5 text-sm" value={condKey} onChange={(e) => { setCondKey(e.target.value); setCondValue('') }}>
            {PARAMETERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <span className="text-muted">=</span>
          <input className="input w-40 py-1.5 text-sm" value={value} placeholder="värde|värde2" onChange={(e) => setCondValue(e.target.value)} />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onInsert(`{{#if ${condKey}${value ? ` = ${value}` : ''}}}\n…text när det stämmer…\n{{else}}\n…annars…\n{{/if}}`)}
          >
            Infoga
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted">Tomt värde = "om fältet finns". Flera värden med |, t.ex. <code>bildekor|wrap</code>.</p>
      </div>
    </div>
  )
}
