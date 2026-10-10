<?php
// Outreach sending (SMTP) and the Utskick → Inkorg mailbox (IMAP), both through the cPanel mailbox.

declare(strict_types=1);

require_once __DIR__ . '/smtp.php';
require_once __DIR__ . '/imap.php';
require_once __DIR__ . '/template.php';

const CC_MAX_BATCH = 10;

function mail_cfg(): array
{
    $m = cc_config()['mail'] ?? null;
    if (!$m || empty($m['from_email'])) {
        fail('E-postkontot är inte inställt (kör api/install.php)', 500);
    }
    return $m;
}

/** Saves a sent message in the mailbox's Sent folder. Never fails the send itself. */
function save_to_sent(?Imap $imap, string $raw): ?string
{
    try {
        $imap ??= new Imap(mail_cfg()['imap']);
        $imap->append($imap->sentFolder(), $raw);
        return null;
    } catch (Throwable $e) {
        return $e->getMessage();
    }
}

function sent_last_24h(): int
{
    return (int) q("SELECT COUNT(*) FROM cc_email_log WHERE status = 'sent' AND created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY")->fetchColumn();
}

/**
 * One lead (Utskick → Skicka) or a batch of up to CC_MAX_BATCH (Massutskick — the app calls repeatedly).
 * Each email is rendered with the lead's columns, gets an opt-out footer, is logged and counted on the lead.
 */
function action_send(array $agent, array $in): array
{
    @set_time_limit(180);
    $m = mail_cfg();
    $ids = array_slice(array_map('intval', $in['lead_ids'] ?? []), 0, CC_MAX_BATCH);
    $templateId = (string) ($in['template_id'] ?? 'auto');
    $skipAlreadyEmailed = (bool) ($in['skip_already_emailed'] ?? false);
    $skipSoleTraders = (bool) ($in['skip_sole_traders'] ?? count($ids) > 1);
    if (!$ids) {
        fail('Inga leads valda');
    }

    // Daily safety cap — protects the reklamx.se domain's sending reputation.
    $remaining = (int) ($m['daily_limit'] ?? 150) - sent_last_24h();

    $templates = $templateId === 'auto'
        ? q('SELECT * FROM cc_email_templates')->fetchAll()
        : q('SELECT * FROM cc_email_templates WHERE id = ?', [(int) $templateId])->fetchAll();
    if (!$templates) {
        fail('Mallen saknas', 404);
    }
    $templates = array_map('template_out', $templates);

    $marks = implode(',', array_fill(0, count($ids), '?'));
    $leads = q("SELECT * FROM cc_leads WHERE id IN ($marks)", $ids)->fetchAll();

    $sent = 0;
    $skipped = [];
    $failed = [];
    $stopped = null;
    $smtp = new Smtp($m['smtp']);
    $imap = null;
    $from = ['email' => $m['from_email'], 'name' => $m['from_name'] ?? 'Reklamx'];
    $pauseUs = (int) ($m['pause_ms'] ?? 2000) * 1000;

    foreach ($leads as $lead) {
        $id = (string) $lead['id'];
        $to = trim((string) $lead['email']);
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) { $skipped[] = ['id' => $id, 'reason' => 'Saknar giltig e-post']; continue; }
        if ($lead['email_opt_out']) { $skipped[] = ['id' => $id, 'reason' => 'Avregistrerad']; continue; }
        if ($lead['status'] === 'not_interested') { $skipped[] = ['id' => $id, 'reason' => 'Ej intresserad']; continue; }
        if ($skipAlreadyEmailed && $lead['emails_sent'] > 0) { $skipped[] = ['id' => $id, 'reason' => 'Redan mejlad']; continue; }
        if ($skipSoleTraders && str_contains(mb_strtolower((string) $lead['bolagstyp']), 'enskild')) {
            $skipped[] = ['id' => $id, 'reason' => 'Enskild firma (kräver samtycke)'];
            continue;
        }
        if ($remaining <= 0) { $stopped = 'daily_limit'; break; }

        $tpl = $templateId === 'auto' ? pick_template($templates, $lead['niche']) : $templates[0];
        $vars = lead_vars($lead, $agent['display_name']);
        $subject = trim(render_template($tpl['subject'], $vars));
        $text = render_template($tpl['body'], $vars) . CC_OPT_OUT_FOOTER;

        if ($sent + count($failed) > 0) {
            usleep($pauseUs);
        }
        [$raw, $messageId] = build_message($from, $to, $subject, $text, $m['reply_to'] ?? null, [
            'List-Unsubscribe' => "<mailto:{$m['from_email']}?subject=avregistrera>",
        ]);
        $error = null;
        try {
            $smtp->send($m['from_email'], $to, $raw);
        } catch (Throwable $e) {
            $error = $e->getMessage();
            $smtp->reset();
        }

        q('INSERT INTO cc_email_log (lead_id, template_id, agent_id, sender, to_email, subject, body, status, message_id, error)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            $lead['id'], $tpl['id'], $agent['id'], $m['from_email'], $to, $subject, $text,
            $error ? 'failed' : 'sent', $messageId, $error,
        ]);
        if ($error) {
            $failed[] = ['id' => $id, 'reason' => $error];
            continue;
        }
        q('UPDATE cc_leads SET emails_sent = emails_sent + 1, last_emailed_at = UTC_TIMESTAMP() WHERE id = ?', [$lead['id']]);
        $sent++;
        $remaining--;
        try {
            $imap ??= new Imap($m['imap']);
            save_to_sent($imap, $raw);
        } catch (Throwable) {
            $imap = null; // copy to Sent is best-effort; the email itself went out
        }
    }
    $smtp->close();

    if (count($ids) === 1 && $failed) {
        fail($failed[0]['reason'], 502);
    }
    return ['sent' => $sent, 'skipped' => $skipped, 'failed' => $failed, 'stopped' => $stopped, 'daily_remaining' => max($remaining, 0)];
}

