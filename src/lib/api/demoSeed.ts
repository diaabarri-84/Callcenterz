import type { EmailTemplate, EnrichmentColumn, LeadCsvColumn, MailFolder, MailMessage } from '../types'

// Fictional companies. Phone numbers are from the PTS range reserved for fiction
// (070-17 406 05 – 99), so pressing "Ring" in demo mode never reaches a real person.
type Row = Record<LeadCsvColumn, string | null> & Partial<Record<EnrichmentColumn, string>>
const base = {
  source_query: null, bolagstyp: 'Aktiebolag', registreringsdatum: null, momsregistrerad: 'Ja', f_skatt: 'Ja',
  arbetsgivarregistrerad: 'Ja', enrich_source_url: null, enrich_match_confidence: 'high',
} satisfies Partial<Row>

export const DEMO_LEADS: Row[] = [
  { ...base, company_name: 'Söderns Tryckeri', email: 'info@exempel-soderns.se', phone: '+46 70 174 06 05', niche: 'trycksaker', city: 'Stockholm', website: 'https://exempel-soderns.se', bolagsnamn: 'Söderns Tryckeri AB', org_nr: '556000-0001', lan: 'Stockholms län', kontaktperson: 'Anna Maria Lindqvist', kontaktperson_roll: 'Verkställande direktör',
    om_foretaget: 'ett familjeägt tryckeri på Södermalm sedan 1994', specialitet: 'foldrar, affischer och rollups' },
  { ...base, company_name: 'Folie & Form', email: 'hej@exempel-folieform.se', phone: '+46 70 174 06 06', niche: 'bildekor', city: 'Malmö', website: 'https://exempel-folieform.se', bolagsnamn: 'Folie och Form i Malmö AB', org_nr: '556000-0002', lan: 'Skåne län', kontaktperson: 'Erik Johan Bergström', kontaktperson_roll: 'Ordförande',
    om_foretaget: 'en bildekorfirma i Malmö som folierar allt från skåpbilar till skyltfönster', specialitet: 'bildekor och fönsterfoliering' },
  { ...base, company_name: 'Profilverket', email: 'order@exempel-profilverket.se', phone: '+46 70 174 06 07', niche: 'profilkläder', city: 'Göteborg', website: 'https://exempel-profilverket.se', bolagsnamn: 'Profilverket Väst AB', org_nr: '556000-0003', lan: 'Västra Götalands län', kontaktperson: 'Sara Nilsson', kontaktperson_roll: 'Verkställande direktör' },
  { ...base, company_name: 'Skyltmakarna', email: 'info@exempel-skyltmakarna.se', phone: '+46 70 174 06 08', niche: 'skylttillverkare', city: 'Västerås', website: 'https://exempel-skyltmakarna.se', bolagsnamn: 'Skyltmakarna i Västerås AB', org_nr: '556000-0004', lan: 'Västmanlands län', kontaktperson: null, kontaktperson_roll: null },
  { ...base, company_name: 'Wrapstudion', email: 'kontakt@exempel-wrapstudion.se', phone: '+46 70 174 06 09', niche: 'wrap', city: 'Uppsala', website: 'https://exempel-wrapstudion.se', bolagsnamn: 'Wrapstudion Uppsala AB', org_nr: '556000-0005', lan: 'Uppsala län', kontaktperson: 'Mohammed Karim Haddad', kontaktperson_roll: 'Styrelseledamot' },
  { ...base, company_name: 'Mässexperten', email: 'info@exempel-massexperten.se', phone: '+46 70 174 06 10', niche: 'mässmaterial tryck', city: 'Örebro', website: 'https://exempel-massexperten.se', bolagsnamn: 'Mässexperten Örebro AB', org_nr: '556000-0006', lan: 'Örebro län', kontaktperson: 'Lena Holm', kontaktperson_roll: 'Verkställande direktör' },
]

