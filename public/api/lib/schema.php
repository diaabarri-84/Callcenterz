<?php
// Database schema (MySQL / MariaDB) and starter email templates. Run by install.php.
// Every statement is idempotent (IF NOT EXISTS / INSERT IGNORE), so re-running is safe.

declare(strict_types=1);

const CC_SCHEMA = [
    <<<'SQL'
    CREATE TABLE IF NOT EXISTS cc_agents (
      id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email          VARCHAR(191) NOT NULL UNIQUE,
      display_name   VARCHAR(100) NOT NULL,
      role           ENUM('agent', 'admin') NOT NULL DEFAULT 'agent',
      password_hash  VARCHAR(255) NOT NULL,
      active         TINYINT(1) NOT NULL DEFAULT 1,
      last_login_at  DATETIME NULL,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    SQL,

    // Columns 1:1 with contactlista/leads.csv + web enrichment + call and email state.
    // id doubles as queue_rank: leads are called in import order.
    <<<'SQL'
    CREATE TABLE IF NOT EXISTS cc_leads (
      id                       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      dedupe_key               VARCHAR(191) NOT NULL UNIQUE,

      company_name             VARCHAR(255) NOT NULL,
      email                    VARCHAR(255) NULL,
      phone                    VARCHAR(64)  NULL,
      niche                    VARCHAR(100) NULL,
      city                     VARCHAR(100) NULL,
      website                  VARCHAR(255) NULL,
      source_query             VARCHAR(255) NULL,
      bolagsnamn               VARCHAR(255) NULL,
      org_nr                   VARCHAR(20)  NULL,
      bolagstyp                VARCHAR(100) NULL,
      registreringsdatum       VARCHAR(20)  NULL,
      momsregistrerad          VARCHAR(10)  NULL,
      f_skatt                  VARCHAR(10)  NULL,
      arbetsgivarregistrerad   VARCHAR(10)  NULL,
      lan                      VARCHAR(100) NULL,
      enrich_source_url        VARCHAR(500) NULL,
      enrich_match_confidence  VARCHAR(20)  NULL,
      kontaktperson            VARCHAR(255) NULL,
      kontaktperson_roll       VARCHAR(100) NULL,

      om_foretaget             TEXT NULL,
      specialitet              TEXT NULL,
      webb_berikad_at          DATETIME NULL,

      email_opt_out            TINYINT(1) NOT NULL DEFAULT 0,
      emails_sent              INT UNSIGNED NOT NULL DEFAULT 0,
      last_emailed_at          DATETIME NULL,

      status                   ENUM('new', 'no_answer', 'rescheduled', 'booked', 'not_interested') NOT NULL DEFAULT 'new',
      next_call_at             DATETIME NULL,
      attempts                 INT UNSIGNED NOT NULL DEFAULT 0,
      last_called_at           DATETIME NULL,
      last_outcome             VARCHAR(20) NULL,
      script_answer            ENUM('A', 'B', 'C', 'D') NULL,
      notes                    TEXT NULL,
      locked_by                INT UNSIGNED NULL,
      locked_until             DATETIME NULL,

      created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      KEY cc_leads_queue (status, next_call_at),
      KEY cc_leads_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    SQL,

    <<<'SQL'
    CREATE TABLE IF NOT EXISTS cc_call_logs (
      id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      lead_id        INT UNSIGNED NOT NULL,
      agent_id       INT UNSIGNED NULL,
      outcome        ENUM('no_answer', 'another_day', 'booked', 'not_interested') NOT NULL,
      script_answer  ENUM('A', 'B', 'C', 'D') NULL,
      next_call_at   DATETIME NULL,
      notes          TEXT NULL,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY cc_call_logs_lead (lead_id, created_at),
      CONSTRAINT cc_call_logs_lead_fk FOREIGN KEY (lead_id) REFERENCES cc_leads (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    SQL,

    <<<'SQL'
    CREATE TABLE IF NOT EXISTS cc_bookings (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      lead_id     INT UNSIGNED NOT NULL,
      agent_id    INT UNSIGNED NULL,
      starts_at   DATETIME NOT NULL,
      ends_at     DATETIME NOT NULL,
      title       VARCHAR(255) NOT NULL,
      notes       TEXT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY cc_bookings_starts (starts_at),
      CONSTRAINT cc_bookings_lead_fk FOREIGN KEY (lead_id) REFERENCES cc_leads (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    SQL,

    <<<'SQL'
    CREATE TABLE IF NOT EXISTS cc_email_templates (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name        VARCHAR(191) NOT NULL UNIQUE,
      niches      TEXT NOT NULL,
      subject     VARCHAR(500) NOT NULL,
      body        TEXT NOT NULL,
      is_default  TINYINT(1) NOT NULL DEFAULT 0,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    SQL,

    <<<'SQL'
    CREATE TABLE IF NOT EXISTS cc_email_log (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      lead_id      INT UNSIGNED NULL,
      template_id  INT UNSIGNED NULL,
      agent_id     INT UNSIGNED NULL,
      sender       VARCHAR(255) NOT NULL,
      to_email     VARCHAR(255) NOT NULL,
      subject      VARCHAR(500) NOT NULL,
      body         TEXT NOT NULL,
      status       ENUM('sent', 'failed') NOT NULL,
      message_id   VARCHAR(255) NULL,
      error        TEXT NULL,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY cc_email_log_created (status, created_at),
      KEY cc_email_log_lead (lead_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    SQL,

    <<<'SQL'
    CREATE TABLE IF NOT EXISTS cc_login_attempts (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      ip          VARCHAR(45) NOT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY cc_login_attempts_ip (ip, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    SQL,
];

/** Starter templates (edit them in the app under "Utskick"). Mirrored in src/lib/api/demoSeed.ts */
function cc_seed_templates(): array
{
    $greeting = 'Hej {{#if first_name}}{{first_name}}{{else}}{{company_name}}{{/if}},';
    $sign = "Med vänliga hälsningar\n{{agent_name}}\nReklamx";
    return [
        [
            'name' => 'Standard – återförsäljare',
            'niches' => [],
            'is_default' => 1,
            'subject' => 'Frigolitskyltar som tillägg för {{company_name}}',
            'body' => "$greeting\n\nJag heter {{agent_name}} och hör av mig från Reklamx. Vi tillverkar frigolitskyltar – lätta, hållbara och kostnadseffektiva skyltar för handel, event och marknadsföring.\n\nEftersom ni på {{company_name}} jobbar med {{niche}} i {{city}} tror vi att frigolitskyltar kan bli ett naturligt tillägg till det ni redan erbjuder – ett format många slutkunder efterfrågar men sällan hittar hos sin vanliga leverantör.\n\nVi söker just nu utvalda återförsäljare. Har du 15 minuter för ett kort samtal den här veckan?\n\n$sign",
        ],
        [
            'name' => 'Dekor & folie',
            'niches' => ['bildekor', 'fordonsdekor', 'folierare', 'wrap', 'dekaltryck'],
            'is_default' => 0,
            'subject' => '{{company_name}} + frigolitskyltar = en enkel merförsäljning',
            'body' => "$greeting\n\nJag heter {{agent_name}} och ringer/skriver från Reklamx. Ni på {{company_name}} sitter redan med kunder som behöver synas – frigolitskyltar är ett lätt och prisvärt komplement till dekor och folie, perfekt för butik, mässa och event.\n\nVi söker utvalda återförsäljare i {{lan}} och tror att ni skulle passa bra. Kan vi ta ett kort samtal i veckan?\n\n$sign",
        ],
        [
            'name' => 'Personlig – webb',
            'niches' => [],
            'is_default' => 0,
            'subject' => 'Till {{company_name}} i {{city}}',
            'body' => "$greeting\n\n{{#if om_foretaget}}Jag läste om {{company_name}} – {{om_foretaget}}. {{/if}}Jag heter {{agent_name}} och hör av mig från Reklamx. Vi tillverkar frigolitskyltar – lätta, hållbara och kostnadseffektiva skyltar för handel, event och marknadsföring.\n\n{{#if specialitet}}Många som redan säljer {{specialitet}} får frågor om lätta skyltar till butik och event – där passar frigolit perfekt som tillägg.{{else}}Vi söker utvalda återförsäljare i {{lan}}, och med er kundbas inom {{niche}} tror vi att frigolitskyltar kan bli en enkel merförsäljning för er.{{/if}}\n\nHar du 15 minuter för ett kort samtal den här veckan?\n\n$sign",
        ],
        [
            'name' => 'Tryck & profilkläder',
            'niches' => ['trycksaker', 'profilkläder', 'tshirt tryck', 'visitkort tryck', 'flygblad tryck', 'reklamtryck', 'workwear tryck', 'affisch tryck', 'storformat tryck'],
            'is_default' => 0,
            'subject' => 'Ett nytt format till {{company_name}}s sortiment',
            'body' => "$greeting\n\n{{agent_name}} här från Reklamx. Ni på {{company_name}} producerar redan {{niche}} – många av era kunder behöver också skyltar till butik och event, och där passar frigolitskyltar perfekt: lätta, enkla att montera och ofta billigare än traditionella alternativ.\n\nVi bygger just nu ett nätverk av återförsäljare. Har du tid för ett kort samtal den här veckan?\n\n$sign",
        ],
    ];
}

function cc_migrate(PDO $pdo): void
{
    foreach (CC_SCHEMA as $sql) {
        $pdo->exec($sql);
    }
    $st = $pdo->prepare('INSERT IGNORE INTO cc_email_templates (name, niches, subject, body, is_default) VALUES (?, ?, ?, ?, ?)');
    foreach (cc_seed_templates() as $t) {
        $st->execute([$t['name'], json_encode($t['niches'], JSON_UNESCAPED_UNICODE), $t['subject'], $t['body'], $t['is_default']]);
    }
}