// ---------------------------------------------------------------------------
// Mailbox (Inkorg / Skickat)
// ---------------------------------------------------------------------------

/** Message ids sent to the browser are "<folder>:<uid>" so they survive across requests. */
function mailbox_open(string $folder): array
{
    $imap = new Imap(mail_cfg()['imap']);
    $name = $folder === 'sentitems' ? $imap->sentFolder() : 'INBOX';
    $imap->select($name);
    return [$imap, $name];
}

function split_mail_id(string $id): array
{
    if (!preg_match('/^(inbox|sentitems):(\d+)$/', $id, $m)) {
        fail('Ogiltigt mejl-id');
    }
    return [$m[1], (int) $m[2]];
}

function find_item(array $map, string $prefix)
{
    foreach ($map as $k => $v) {
        if (str_starts_with($k, $prefix)) {
            return $v;
        }
    }
    return null;
}

/** Converts fetched header text into the MailMessage shape the app uses (Graph-like). */
function message_out(string $folder, int $uid, array $item, string $preview = ''): array
{
    $h = mime_parse_headers((string) find_item($item, 'BODY[HEADER'));
    $flags = is_array($item['FLAGS'] ?? null) ? $item['FLAGS'] : [];
    $date = null;
    if (!empty($h['date']) && ($ts = strtotime($h['date'])) !== false) {
        $date = gmdate('Y-m-d\TH:i:s\Z', $ts);
    } elseif (!empty($item['INTERNALDATE']) && ($ts = strtotime((string) $item['INTERNALDATE'])) !== false) {
        $date = gmdate('Y-m-d\TH:i:s\Z', $ts);
    }
    $wrap = fn (?array $a) => $a ? ['emailAddress' => $a] : null;
    $to = array_values(array_filter(array_map(
        fn ($part) => $wrap(mime_parse_address($part)),
        preg_split('/,(?=(?:[^"]*"[^"]*")*[^"]*$)/', $h['to'] ?? ''),
    )));
    return [
        'id' => "$folder:$uid",
        'subject' => $h['subject'] ?? '',
        'from' => $wrap(mime_parse_address($h['from'] ?? '')),
        'toRecipients' => $to,
        'receivedDateTime' => $folder === 'inbox' ? $date : null,
        'sentDateTime' => $folder === 'sentitems' ? $date : null,
        'bodyPreview' => mb_substr(preg_replace('/\s+/u', ' ', $preview), 0, 200),
        'isRead' => in_array('\\Seen', $flags, true),
        'messageId' => $h['message-id'] ?? null,
    ];
}

