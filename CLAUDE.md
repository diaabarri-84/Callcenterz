# CLAUDE.md — ReklamX Callcenter

Read README.md first for features, setup and layout.

## Hosting (cPanel, outreach.reklamx.se)

- Static React build + PHP API (`public/api/`, copied into `dist/api/` by Vite) + MySQL/MariaDB. No Node on the server, no Composer.
- PHP 8.1+ only. Every file uses `declare(strict_types=1)`. No external libraries — SMTP and IMAP are hand-written in `public/api/lib/smtp.php` and `imap.php`.
- The config file (database + mailbox passwords) lives one level above the web root (`cc_config_path()`). Never move it into the web root and never commit it.
- Schema changes go in `public/api/lib/schema.php` and must stay idempotent (`CREATE TABLE IF NOT EXISTS`, `INSERT IGNORE`). For a new column on an existing table, add a guarded `ALTER TABLE` (check `information_schema` first). Admins apply it via `api/install.php?migrate=1`.
- Store times as UTC `DATETIME`; convert with `to_db_time()` / `to_iso()`.
- Never commit lead data (`*.csv`, `*.xlsx` are gitignored) — it is personal data.

## Code conventions

- UI copy is Swedish; code and comments are English.
- All backend access goes through the `Api` interface in `src/lib/api/types.ts`; implement new methods in `phpApi.ts` (+ an action in `public/api/index.php`) and in `demoApi.ts`.
- `src/lib/template.ts` / `src/lib/leadVars.ts` are mirrored in `public/api/lib/template.php` — change both.
- No review/rating data (Google or other) in templates or lead data — it was removed deliberately.
- Styling: Tailwind with tokens in `src/index.css` (light + dark). Reuse the component classes there (`card`, `btn`, `pill`, `chip`, …).
- `npm run build` must pass (it runs `tsc --noEmit`). `npm run package` builds `outreach-upload.zip` for File Manager.
