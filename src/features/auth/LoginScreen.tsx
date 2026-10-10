import { useState, type FormEvent, type ReactNode } from 'react'
import { Logo } from '../../components/Logo'
import { auth } from '../../lib/api/phpApi'
import type { Agent } from '../../lib/types'

export function LoginScreen({ demo, onDemoLogin, onLogin }: {
  demo?: boolean
  onDemoLogin?: (name: string) => void
  onLogin?: (agent: Agent) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (demo) return name.trim() && onDemoLogin?.(name.trim())
    setBusy(true)
    try {
      const { agent } = await auth.login(email, password)
      onLogin?.(agent)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <form onSubmit={submit} className="card w-full max-w-sm space-y-5 p-7">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="font-display text-xl font-semibold">Callcenter</h1>
            <p className="text-sm text-muted">{demo ? 'Demoläge – data sparas bara i den här webbläsaren' : 'Logga in för att börja ringa'}</p>
          </div>
        </div>

        {demo ? (
          <label className="block space-y-1.5">
            <span className="label">Ditt namn (används i manuset)</span>
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="t.ex. Diaa" />
          </label>
        ) : (
          <>
            <label className="block space-y-1.5">
              <span className="label">E-post</span>
              <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="label">Lösenord</span>
              <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          </>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Loggar in…' : demo ? 'Starta demo' : 'Logga in'}</button>
      </form>
    </Centered>
  )
}

export function NotInstalledScreen() {
  return (
    <Centered>
      <div className="card max-w-md space-y-4 p-7">
        <h1 className="font-display text-xl font-semibold">Inte installerat än</h1>
        <p className="text-sm text-muted">Databasen och e-postkontot är inte inställda. Öppna installationen och fyll i uppgifterna från cPanel.</p>
        <a className="btn btn-primary" href="api/install.php">Öppna installationen</a>
      </div>
    </Centered>
  )
}

export function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <Centered>
      <div className="card max-w-md space-y-4 p-7">
        <h1 className="font-display text-xl font-semibold">Kan inte nå servern</h1>
        <p className="text-sm text-muted">Kontrollera internetanslutningen. Om felet består: titta i cPanel → <i>Errors</i> eller filen <code>api/error_log</code>.</p>
        <button className="btn btn-primary" onClick={onRetry}>Försök igen</button>
      </div>
    </Centered>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="grid min-h-dvh place-items-center px-4">{children}</div>
}