const CC_HEADER_ITEMS = 'UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)]';

function action_mail_list(array $in): array
{
    $folder = ($in['folder'] ?? 'inbox') === 'sentitems' ? 'sentitems' : 'inbox';
    $search = trim((string) ($in['search'] ?? ''));
    [$imap] = mailbox_open($folder);
    $uids = array_slice($imap->search($search !== '' ? $search : null), -50);
    // The first 8 KB of each message is enough for a preview without downloading attachments.
    $items = $imap->fetch($uids, CC_HEADER_ITEMS . ' BODY.PEEK[]<0.8192>');
    $messages = [];
    foreach (array_reverse($uids) as $uid) {
        if (!isset($items[$uid])) {
            continue;
        }
        $partial = (string) find_item($items[$uid], 'BODY[]');
        $messages[] = message_out($folder, $uid, $items[$uid], mime_body_text($partial));
    }
    return ['mailbox' => mail_cfg()['from_email'], 'messages' => $messages];
}

function action_mail_get(array $in): array
{
    [$folder, $uid] = split_mail_id((string) ($in['id'] ?? ''));
    [$imap] = mailbox_open($folder);
    $items = $imap->fetch([$uid], CC_HEADER_ITEMS . ' BODY.PEEK[]<0.2000000>');
    if (!isset($items[$uid])) {
        fail('Mejlet finns inte längre', 404);
    }
    $text = mime_body_text((string) find_item($items[$uid], 'BODY[]'));
    $msg = message_out($folder, $uid, $items[$uid], $text);
    $msg['body'] = ['contentType' => 'text', 'content' => $text];
    return $msg;
}

function action_mail_mark_read(array $in): array
{
    [$folder, $uid] = split_mail_id((string) ($in['id'] ?? ''));
    [$imap] = mailbox_open($folder);
    $imap->addFlag($uid, '\\Seen');
    return ['ok' => true];
}

/** Replies to an inbox message from the outreach mailbox, quoting the original, and saves it in Skickat. */
function action_mail_reply(array $agent, array $in): array
{
    $text = trim((string) ($in['text'] ?? ''));
    if ($text === '') {
        fail('Tomt svar');
    }
    $orig = action_mail_get($in);
    $to = $orig['from']['emailAddress']['address'] ?? '';
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        fail('Avsändaren saknar giltig adress');
    }
    $m = mail_cfg();
    $subject = preg_match('/^(sv|re|svar):/i', $orig['subject']) ? $orig['subject'] : 'Sv: ' . $orig['subject'];
    $quoted = implode("\n", array_map(fn ($l) => '> ' . $l, explode("\n", $orig['body']['content'])));
    $when = $orig['receivedDateTime'] ? (new DateTimeImmutable($orig['receivedDateTime']))->setTimezone(new DateTimeZone('Europe/Stockholm'))->format('Y-m-d H:i') : '';
    $body = "$text\n\n{$agent['display_name']}\nReklamx\n\nDen $when skrev $to:\n$quoted";
    $extra = [];
    if (!empty($orig['messageId'])) {
        $extra = ['In-Reply-To' => $orig['messageId'], 'References' => $orig['messageId']];
    }
    [$raw] = build_message(['email' => $m['from_email'], 'name' => $m['from_name'] ?? 'Reklamx'], $to, $subject, $body, $m['reply_to'] ?? null, $extra);
    $smtp = new Smtp($m['smtp']);
    $smtp->send($m['from_email'], $to, $raw);
    $smtp->close();
    save_to_sent(null, $raw);
    return ['ok' => true];
}
