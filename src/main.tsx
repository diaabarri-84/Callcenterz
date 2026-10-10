import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { AgentsPage } from './features/agents/AgentsPage'
import { SessionProvider } from './features/auth/session'
import { CalendarPage } from './features/calendar/CalendarPage'
import { DialerPage } from './features/dialer/DialerPage'
import { LeadsPage } from './features/leads/LeadsPage'
import { OutreachPage } from './features/outreach/OutreachPage'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <SessionProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DialerPage />} />
              <Route path="kalender" element={<CalendarPage />} />
              <Route path="leads" element={<LeadsPage />} />
              <Route path="utskick" element={<OutreachPage />} />
              <Route path="agenter" element={<AgentsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </SessionProvider>
    </ToastProvider>
  </StrictMode>,
)
