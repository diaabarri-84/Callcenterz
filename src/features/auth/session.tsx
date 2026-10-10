import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createDemoApi } from '../../lib/api/demoApi'
import { ApiError, auth, createPhpApi } from '../../lib/api/phpApi'
import type { Api } from '../../lib/api/types'
import type { Agent } from '../../lib/types'
import { LoginScreen, NotInstalledScreen, OfflineScreen } from './LoginScreen'

interface SessionValue {
  api: Api
  agent: Agent
  signOut(): void
}

const Ctx = createContext<SessionValue | null>(null)

export function useSession() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession outside SessionProvider')
  return v
}

const DEMO_NAME_KEY = 'reklamx-cc-agent-name'

type Probe = 'loading' | 'server' | 'demo' | 'not_installed' | 'offline'

/**
 * Asks the PHP API who is logged in. Without a PHP server (npm run dev on your own computer)
 * the app falls back to demo mode with browser-only data. On the real domain it never does —
 * an unreachable server shows an error instead, so nobody works in a local copy by mistake.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [probe, setProbe] = useState<Probe>('loading')
  const [agent, setAgent] = useState<Agent | null>(null)
  const local = import.meta.env.DEV || ['localhost', '127.0.0.1'].includes(location.hostname)

  const check = useCallback(() => {
    setProbe('loading')
    auth.me()
      .then((r) => { setAgent(r.agent); setProbe('server') })
      .catch((e) => setProbe(e instanceof ApiError && e.install ? 'not_installed' : local ? 'demo' : 'offline'))
  }, [local])
  useEffect(check, [check])

  if (probe === 'loading') return <Splash />
  if (probe === 'demo') return <DemoSession>{children}</DemoSession>
  if (probe === 'not_installed') return <NotInstalledScreen />
  if (probe === 'offline') return <OfflineScreen onRetry={check} />
  if (!agent) return <LoginScreen onLogin={setAgent} />
  return <ServerSession agent={agent} onSignOut={() => auth.logout().finally(() => setAgent(null))}>{children}</ServerSession>
}

function ServerSession({ agent, onSignOut, children }: { agent: Agent; onSignOut: () => void; children: ReactNode }) {
  const api = useMemo(() => createPhpApi(), [])
  return <Ctx.Provider value={{ api, agent, signOut: onSignOut }}>{children}</Ctx.Provider>
}

function DemoSession({ children }: { children: ReactNode }) {
  const [name, setName] = useState(() => localStorage.getItem(DEMO_NAME_KEY) ?? '')
  const api = useMemo(() => createDemoApi(() => localStorage.getItem(DEMO_NAME_KEY) ?? ''), [])

  if (!name) {
    return (
      <LoginScreen
        demo
        onDemoLogin={(n) => {
          localStorage.setItem(DEMO_NAME_KEY, n)
          setName(n)
        }}
      />
    )
  }
  const value: SessionValue = {
    api,
    agent: { id: 'demo', display_name: name, role: 'admin' },
    signOut: () => {
      localStorage.removeItem(DEMO_NAME_KEY)
      setName('')
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function Splash() {
  return <div className="grid min-h-dvh place-items-center text-muted">Laddar…</div>
}
