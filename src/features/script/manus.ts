import type { ScriptAnswer } from '../../lib/types'

// "Manus – Reklamx Partnersamtal". Edit wording here; {{vars}} are filled from the lead
// (see lib/leadVars.ts) and {{#if}} blocks pick a fallback when data is missing.

export type ScriptLine = { kind: 'say'; text: string } | { kind: 'listen' }

export const INTRO: ScriptLine[] = [
  {
    kind: 'say',
    text: 'Hej, mitt namn är {{agent_name}} och jag ringer på uppdrag av Reklamx. {{#if kontaktperson}}Pratar jag med {{kontaktperson}}?{{else}}Pratar jag med den som ansvarar för inköp på {{company_name}}?{{/if}}',
  },
  {
    kind: 'say',
    text: 'Reklamx är ett reklamföretag specialiserat på frigolit skyltar – lätta, hållbara och kostnadseffektiva skyltar för handel, event och marknadsföring. Vi söker just nu utvalda återförsäljare att samarbeta med. Har du en minut?',
  },
]

export const QUESTION = 'Hur ser ni på skyltning och reklamaterial i er verksamhet idag – jobbar ni med…'

export const CLOSE = 'Vi bokar just nu in möten med intresserade återförsäljare – när på schemat skulle passa din tid?'

export const BRANCHES: Record<ScriptAnswer, { label: string; lines: ScriptLine[] }> = {
  A: {
    label: 'Egna skyltar / trycksaker',
    lines: [
      { kind: 'say', text: 'Ah okej, så ni producerar eller beställer eget material – det är bra. Hur brukar processen se ut, sköter ni det internt eller går det via en tryckleverantör?' },
      { kind: 'listen' },
      { kind: 'say', text: 'Förstår. Anledningen jag frågar är att frigolit skyltar ofta kompletterar det befintliga sortimentet – det är ett format som många slutkunder efterfrågar men sällan hittar hos sin vanliga leverantör. Har ni fått förfrågningar på den typen av skyltar från era kunder?' },
    ],
  },
  B: {
    label: 'Externa leverantörer för skyltmaterial',
    lines: [
      { kind: 'say', text: 'Okej, så ni jobbar redan med leverantörer för skyltmaterial – vilken typ av produkter rör det sig om mestadels?' },
      { kind: 'listen' },
      { kind: 'say', text: 'Intressant. Frigolit skyltar är ett lite eget segment – lätta, enkla att montera och ofta billigare att producera än traditionella alternativ. Ser ni att era kunder efterfrågar något i den stilen idag, eller är det inget ni stött på ännu?' },
    ],
  },
  C: {
    label: 'Inget skyltbehov just nu',
    lines: [
      { kind: 'say', text: 'Det förstår jag – det är inte alla verksamheter som har det som sitt fokus. Får jag fråga vad ni primärt erbjuder era kunder?' },
      { kind: 'listen' },
      { kind: 'say', text: 'Tack. Anledningen jag ändå lyfter det är att frigolit skyltar ofta säljs som tilläggsprodukter snarare än en kärnprodukt – det är ett litet ja från kunden som ger er en extra intäkt utan att förändra er verksamhet. Är det något ni skulle vara öppna för att titta på?' },
    ],
  },
  D: {
    label: 'Hanteras från fall till fall',
    lines: [
      { kind: 'say', text: 'Det låter bekant – många gör det så. Vad brukar trigga att ni tar in skyltmaterial, är det kund- eller projektspecifikt?' },
      { kind: 'listen' },
      { kind: 'say', text: 'Precis, och det är egentligen där vi passar in. Eftersom ni redan hanterar det vid behov skulle ni kunna erbjuda frigolit skyltar som ett fast alternativ när behovet dyker upp – utan att behöva lägga tid på att söka leverantör varje gång. Skulle det kunna förenkla den processen för er?' },
    ],
  },
}