// Mirrors cc_seed_templates() in public/api/lib/schema.php
export const DEFAULT_TEMPLATES: Omit<EmailTemplate, 'id'>[] = [
  {
    name: 'Standard – återförsäljare',
    niches: [],
    is_default: true,
    subject: 'Frigolitskyltar som tillägg för {{company_name}}',
    body: `Hej {{#if first_name}}{{first_name}}{{else}}{{company_name}}{{/if}},

Jag heter {{agent_name}} och hör av mig från Reklamx. Vi tillverkar frigolitskyltar – lätta, hållbara och kostnadseffektiva skyltar för handel, event och marknadsföring.

Eftersom ni på {{company_name}} jobbar med {{niche}} i {{city}} tror vi att frigolitskyltar kan bli ett naturligt tillägg till det ni redan erbjuder – ett format många slutkunder efterfrågar men sällan hittar hos sin vanliga leverantör.

Vi söker just nu utvalda återförsäljare. Har du 15 minuter för ett kort samtal den här veckan?

Med vänliga hälsningar
{{agent_name}}
Reklamx`,
  },
  {
    name: 'Dekor & folie',
    niches: ['bildekor', 'fordonsdekor', 'folierare', 'wrap', 'dekaltryck'],
    is_default: false,
    subject: '{{company_name}} + frigolitskyltar = en enkel merförsäljning',
    body: `Hej {{#if first_name}}{{first_name}}{{else}}{{company_name}}{{/if}},

Jag heter {{agent_name}} och ringer/skriver från Reklamx. Ni på {{company_name}} sitter redan med kunder som behöver synas – frigolitskyltar är ett lätt och prisvärt komplement till dekor och folie, perfekt för butik, mässa och event.

Vi söker utvalda återförsäljare i {{lan}} och tror att ni skulle passa bra. Kan vi ta ett kort samtal i veckan?

Med vänliga hälsningar
{{agent_name}}
Reklamx`,
  },
  {
    name: 'Personlig – webb',
    niches: [],
    is_default: false,
    subject: 'Till {{company_name}} i {{city}}',
    body: `Hej {{#if first_name}}{{first_name}}{{else}}{{company_name}}{{/if}},

{{#if om_foretaget}}Jag läste om {{company_name}} – {{om_foretaget}}. {{/if}}Jag heter {{agent_name}} och hör av mig från Reklamx. Vi tillverkar frigolitskyltar – lätta, hållbara och kostnadseffektiva skyltar för handel, event och marknadsföring.

{{#if specialitet}}Många som redan säljer {{specialitet}} får frågor om lätta skyltar till butik och event – där passar frigolit perfekt som tillägg.{{else}}Vi söker utvalda återförsäljare i {{lan}}, och med er kundbas inom {{niche}} tror vi att frigolitskyltar kan bli en enkel merförsäljning för er.{{/if}}

Har du 15 minuter för ett kort samtal den här veckan?

Med vänliga hälsningar
{{agent_name}}
Reklamx`,
  },
  {
    name: 'Tryck & profilkläder',
    niches: ['trycksaker', 'profilkläder', 'tshirt tryck', 'visitkort tryck', 'flygblad tryck', 'reklamtryck', 'workwear tryck', 'affisch tryck', 'storformat tryck'],
    is_default: false,
    subject: 'Ett nytt format till {{company_name}}s sortiment',
    body: `Hej {{#if first_name}}{{first_name}}{{else}}{{company_name}}{{/if}},

{{agent_name}} här från Reklamx. Ni på {{company_name}} producerar redan {{niche}} – många av era kunder behöver också skyltar till butik och event, och där passar frigolitskyltar perfekt: lätta, enkla att montera och ofta billigare än traditionella alternativ.

Vi bygger just nu ett nätverk av återförsäljare. Har du tid för ett kort samtal den här veckan?

Med vänliga hälsningar
{{agent_name}}
Reklamx`,
  },
]

/** Sample mailbox for demo mode (replies from demo leads + one unrelated mail). */
export function demoMail(): Record<MailFolder, MailMessage[]> {
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
  const addr = (address: string, name?: string) => ({ emailAddress: { address, name } })
  const msg = (m: Omit<MailMessage, 'id' | 'bodyPreview'> & { text: string }): MailMessage => ({
    ...m, id: crypto.randomUUID(), bodyPreview: m.text.slice(0, 200), body: { contentType: 'text', content: m.text },
  })
  return {
    inbox: [
      msg({
        subject: 'Sv: Ett nytt format till Söderns Tryckeris sortiment', from: addr('info@exempel-soderns.se', 'Anna Lindqvist'),
        toRecipients: [addr('partner@reklamx.se')], receivedDateTime: ago(2), isRead: false,
        text: 'Hej!\n\nLåter intressant – vi får faktiskt frågor om lätta skyltar till mässor ibland. Kan du ringa mig på torsdag förmiddag?\n\nMvh Anna',
      }),
      msg({
        subject: 'Sv: Till Wrapstudion i Uppsala', from: addr('kontakt@exempel-wrapstudion.se', 'Mohammed Haddad'),
        toRecipients: [addr('partner@reklamx.se')], receivedDateTime: ago(20), isRead: false,
        text: 'avregistrera tack',
      }),
      msg({
        subject: 'Faktura oktober', from: addr('ekonomi@exempel-leverantor.se', 'Leverantören AB'),
        toRecipients: [addr('partner@reklamx.se')], receivedDateTime: ago(46), isRead: true,
        text: 'Hej, bifogat finns oktoberfakturan. Vänliga hälsningar, Ekonomi',
      }),
    ],
    sentitems: [
      msg({
        subject: 'Folie & Form + frigolitskyltar = en enkel merförsäljning', from: addr('partner@reklamx.se'),
        toRecipients: [addr('hej@exempel-folieform.se')], sentDateTime: ago(26), isRead: true,
        text: 'Hej Erik,\n\nJag heter Diaa och ringer/skriver från Reklamx. Ni på Folie & Form sitter redan med kunder som behöver synas …',
      }),
    ],
  }
}
