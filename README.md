# ReklamX Callcenter

Call-center operating system for Reklamx' reseller outreach: an auto-queued dialer, the partner-call script filled with each lead's data, a callback calendar, and tailored email outreach from your own cPanel mailbox.

Runs at **https://outreach.reklamx.se** on the reklamx.se cPanel account.

**Prova demon:** https://diaabarri-84.github.io/Callcenterz/ — samma app i demoläge med 6 påhittade företag (inga riktiga leads, inget skickas). Data sparas bara i din webbläsare.

**Stack:** Vite + React + TypeScript + Tailwind (static files) · PHP 8.1+ API · MySQL/MariaDB · cPanel mailbox (SMTP + IMAP). Nothing to install on the server.

## Vad systemet gör (kravlista)

**Ringa**
- Visar ett lead i taget: företagsnamn, kontaktperson och roll, telefonnummer, e-post, bolagsnamn, org.nr, ort/län, webbplats och anteckningar.
- Stor **Ring**-knapp som på en webbplats (`tel:`-länk) – ringer direkt från mobilen.
- **Nästa**-knapp bredvid: byter till nästa nummer i listan utan att registrera något. Överhoppade kan tas tillbaka.
- **Nästa i kön**: listan med kommande nummer – tryck på ett för att ringa det direkt.
- Efter "Ring" visas valen:
  - **Svarade inte** → flyttas automatiskt till nästa vardag.
  - **En annan dag** → välj dag (imorgon, om 2 dagar, nästa vecka eller datum).
  - **Boka samtal** → välj dag och tid (08:00–16:00) → hamnar i kalendern.
  - **Inte intresserad** → tas bort från ringlistan.
- Anteckning per samtal sparas på leadet. Manuset (A/B/C/D) med leadets namn och företag ifyllt.
- Två säljare får aldrig samma nummer samtidigt.

**Kalender** – bokade samtal och återuppringningar per dag.

**Leads** – sök/filtrera, ändra status och anteckningar, **Ring nu**, **Ring härnäst**, importera `leads.csv`.

**Utskick (e-post från cPanel-kontot)**
- Mallar med parametrar från leadet (`{{first_name}}`, `{{company_name}}`, `{{niche}}` …) och villkor, förhandsvisning per lead.
- Skicka ett mejl eller massutskick (bästa mall per nisch, max per dygn, hoppar över avregistrerade, ej intresserade och enskilda firmor).
- Inkorg/Skickat från samma e-postkonto: läs svar, svara, avregistrera, "Ring härnäst".
- Inga Google-omdömen i utskicken.

**Agenter (admin)** – lägg till säljare, byt lösenord, inaktivera.

## What's in it

| Screen | Phone | Desktop |
|---|---|---|
| **Ringa** | Next lead in the queue + one big **Ring** button (`tel:` link). After pressing it the outcome buttons expand: **Svarade inte** (auto-moved to next business day), **En annan dag** (pick a day), **Boka samtal** (day + time → calendar), plus *Inte intresserad*. | Same, plus the **manus** with the lead's name/company filled in and the A/B/C/D branch expanding on the answer. |
| **Kalender** | Month view of booked calls and rescheduled callbacks per day. | ← |
| **Leads** | Search/filter, edit notes/status, "Ring härnäst", **CSV import** (same columns as `contactlista/leads.csv`). | ← |
| **Utskick** | Email templates with `{{variables}}` from the lead columns, niche-matched template suggestion, live preview, send one or **Massutskick**, and the mailbox (**Inkorg / Skickat**). | ← |
| **Agenter** (admin) | Add callers, reset passwords, deactivate. | ← |

**Queue order:** due bookings/callbacks first (oldest first), then new leads in import order. Each lead handed out is locked to the agent for 10 minutes, so two callers never get the same number.

## First-time setup in cPanel

All of this is done in the browser. The command line is never needed.

1. **Subdomain** – cPanel → *Domains* → *Create A New Domain* → `outreach.reklamx.se`, untick *Share document root*. Note the folder it creates (e.g. `/home/<user>/outreach.reklamx.se`).
2. **DNS** – reklamx.se's DNS is at **Cloudflare**, so add the record there: type `A`, name `outreach`, IPv4 = the cPanel server's *Shared IP Address* (46.62.244.26 at the time of writing), proxy **DNS only** (grey cloud).
3. **HTTPS** – after ~15 min: cPanel → *SSL/TLS Status* → *Run AutoSSL*.
4. **Database** – cPanel → *Database Wizard*: database `outreach`, user `outreach`, generated password, **ALL PRIVILEGES**. cPanel prefixes both names with your account name — write down the full names.
5. **Mailbox** – cPanel → *Email Accounts* → create the sending address (e.g. `partner@reklamx.se`) or reuse an existing one. Replies to outreach land in its inbox.
6. **Upload** – on your computer: `npm install && npm run package` → `outreach-upload.zip`. cPanel → *File Manager* → the subdomain folder → *Upload* the zip → right-click → *Extract*. Enable *Settings → Show Hidden Files* to see the `.htaccess` files.
7. **Install** – open `https://outreach.reklamx.se/api/install.php` and fill in database, mailbox and your admin login. It tests the database, SMTP and IMAP before saving, creates the tables and starter templates, and writes `outreach-config.php` one level **above** the web root, where no URL can reach it. After that the page is locked.
8. **Log in** at `https://outreach.reklamx.se`, add your callers under **Agenter**, and import leads under **Leads → Importera CSV** → `contactlista/leads.csv` (or `leads_enriched.csv`).

