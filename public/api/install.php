<?php
// One-time setup: open https://outreach.reklamx.se/api/install.php in a browser.
// Tests the database and the cPanel mailbox, creates the tables, your admin login,
// and writes the config file one level above the web root.

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/schema.php';
require_once __DIR__ . '/lib/smtp.php';
require_once __DIR__ . '/lib/imap.php';

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');

$configPath = cc_config_path();
$installed = is_file($configPath);
$errors = [];
$done = false;
$manualConfig = null;
$migrated = false;

$v = fn (string $k, string $default = '') => htmlspecialchars((string) ($_POST[$k] ?? $default), ENT_QUOTES);
$host = preg_replace('/^(www|outreach)\./', '', strtolower((string) ($_SERVER['HTTP_HOST'] ?? 'reklamx.se')));

if ($installed) {
    // Already installed: an admin can re-run the (idempotent) schema after an update.
    if (isset($_GET['migrate'])) {
        $agent = current_agent();
        if ($agent && $agent['role'] === 'admin') {
            cc_migrate(db());
            $migrated = true;
        } else {
            $errors[] = 'Logga in i appen som admin först, och ladda sedan om den här sidan.';
        }
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $in = fn (string $k) => trim((string) ($_POST[$k] ?? ''));
    $dbCfg = ['host' => 'localhost', 'name' => $in('db_name'), 'user' => $in('db_user'), 'pass' => (string) ($_POST['db_pass'] ?? '')];
    $mailbox = strtolower($in('mail_email'));
    $mailPass = (string) ($_POST['mail_pass'] ?? '');
    $mailHost = $in('mail_host') ?: 'mail.' . substr(strrchr($mailbox, '@') ?: '@' . $host, 1);
    $smtpPort = (int) ($in('smtp_port') ?: 465);
    $imapPort = (int) ($in('imap_port') ?: 993);
    $admin = ['name' => $in('admin_name'), 'email' => strtolower($in('admin_email')), 'pass' => (string) ($_POST['admin_pass'] ?? '')];

    if (!filter_var($mailbox, FILTER_VALIDATE_EMAIL)) $errors[] = 'Ange e-postkontot som ska skicka (t.ex. partner@reklamx.se).';
    if ($admin['name'] === '' || !filter_var($admin['email'], FILTER_VALIDATE_EMAIL)) $errors[] = 'Ange ditt namn och din e-post för admin-inloggningen.';
    if (strlen($admin['pass']) < 10) $errors[] = 'Admin-lösenordet måste vara minst 10 tecken.';

    $pdo = null;
    if (!$errors) {
        try {
            $pdo = db_connect($dbCfg);
        } catch (Throwable $e) {
            $errors[] = 'Databasen: kunde inte ansluta – kontrollera namn, användare och lösenord (cPanel lägger till ett prefix, t.ex. "anvandare_outreach"). ' . htmlspecialchars($e->getMessage());
        }
    }
    $mailCfg = [
        'from_email' => $mailbox,
        'from_name' => $in('from_name') ?: 'Reklamx',
        'reply_to' => strtolower($in('reply_to')) ?: null,
        'daily_limit' => max(1, (int) ($in('daily_limit') ?: 150)),
        'pause_ms' => 2000,
        'smtp' => ['host' => $mailHost, 'port' => $smtpPort, 'user' => $mailbox, 'pass' => $mailPass],
        'imap' => ['host' => $mailHost, 'port' => $imapPort, 'user' => $mailbox, 'pass' => $mailPass],
    ];
    if (!$errors) {
        try {
            $smtp = new Smtp($mailCfg['smtp']);
            $smtp->connect();
            $smtp->close();
        } catch (Throwable $e) {
            $errors[] = 'Utgående e-post (SMTP ' . htmlspecialchars("$mailHost:$smtpPort") . '): ' . htmlspecialchars($e->getMessage());
        }
        try {
            (new Imap($mailCfg['imap']))->sentFolder();
        } catch (Throwable $e) {
            $errors[] = 'Inkorgen (IMAP ' . htmlspecialchars("$mailHost:$imapPort") . '): ' . htmlspecialchars($e->getMessage());
        }
    }

    if (!$errors && $pdo) {
        cc_migrate($pdo);
        $pdo->prepare('INSERT INTO cc_agents (email, display_name, role, password_hash) VALUES (?, ?, ?, ?)
                       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), role = \'admin\', active = 1, password_hash = VALUES(password_hash)')
            ->execute([$admin['email'], $admin['name'], 'admin', password_hash($admin['pass'], PASSWORD_DEFAULT)]);

        $config = ['version' => CC_VERSION, 'db' => $dbCfg, 'mail' => $mailCfg];
        $php = "<?php\n// ReklamX Callcenter config — written by install.php " . date('Y-m-d H:i') . ".\n"
            . "// Contains passwords: keep this file OUTSIDE the web root.\nreturn " . var_export($config, true) . ";\n";
        if (@file_put_contents($configPath, $php, LOCK_EX) !== false) {
            @chmod($configPath, 0600);
            $done = true;
        } else {
            $manualConfig = $php;
        }
    }
}
?><!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Installera Callcenter</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f5f2; --card:#fff; --fg:#1c1b19; --muted:#6b6862; --line:#e4e1da; --accent:#e4572e; --bad:#c0392b; --ok:#2e7d32; }
  @media (prefers-color-scheme: dark) { :root { --bg:#141412; --card:#1d1c1a; --fg:#eeece8; --muted:#a29f98; --line:#33312d; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui, sans-serif; padding:24px 16px; }
  main { max-width:620px; margin:0 auto; }
  h1 { font-size:24px; margin:0 0 4px; } h2 { font-size:16px; margin:28px 0 8px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px; }
  label { display:block; margin:10px 0 0; font-size:13px; color:var(--muted); }
  input { width:100%; padding:10px 12px; margin-top:4px; border:1px solid var(--line); border-radius:10px; background:var(--bg); color:var(--fg); font:inherit; }
  .row { display:grid; grid-template-columns:1fr 1fr; gap:12px; } @media (max-width:520px) { .row { grid-template-columns:1fr; } }
  button { margin-top:24px; width:100%; padding:12px; border:0; border-radius:12px; background:var(--accent); color:#fff; font:600 15px system-ui; cursor:pointer; }
  .err { border:1px solid var(--bad); color:var(--bad); border-radius:12px; padding:12px 14px; margin:16px 0; }
  .ok { border:1px solid var(--ok); border-radius:12px; padding:14px; margin:16px 0; }
  .hint { color:var(--muted); font-size:13px; margin:4px 0 0; }
  pre { white-space:pre-wrap; word-break:break-all; background:var(--bg); padding:12px; border-radius:10px; font-size:12px; }
  a { color:var(--accent); }
</style>
</head>
<body><main>
<h1>Callcenter – installation</h1>
<p class="hint">outreach.reklamx.se · körs en gång</p>

<?php foreach ($errors as $e): ?><div class="err"><?= $e ?></div><?php endforeach; ?>

<?php if ($installed): ?>
  <div class="card">
    <?php if ($migrated): ?><p class="ok">Databasen är uppdaterad.</p><?php endif; ?>
    <p><b>Systemet är redan installerat.</b> Inställningarna finns i <code><?= htmlspecialchars($configPath) ?></code>.</p>
    <p class="hint">Vill du ändra e-postkonto eller lösenord: redigera den filen i File Manager. Efter en uppdatering av appen kan en admin köra <a href="?migrate=1">databasuppdateringen</a>.</p>
    <p><a href="../">Öppna Callcenter →</a></p>
  </div>
<?php elseif ($done): ?>
  <div class="ok">
    <p><b>Klart!</b> Tabellerna är skapade, e-postkontot fungerar och ditt admin-konto finns.</p>
    <p class="hint">Inställningarna sparades i <code><?= htmlspecialchars($configPath) ?></code> (utanför webbroten).</p>
    <p><a href="../">Logga in i Callcenter →</a></p>
  </div>
<?php elseif ($manualConfig !== null): ?>
  <div class="err">
    <p>Allt fungerar, men servern fick inte skriva inställningsfilen. Skapa den själv i File Manager:</p>
    <p>Fil: <code><?= htmlspecialchars($configPath) ?></code> med exakt detta innehåll, och ladda sedan om sidan.</p>
  </div>
  <pre><?= htmlspecialchars($manualConfig) ?></pre>
<?php else: ?>
  <form method="post" class="card" autocomplete="off">
    <h2 style="margin-top:0">1. Databas</h2>
    <p class="hint">Skapa den först i cPanel → <i>Database Wizard</i> (ge användaren ALL PRIVILEGES). Skriv de fullständiga namnen med prefix.</p>
    <div class="row">
      <label>Databasnamn <input name="db_name" required value="<?= $v('db_name') ?>" placeholder="anvandare_outreach"></label>
      <label>Databasanvändare <input name="db_user" required value="<?= $v('db_user') ?>" placeholder="anvandare_outreach"></label>
    </div>
    <label>Databaslösenord <input name="db_pass" type="password" required></label>

    <h2>2. E-postkonto för utskick</h2>
    <p class="hint">Ett konto du skapat i cPanel → <i>Email Accounts</i>. Utskicken skickas härifrån, svaren hamnar i dess inkorg (syns även i webbmailen).</p>
    <div class="row">
      <label>E-postadress <input name="mail_email" type="email" required value="<?= $v('mail_email', "partner@$host") ?>"></label>
      <label>Lösenord <input name="mail_pass" type="password" required></label>
    </div>
    <div class="row">
      <label>Avsändarnamn <input name="from_name" value="<?= $v('from_name', 'Reklamx') ?>"></label>
      <label>Svar till (valfritt) <input name="reply_to" type="email" value="<?= $v('reply_to') ?>" placeholder="lämna tomt = samma adress"></label>
    </div>
    <div class="row">
      <label>E-postserver <input name="mail_host" value="<?= $v('mail_host', "mail.$host") ?>"></label>
      <label>SMTP-port <input name="smtp_port" inputmode="numeric" value="<?= $v('smtp_port', '465') ?>"></label>
    </div>
    <label>IMAP-port <input name="imap_port" inputmode="numeric" value="<?= $v('imap_port', '993') ?>"></label>
    <p class="hint">Standard i cPanel: SMTP 465 och IMAP 993 (krypterat). Ändra bara om webbhotellet säger annat.</p>
    <label>Max mejl per dygn <input name="daily_limit" inputmode="numeric" value="<?= $v('daily_limit', '150') ?>"></label>
    <p class="hint">Börja lågt. Många cPanel-värdar spärrar konton som skickar för mycket på kort tid.</p>

    <h2>3. Ditt admin-konto</h2>
    <div class="row">
      <label>Ditt namn (används i mejl och manus) <input name="admin_name" required value="<?= $v('admin_name') ?>" placeholder="Diaa"></label>
      <label>Din e-post (inloggning) <input name="admin_email" type="email" required value="<?= $v('admin_email') ?>"></label>
    </div>
    <label>Lösenord (minst 10 tecken) <input name="admin_pass" type="password" required minlength="10"></label>

    <button>Testa och installera</button>
  </form>
<?php endif; ?>
</main></body>
</html>
