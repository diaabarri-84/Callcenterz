import { CalendarDays, LogOut, Mail, Phone, ShieldCheck, Users } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { useSession } from '../features/auth/session'
import { Logo } from './Logo'

const NAV = [
  { to: '/', label: 'Ringa', icon: Phone, end: true },
  { to: '/kalender', label: 'Kalender', icon: CalendarDays },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/utskick', label: 'Utskick', icon: Mail },
]
const ADMIN_NAV = [{ to: '/agenter', label: 'Agenter', icon: ShieldCheck, end: false }]

export function Layout() {
  const { agent, api, signOut } = useSession()
  const nav = agent.role === 'admin' ? [...NAV, ...ADMIN_NAV] : NAV

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <Logo size={36} />
          <div className="leading-tight">
            <div className="font-display font-semibold">ReklamX</div>
            <div className="text-xs text-muted">Callcenter</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'nav-item-on' : ''}`}>
              <Icon className="size-[18px]" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-2">
          {api.mode === 'demo' && <span className="chip chip-warn">Demoläge</span>}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{agent.display_name}</div>
              <div className="text-xs capitalize text-muted">{agent.role}</div>
            </div>
            <button className="btn btn-ghost px-2.5" onClick={signOut} aria-label="Logga ut"><LogOut className="size-4" /></button>
          </div>
        </div>
      </aside>

      {/* Phone header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/85 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <span className="font-display font-semibold">Callcenter</span>
          {api.mode === 'demo' && <span className="chip chip-warn">Demo</span>}
        </div>
        <button className="flex items-center gap-1.5 text-sm text-muted" onClick={signOut}>
          {agent.display_name} <LogOut className="size-4" />
        </button>
      </header>

      <main className="min-w-0 px-4 py-4 pb-24 lg:h-dvh lg:overflow-y-auto lg:px-8 lg:py-6">
        <Outlet />
      </main>

      {/* Phone tab bar */}
      <nav className={`fixed inset-x-0 bottom-0 z-30 grid ${nav.length > 4 ? 'grid-cols-5' : 'grid-cols-4'} border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden`}>
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab ${isActive ? 'tab-on' : ''}`}>
            <Icon className="size-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