On phones, open the site and "Lägg till på hemskärmen" — it runs full-screen like an app.

**Updating the app later:** `npm run package`, upload, extract over the old files (the config file is outside the folder and is not touched). If the release notes mention a database change, open `api/install.php?migrate=1` while logged in as admin.

## Email (E-post)

Everything goes through one cPanel mailbox:

- **Sending:** SMTP with SSL (`mail.reklamx.se:465`), logged in as the mailbox. Each sent email is also saved in the mailbox's *Sent* folder, so it shows in webmail (Roundcube) and under *Utskick → Skickat*.
- **Inkorg:** read over IMAP (`:993`). Mail is matched to its lead (by address, then company domain), with one-click *Avregistrera* (auto-highlighted when the reply asks to unsubscribe), *Ring härnäst* and *Svara* (threaded reply quoting the original).
- **Deliverability:** reklamx.se's MX already points to this server and SPF/DKIM/DMARC already exist, so nothing to add. Check cPanel → *Email Deliverability* shows reklamx.se as valid. Because DNS is at Cloudflare, cPanel can't fix records itself; copy any record it suggests into Cloudflare.

Settings live in `outreach-config.php` (above the web root). To change mailbox, password, sender name, reply-to or the daily cap, edit that file in File Manager:

```php
'mail' => [
  'from_email' => 'partner@reklamx.se',
  'from_name' => 'Reklamx',
  'reply_to' => null,          // e.g. 'info@reklamx.se'
  'daily_limit' => 150,        // emails per 24 h across all agents
  'pause_ms' => 2000,          // pause between emails in a batch
  'smtp' => ['host' => 'mail.reklamx.se', 'port' => 465, 'user' => '…', 'pass' => '…'],
  'imap' => ['host' => 'mail.reklamx.se', 'port' => 993, 'user' => '…', 'pass' => '…'],
],
```

**Built-in guard rails:**
- Every email gets an opt-out line and a `List-Unsubscribe` header. Leads marked *Avregistrerad* are never emailed again.
- Opted-out, not-interested and *enskild firma* leads are always skipped in bulk (sole traders count as private persons and need consent under marknadsföringslagen).
- Bulk sends go 10 at a time with a 2 s pause, and stop at the daily cap. **Shared cPanel hosts also cap emails per hour per domain** (often 100–500); exceeding it can block *all* reklamx.se mail for a while. Start with a low `daily_limit` and raise it gradually.
- Every send (or failure) is logged in `cc_email_log`; the lead gets `emails_sent` / `last_emailed_at`.

## Template syntax

```
{{first_name}}                              any parameter
{{#if kontaktperson}}…{{else}}…{{/if}}      when the field has a value
{{#if niche = bildekor|wrap}}…{{/if}}       when the value is one of these (case-insensitive)
{{#if bolagstyp = Aktiebolag}}…{{/if}}
```
Parameters: every `leads.csv` column, plus `first_name`, `last_name`, `kontaktperson_fullt`, `ar_i_branschen` (years since registration), `registreringsar`, `agent_name`, and the web-enrichment ones `om_foretaget` / `specialitet`. Full list: `PARAMETERS` in `src/lib/leadVars.ts`.

## Web enrichment (Brave Search)

`om_foretaget` (e.g. *ett familjeägt tryckeri i Malmö sedan 1957*) and `specialitet` (e.g. *foldrar, broschyrer och rollups*) come from each company's own website, via the scripts in `../contactlista/` (`brave_collect.py` → `enrich_out*.json` → `build_enriched.py` → `leads_enriched.csv`). Importing that CSV adds new leads and only fills these two columns on existing ones — call history is untouched. Review/rating columns in that CSV are ignored.

## Run locally

```bash
npm install
npm run dev
```

Without a PHP server the app runs in **demo mode**: data lives only in your browser's localStorage, six fictional leads are seeded (phone numbers from the PTS range reserved for fiction), and "Skicka" opens your mail client. Demo mode never activates on the real domain — if the server is unreachable there, the app says so instead.

## Project layout

```
src/
  lib/            types, template engine, scheduling rules, CSV import
  lib/api/        Api interface + phpApi (server) + demoApi (browser-only)
  features/
    dialer/       DialerPage, LeadCard, OutcomePanel (Svarade inte / En annan dag / Boka samtal)
    script/       manus.ts (the call script as data) + ScriptPanel
    calendar/     CalendarPage
    leads/        LeadsPage (+ CSV import, lead drawer)
    outreach/     templates + preview + send, mailbox
    agents/       AgentsPage (admin)
    auth/         session (server or demo), LoginScreen
public/
  .htaccess       HTTPS redirect, security headers
  api/
    index.php     the JSON API (POST {action, …})
    install.php   one-time setup page
    lib/          bootstrap (config/db/session), schema, leads, mail, smtp, imap, template
scripts/package.mjs   dist/ → outreach-upload.zip
```

- Edit the call script wording in `src/features/script/manus.ts`.
- Scheduling rules (retry time, booking slots 08:00–16:00) live in `src/lib/schedule.ts`.
- Security: logins use PHP sessions (HttpOnly, Secure, SameSite=Strict cookie) with `password_hash`, 10 failed logins per IP per 15 min lock that IP out, and `api/lib/` is not reachable from the web.

## Not built yet / next steps

- Calendar sync (Google/Outlook) for bookings.
- Follow-up sequences (e.g. a second email after 5 days), per-agent stats.
