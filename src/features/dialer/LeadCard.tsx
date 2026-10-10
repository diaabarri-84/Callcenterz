import { Building2, Globe, Hash, Mail, Map as MapIcon, MapPin, Tag, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { prettyWebsite, splitName } from '../../lib/leadVars'
import { fmtDayTime } from '../../lib/schedule'
import { STATUS_LABEL, type Lead } from '../../lib/types'

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 text-muted">{icon}</span>
      <div className="min-w-0">
        <div className="label">{label}</div>
        <div className="truncate text-[15px]">{children}</div>
      </div>
    </div>
  )
}

/** Opens the company on Google Maps (search by name + city), e.g. to check the address before calling. */
function mapsSearchUrl(lead: Lead) {
  const q = [lead.company_name, lead.city].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

export function LeadCard({ lead }: { lead: Lead }) {
  const { first, last } = splitName(lead.kontaktperson)
  const name = [first, last].filter(Boolean).join(' ')
  return (
    <article className="card overflow-hidden">
      <div className="space-y-3 px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          {lead.niche && <span className="chip chip-accent"><Tag className="size-3.5" />{lead.niche}</span>}
          {lead.status !== 'new' && <span className="chip">{STATUS_LABEL[lead.status]} · försök {lead.attempts + 1}</span>}
          {lead.email_opt_out && <span className="chip">Avregistrerad från mejl</span>}
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold leading-tight sm:text-[28px]">{lead.company_name}</h2>
          <p className="mt-1 font-mono text-lg tracking-tight text-muted">{lead.phone}</p>
        </div>
        {(lead.om_foretaget || lead.specialitet) && (
          <p className="text-sm leading-relaxed">
            {lead.om_foretaget && <span>{lead.om_foretaget.charAt(0).toUpperCase() + lead.om_foretaget.slice(1)}. </span>}
            {lead.specialitet && <span className="text-muted">Gör mest: {lead.specialitet}.</span>}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-6 border-t border-line px-5 py-2 sm:grid-cols-2">
        <Row icon={<UserRound className="size-4" />} label={lead.kontaktperson_roll ?? 'Kontaktperson'}>
          {name || <span className="text-muted">Okänd – fråga efter ansvarig</span>}
        </Row>
        <Row icon={<Building2 className="size-4" />} label="Bolagsnamn">{lead.bolagsnamn ?? '—'}</Row>
        <Row icon={<Hash className="size-4" />} label="Org.nr">{lead.org_nr ?? '—'}</Row>
        <Row icon={<MapPin className="size-4" />} label="Ort">{[lead.city, lead.lan].filter(Boolean).join(' · ') || '—'}</Row>
        <Row icon={<Globe className="size-4" />} label="Webbplats">
          {lead.website ? <a className="link" href={lead.website} target="_blank" rel="noreferrer">{prettyWebsite(lead.website)}</a> : '—'}
        </Row>
        <Row icon={<Mail className="size-4" />} label="E-post">
          {lead.email ? <a className="link" href={`mailto:${lead.email}`}>{lead.email}</a> : '—'}
        </Row>
        <Row icon={<MapIcon className="size-4" />} label="Google Maps">
          <a className="link" href={mapsSearchUrl(lead)} target="_blank" rel="noreferrer">Öppna i Google Maps ↗</a>
        </Row>
      </div>

      {(lead.notes || lead.last_called_at) && (
        <div className="border-t border-line bg-surface-2 px-5 py-3 text-sm">
          {lead.last_called_at && <p className="text-muted">Senast ringd {fmtDayTime(new Date(lead.last_called_at))}</p>}
          {lead.notes && <p className="mt-1 whitespace-pre-line">{lead.notes}</p>}
        </div>
      )}
    </article>
  )
}
