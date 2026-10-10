import { Plus, UserRound } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useToast } from '../../components/Toast'
import { fmtDayTime } from '../../lib/schedule'
import type { AgentAccount } from '../../lib/types'
import { useSession } from '../auth/session'

type Draft = Omit<AgentAccount, 'id' | 'last_login_at'> & { id?: string }
const EMPTY: Draft = { email: '', display_name: '', role: 'agent', active: true, password: '' }

/** Admin: who may log in to the callcenter. */
export function AgentsPage() {
  const { api, agent: me } = useSession()
  const toast = useToast()
  const [agents, setAgents] = useState<AgentAccount[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(
    () => api.listAgents().then(setAgents).catch((e) => toast((e as Error).message, 'error')),
    [api, toast],
  )
  useEffect(() => { reload() }, [reload])

  if (me.role !== 'admin') return <p className="text-muted">Bara admin ser den här sidan.</p>

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    setBusy(true)
    try {
      await api.saveAgent({ ...draft, password: draft.password || undefined })
      toast(draft.id ? 'Sparat' : `${draft.display_name} kan nu logga in`, 'success')
      setDraft(null)
      reload()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold">Agenter</h1>
        <button className="btn btn-primary ml-auto" onClick={() => setDraft(EMPTY)}><Plus className="size-4" /> Ny agent</button>
      </header>

      {draft && (
        <form onSubmit={save} className="card animate-in space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="label">Namn (används i manus och mejl)</span>
              <input className="input" required value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="label">E-post (inloggning)</span>
              <input className="input" type="email" required value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="label">{draft.id ? 'Nytt lösenord (lämna tomt = oförändrat)' : 'Lösenord (minst 10 tecken)'}</span>
              <input className="input" type="password" autoComplete="new-password" minLength={10} required={!draft.id}
                value={draft.password ?? ''} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="label">Roll</span>
              <select className="input" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Draft['role'] })}>
                <option value="agent">Agent – ringer och mejlar</option>
                <option value="admin">Admin – kan även hantera agenter</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            Aktiv (kan logga in)
          </label>
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Sparar…' : 'Spara'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>Avbryt</button>
          </div>
        </form>
      )}

      {agents === null ? (
        <div className="card h-40 animate-pulse" />
      ) : (
        <div className="card divide-y divide-line">
          {agents.map((a) => (
            <button key={a.id} onClick={() => setDraft({ ...a, password: '' })}
              className={`flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-surface-2 ${a.active ? '' : 'opacity-50'}`}>
              <UserRound className="size-5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{a.display_name}{a.id === me.id && <span className="text-muted"> (du)</span>}</span>
                <span className="block truncate text-sm text-muted">{a.email}</span>
              </span>
              <span className="hidden text-right text-xs text-muted sm:block">
                {a.last_login_at ? `Senast inloggad ${fmtDayTime(new Date(a.last_login_at))}` : 'Aldrig inloggad'}
              </span>
              <span className={`chip ${a.role === 'admin' ? 'chip-accent' : ''}`}>{a.active ? (a.role === 'admin' ? 'Admin' : 'Agent') : 'Inaktiv'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
