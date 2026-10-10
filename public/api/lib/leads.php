<?php
// Leads, call queue, outcomes, calendar, templates and agents.

declare(strict_types=1);

require_once __DIR__ . '/template.php';

const CC_ENRICHMENT_COLUMNS = ['om_foretaget', 'specialitet'];
const CC_LEAD_PATCHABLE = ['notes', 'status', 'next_call_at', 'email', 'phone', 'kontaktperson', 'email_opt_out'];
const CC_STATUSES = ['new', 'no_answer', 'rescheduled', 'booked', 'not_interested'];

/** DB row → Lead object the app expects (string ids, ISO times, real booleans/numbers). */
function lead_out(array $r): array
{
    unset($r['locked_by'], $r['locked_until'], $r['created_at'], $r['updated_at']);
    $r['id'] = (string) $r['id'];
    $r['queue_rank'] = (int) $r['id'];
    foreach (['emails_sent', 'attempts'] as $k) {
        $r[$k] = (int) $r[$k];
    }
    $r['email_opt_out'] = (bool) $r['email_opt_out'];
    foreach (['next_call_at', 'last_called_at', 'last_emailed_at', 'webb_berikad_at'] as $k) {
        $r[$k] = to_iso($r[$k]);
    }
    return $r;
}

function template_out(array $t): array
{
    return [
        'id' => (string) $t['id'],
        'name' => $t['name'],
        'niches' => json_decode($t['niches'], true) ?: [],
        'subject' => $t['subject'],
        'body' => $t['body'],
        'is_default' => (bool) $t['is_default'],
    ];
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

/**
 * Hands out the next due lead and locks it to this agent for 10 minutes so two agents never dial
 * the same number. Due callbacks/bookings first (oldest first), then fresh leads in import order.
 * A single UPDATE … ORDER BY … LIMIT 1 is atomic, so concurrent agents can't grab the same row.
 */
function action_next_lead(array $agent, array $in = []): ?array
{
    q('UPDATE cc_leads SET locked_by = NULL, locked_until = NULL WHERE locked_by = ?', [$agent['id']]);
    // "Nästa nummer": leads the agent skipped this session are passed back so they aren't handed out again.
    [$skipSql, $skipParams] = exclude_clause($in['exclude'] ?? []);
    $st = q("UPDATE cc_leads
                SET locked_by = ?, locked_until = UTC_TIMESTAMP() + INTERVAL 10 MINUTE
              WHERE " . CC_DUE . " $skipSql
              ORDER BY next_call_at IS NULL, next_call_at, id
              LIMIT 1", [$agent['id'], ...$skipParams]);
    if ($st->rowCount() === 0) {
        return null;
    }
    $row = q('SELECT * FROM cc_leads WHERE locked_by = ? LIMIT 1', [$agent['id']])->fetch();
    return $row ? lead_out($row) : null;
}

/** Callable right now: not done, has a phone number, due, and not being called by another agent. */
const CC_DUE = "status <> 'not_interested'
                AND COALESCE(phone, '') <> ''
                AND (next_call_at IS NULL OR next_call_at <= UTC_TIMESTAMP())
                AND (locked_until IS NULL OR locked_until < UTC_TIMESTAMP())";

/** @return array{0: string, 1: int[]} " AND id NOT IN (…)" for up to 500 skipped lead ids */
function exclude_clause($ids): array
{
    $ids = array_slice(array_values(array_filter(array_map('intval', (array) $ids))), 0, 500);
    return $ids ? [' AND id NOT IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids] : ['', []];
}

/** The next few leads in the queue, so the agent sees who's coming and can pick one to call now. */
function action_upcoming_leads(array $agent, array $in): array
{
    [$skipSql, $skipParams] = exclude_clause($in['exclude'] ?? []);
    $rows = q('SELECT * FROM cc_leads
                WHERE ' . CC_DUE . " AND COALESCE(locked_by, 0) <> ? $skipSql
                ORDER BY next_call_at IS NULL, next_call_at, id
                LIMIT 8", [$agent['id'], ...$skipParams])->fetchAll();
    return array_map('lead_out', $rows);
}

/**
 * Takes a specific lead (picked from the upcoming list or the Leads page) and locks it to this agent.
 * Refused while another agent has it on screen, so two people never dial the same number.
 */
function action_claim_lead(array $agent, array $in): array
{
    $id = (int) ($in['id'] ?? 0);
    q('UPDATE cc_leads SET locked_by = NULL, locked_until = NULL WHERE locked_by = ? AND id <> ?', [$agent['id'], $id]);
    $st = q('UPDATE cc_leads SET locked_by = ?, locked_until = UTC_TIMESTAMP() + INTERVAL 10 MINUTE
              WHERE id = ? AND (locked_until IS NULL OR locked_until < UTC_TIMESTAMP() OR locked_by = ?)',
        [$agent['id'], $id, $agent['id']]);
    $row = q('SELECT * FROM cc_leads WHERE id = ?', [$id])->fetch() ?: fail('Lead saknas', 404);
    if ($st->rowCount() === 0 && (int) $row['locked_by'] !== (int) $agent['id']) {
        fail('En kollega ringer det här numret just nu', 409);
    }
    return lead_out($row);
}

/** Records a call outcome, reschedules the lead and (for 'booked') adds it to the calendar. */
function action_log_outcome(array $agent, array $in): array
{
    $leadId = (int) ($in['leadId'] ?? 0);
    $outcome = (string) ($in['outcome'] ?? '');
    $next = to_db_time($in['nextCallAt'] ?? null);
    $answer = in_array($in['scriptAnswer'] ?? null, ['A', 'B', 'C', 'D'], true) ? $in['scriptAnswer'] : null;
    $notes = trim((string) ($in['notes'] ?? ''));
    $status = ['no_answer' => 'no_answer', 'another_day' => 'rescheduled', 'booked' => 'booked', 'not_interested' => 'not_interested'][$outcome] ?? null;
    if (!$status) {
        fail('Okänt utfall');
    }
    if ($outcome !== 'not_interested' && $next === null) {
        fail('Utfallet kräver en tid för nästa samtal');
    }
    $lead = q('SELECT company_name, notes FROM cc_leads WHERE id = ?', [$leadId])->fetch() ?: fail('Lead saknas', 404);

    $pdo = db();
    $pdo->beginTransaction();
    q('INSERT INTO cc_call_logs (lead_id, agent_id, outcome, script_answer, next_call_at, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [$leadId, $agent['id'], $outcome, $answer, $next, $notes !== '' ? $notes : null]);
    $stamp = (new DateTimeImmutable('now', new DateTimeZone('Europe/Stockholm')))->format('Y-m-d H:i');
    $newNotes = $notes === '' ? $lead['notes'] : trim(($lead['notes'] ? $lead['notes'] . "\n" : '') . "$stamp — $notes");
    q('UPDATE cc_leads
          SET status = ?, next_call_at = ?, attempts = attempts + 1, last_called_at = UTC_TIMESTAMP(),
              last_outcome = ?, script_answer = COALESCE(?, script_answer), notes = ?,
              locked_by = NULL, locked_until = NULL
        WHERE id = ?',
        [$status, $outcome === 'not_interested' ? null : $next, $outcome, $answer, $newNotes, $leadId]);
    if ($outcome === 'booked') {
        q('INSERT INTO cc_bookings (lead_id, agent_id, starts_at, ends_at, title, notes) VALUES (?, ?, ?, ? + INTERVAL 30 MINUTE, ?, ?)',
            [$leadId, $agent['id'], $next, $next, 'Samtal: ' . $lead['company_name'], $notes !== '' ? $notes : null]);
    }
    $pdo->commit();
    return ['ok' => true];
}

function action_queue_stats(): array
{
    $r = q("SELECT
              SUM(status <> 'not_interested' AND (next_call_at IS NULL OR next_call_at <= UTC_TIMESTAMP())) AS dueNow,
              SUM(status <> 'not_interested' AND next_call_at > UTC_TIMESTAMP()) AS later,
              SUM(status = 'booked') AS booked,
              SUM(status = 'not_interested') AS done,
              COUNT(*) AS total
            FROM cc_leads")->fetch();
    return array_map(fn ($v) => (int) $v, $r);
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

function action_list_leads(): array
{
    return array_map('lead_out', q('SELECT * FROM cc_leads ORDER BY id')->fetchAll());
}

function action_update_lead(array $in): array
{
    $id = (int) ($in['id'] ?? 0);
    $patch = array_intersect_key((array) ($in['patch'] ?? []), array_flip(CC_LEAD_PATCHABLE));
    if (!$patch) {
        return ['ok' => true];
    }
    $sets = [];
    $params = [];
    foreach ($patch as $k => $v) {
        if ($k === 'status' && !in_array($v, CC_STATUSES, true)) {
            fail('Okänd status');
        }
        if ($k === 'next_call_at') {
            $v = to_db_time($v);
        } elseif ($k === 'email_opt_out') {
            $v = $v ? 1 : 0;
        } elseif ($v !== null) {
            $v = trim((string) $v);
            $v = $v === '' ? null : $v;
        }
        $sets[] = "$k = ?";
        $params[] = $v;
    }
    $params[] = $id;
    q('UPDATE cc_leads SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
    return ['ok' => true];
}

/**
 * Inserts new leads. For leads already present (same dedupe_key) only the web-enrichment columns
 * are updated — call status and history are never touched.
 */
function action_import_leads(array $in): array
{
    $rows = (array) ($in['rows'] ?? []);
    if (count($rows) > 2000) {
        fail('Max 2000 rader per anrop');
    }
    $cols = array_merge(['dedupe_key'], CC_CSV_COLUMNS, CC_ENRICHMENT_COLUMNS);
    $insert = db()->prepare(
        'INSERT IGNORE INTO cc_leads (' . implode(', ', $cols) . ', webb_berikad_at) VALUES (' .
        implode(', ', array_fill(0, count($cols), '?')) . ', ?)',
    );
    $enrich = db()->prepare(
        'UPDATE cc_leads SET om_foretaget = COALESCE(?, om_foretaget), specialitet = COALESCE(?, specialitet),
                webb_berikad_at = UTC_TIMESTAMP() WHERE dedupe_key = ?',
    );
    $inserted = 0;
    $enriched = 0;
    $pdo = db();
    $pdo->beginTransaction();
    foreach ($rows as $row) {
        $row = (array) $row;
        $key = trim((string) ($row['dedupe_key'] ?? ''));
        if ($key === '' || trim((string) ($row['company_name'] ?? '')) === '') {
            continue;
        }
        $val = function (string $c) use ($row) {
            $v = isset($row[$c]) ? trim((string) $row[$c]) : '';
            return $v === '' ? null : $v;
        };
        $hasEnrichment = $val('om_foretaget') !== null || $val('specialitet') !== null;
        $insert->execute(array_merge(array_map($val, $cols), [$hasEnrichment ? gmdate('Y-m-d H:i:s') : null]));
        if ($insert->rowCount() > 0) {
            $inserted++;
        } elseif ($hasEnrichment) {
            $enrich->execute([$val('om_foretaget'), $val('specialitet'), $key]);
            $enriched += $enrich->rowCount() > 0 ? 1 : 0;
        }
    }
    $pdo->commit();
    return ['inserted' => $inserted, 'enriched' => $enriched];
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function action_list_bookings(array $in): array
{
    $rows = q('SELECT b.*, l.company_name, l.kontaktperson, l.phone
                 FROM cc_bookings b JOIN cc_leads l ON l.id = b.lead_id
                WHERE b.starts_at >= ? AND b.starts_at < ?
                ORDER BY b.starts_at', [to_db_time($in['from'] ?? null), to_db_time($in['to'] ?? null)])->fetchAll();
    return array_map(fn ($b) => [
        'id' => (string) $b['id'],
        'lead_id' => (string) $b['lead_id'],
        'agent_id' => $b['agent_id'] === null ? null : (string) $b['agent_id'],
        'starts_at' => to_iso($b['starts_at']),
        'ends_at' => to_iso($b['ends_at']),
        'title' => $b['title'],
        'notes' => $b['notes'],
        'lead' => ['company_name' => $b['company_name'], 'kontaktperson' => $b['kontaktperson'], 'phone' => $b['phone']],
    ], $rows);
}

/** Leads rescheduled ("Svarade inte" / "En annan dag") that become due in the range. */
function action_list_scheduled(array $in): array
{
    return array_map('lead_out', q("SELECT * FROM cc_leads
        WHERE status IN ('no_answer', 'rescheduled') AND next_call_at >= ? AND next_call_at < ?
        ORDER BY next_call_at", [to_db_time($in['from'] ?? null), to_db_time($in['to'] ?? null)])->fetchAll());
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function action_list_templates(): array
{
    return array_map('template_out', q('SELECT * FROM cc_email_templates ORDER BY is_default DESC, name')->fetchAll());
}

function action_save_template(array $in): array
{
    $t = (array) ($in['template'] ?? []);
    $name = trim((string) ($t['name'] ?? ''));
    if ($name === '') {
        fail('Mallen behöver ett namn');
    }
    $niches = json_encode(array_values(array_filter(array_map('trim', (array) ($t['niches'] ?? [])))), JSON_UNESCAPED_UNICODE);
    $params = [$name, $niches, (string) ($t['subject'] ?? ''), (string) ($t['body'] ?? ''), empty($t['is_default']) ? 0 : 1];
    try {
        if (!empty($t['id'])) {
            q('UPDATE cc_email_templates SET name = ?, niches = ?, subject = ?, body = ?, is_default = ? WHERE id = ?', [...$params, (int) $t['id']]);
            $id = (int) $t['id'];
        } else {
            q('INSERT INTO cc_email_templates (name, niches, subject, body, is_default) VALUES (?, ?, ?, ?, ?)', $params);
            $id = (int) db()->lastInsertId();
        }
    } catch (PDOException $e) {
        if (($e->errorInfo[1] ?? null) === 1062) {
            fail('Det finns redan en mall med det namnet');
        }
        throw $e;
    }
    return template_out(q('SELECT * FROM cc_email_templates WHERE id = ?', [$id])->fetch());
}

function action_delete_template(array $in): array
{
    q('DELETE FROM cc_email_templates WHERE id = ?', [(int) ($in['id'] ?? 0)]);
    return ['ok' => true];
}

// ---------------------------------------------------------------------------
// Agents (admin)
// ---------------------------------------------------------------------------

function agent_out(array $a): array
{
    return [
        'id' => (string) $a['id'],
        'email' => $a['email'],
        'display_name' => $a['display_name'],
        'role' => $a['role'],
        'active' => (bool) $a['active'],
        'last_login_at' => to_iso($a['last_login_at']),
    ];
}

/** @param array $admin proof the caller is an admin (from require_admin) */
function action_list_agents(array $admin): array
{
    return array_map('agent_out', q('SELECT * FROM cc_agents ORDER BY active DESC, display_name')->fetchAll());
}

function action_save_agent(array $me, array $in): array
{
    $a = (array) ($in['agent'] ?? []);
    $email = mb_strtolower(trim((string) ($a['email'] ?? '')));
    $name = trim((string) ($a['display_name'] ?? ''));
    $role = ($a['role'] ?? 'agent') === 'admin' ? 'admin' : 'agent';
    $active = !isset($a['active']) || $a['active'] ? 1 : 0;
    $password = (string) ($a['password'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $name === '') {
        fail('Ange namn och en giltig e-post');
    }
    if ($password !== '' && strlen($password) < 10) {
        fail('Lösenordet måste vara minst 10 tecken');
    }
    $id = (int) ($a['id'] ?? 0);
    if ($id === (int) $me['id'] && ($role !== 'admin' || !$active)) {
        fail('Du kan inte ta bort din egen admin-behörighet');
    }
    try {
        if ($id) {
            q('UPDATE cc_agents SET email = ?, display_name = ?, role = ?, active = ? WHERE id = ?', [$email, $name, $role, $active, $id]);
            if ($password !== '') {
                q('UPDATE cc_agents SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $id]);
            }
        } else {
            if ($password === '') {
                fail('Ange ett lösenord för den nya agenten');
            }
            q('INSERT INTO cc_agents (email, display_name, role, active, password_hash) VALUES (?, ?, ?, ?, ?)',
                [$email, $name, $role, $active, password_hash($password, PASSWORD_DEFAULT)]);
            $id = (int) db()->lastInsertId();
        }
    } catch (PDOException $e) {
        if (($e->errorInfo[1] ?? null) === 1062) {
            fail('E-postadressen används redan');
        }
        throw $e;
    }
    return agent_out(q('SELECT * FROM cc_agents WHERE id = ?', [$id])->fetch());
}
