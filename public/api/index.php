<?php
// ReklamX Callcenter API. Every call is POST api/index.php with a JSON body { "action": "...", ... }.

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/leads.php';
require_once __DIR__ . '/lib/mail.php';

set_exception_handler(function (Throwable $e): void {
    error_log('[callcenter] ' . $e);
    json_out(['error' => $e instanceof RuntimeException ? $e->getMessage() : 'Serverfel – se error_log i cPanel'], 500);
});

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('Använd POST', 405);
}
// Cross-site requests can't set a JSON content type without a CORS preflight, which we never allow.
if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
    fail('Fel innehållstyp', 415);
}
$in = json_decode(file_get_contents('php://input') ?: '{}', true);
if (!is_array($in)) {
    fail('Ogiltig JSON');
}
$action = (string) ($in['action'] ?? '');

// ---- actions that don't need a login -------------------------------------
switch ($action) {
    case 'me':
        cc_config();
        $agent = current_agent();
        json_out(['agent' => $agent ? ['id' => $agent['id'], 'display_name' => $agent['display_name'], 'role' => $agent['role']] : null]);

    case 'login':
        $ip = client_ip();
        q('DELETE FROM cc_login_attempts WHERE created_at < UTC_TIMESTAMP() - INTERVAL 1 DAY');
        $recent = (int) q('SELECT COUNT(*) FROM cc_login_attempts WHERE ip = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 15 MINUTE', [$ip])->fetchColumn();
        if ($recent >= 10) {
            fail('För många försök. Vänta 15 minuter.', 429);
        }
        $email = mb_strtolower(trim((string) ($in['email'] ?? '')));
        $row = q('SELECT * FROM cc_agents WHERE email = ? AND active = 1', [$email])->fetch();
        if (!$row || !password_verify((string) ($in['password'] ?? ''), $row['password_hash'])) {
            q('INSERT INTO cc_login_attempts (ip) VALUES (?)', [$ip]);
            fail('Fel e-post eller lösenord.', 401);
        }
        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
            q('UPDATE cc_agents SET password_hash = ? WHERE id = ?', [password_hash((string) $in['password'], PASSWORD_DEFAULT), $row['id']]);
        }
        start_session();
        session_regenerate_id(true);
        $_SESSION['agent_id'] = (int) $row['id'];
        q('UPDATE cc_agents SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [$row['id']]);
        json_out(['agent' => ['id' => (string) $row['id'], 'display_name' => $row['display_name'], 'role' => $row['role']]]);

    case 'logout':
        start_session();
        $_SESSION = [];
        session_destroy();
        json_out(['ok' => true]);
}

// ---- everything else requires a logged-in agent ---------------------------
$agent = require_agent();
// Release the session lock so a long bulk send doesn't block the agent's other requests.
session_write_close();

json_out(match ($action) {
    'nextLead' => action_next_lead($agent, $in),
    'upcomingLeads' => action_upcoming_leads($agent, $in),
    'claimLead' => action_claim_lead($agent, $in),
    'logOutcome' => action_log_outcome($agent, $in),
    'queueStats' => action_queue_stats(),
    'listLeads' => action_list_leads(),
    'updateLead' => action_update_lead($in),
    'importLeads' => action_import_leads($in),
    'listBookings' => action_list_bookings($in),
    'listScheduled' => action_list_scheduled($in),
    'listTemplates' => action_list_templates(),
    'saveTemplate' => action_save_template($in),
    'deleteTemplate' => action_delete_template($in),
    'send' => action_send($agent, $in),
    'mailList' => action_mail_list($in),
    'mailGet' => action_mail_get($in),
    'mailReply' => action_mail_reply($agent, $in),
    'mailMarkRead' => action_mail_mark_read($in),
    'listAgents' => action_list_agents(require_admin()),
    'saveAgent' => action_save_agent(require_admin(), $in),
    default => fail('Okänd action: ' . $action, 404),
});
