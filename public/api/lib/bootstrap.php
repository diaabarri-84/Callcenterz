<?php
// Shared setup for every API request: config, database, JSON helpers, session and auth.

declare(strict_types=1);

const CC_VERSION = 1;

/**
 * The config file holds database and mailbox passwords, so it lives one level ABOVE the
 * web root (e.g. /home/<user>/outreach-config.php) where no URL can reach it.
 * install.php writes it.
 */
function cc_config_path(): string
{
    $docRoot = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
    $base = $docRoot !== '' ? dirname($docRoot) : dirname(__DIR__, 3);
    return $base . '/outreach-config.php';
}

function cc_config(): array
{
    static $config = null;
    if ($config === null) {
        $path = cc_config_path();
        if (!is_file($path)) {
            json_out(['error' => 'Systemet är inte installerat än. Öppna api/install.php.', 'install' => true], 503);
        }
        $config = require $path;
    }
    return $config;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = cc_config()['db'];
        $pdo = db_connect($c);
    }
    return $pdo;
}

function db_connect(array $c): PDO
{
    $pdo = new PDO(
        "mysql:host={$c['host']};dbname={$c['name']};charset=utf8mb4",
        $c['user'],
        $c['pass'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ],
    );
    // All timestamps are stored in UTC; the browser converts to Swedish time.
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function json_out($data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function fail(string $message, int $status = 400): never
{
    json_out(['error' => $message], $status);
}

/** ISO-8601 from the browser (toISOString) → 'Y-m-d H:i:s' UTC for MySQL. null stays null. */
function to_db_time(?string $iso): ?string
{
    if ($iso === null || $iso === '') {
        return null;
    }
    try {
        return (new DateTimeImmutable($iso))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    } catch (Exception) {
        fail('Ogiltigt datum: ' . $iso);
    }
}

/** MySQL UTC datetime → ISO-8601 for the browser. */
function to_iso(?string $dbTime): ?string
{
    return $dbTime === null ? null : str_replace(' ', 'T', $dbTime) . 'Z';
}

// ---------------------------------------------------------------------------
// Session + auth
// ---------------------------------------------------------------------------

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('cc_session');
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 14,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    ini_set('session.gc_maxlifetime', (string) (60 * 60 * 24 * 14));
    session_start();
}

/** The logged-in agent, or null. Re-read from the database so deactivation takes effect at once. */
function current_agent(): ?array
{
    start_session();
    $id = $_SESSION['agent_id'] ?? null;
    if (!$id) {
        return null;
    }
    $agent = q('SELECT id, email, display_name, role FROM cc_agents WHERE id = ? AND active = 1', [$id])->fetch();
    if (!$agent) {
        unset($_SESSION['agent_id']);
        return null;
    }
    $agent['id'] = (string) $agent['id'];
    return $agent;
}

function require_agent(): array
{
    return current_agent() ?? fail('Inte inloggad', 401);
}

function require_admin(): array
{
    $agent = require_agent();
    if ($agent['role'] !== 'admin') {
        fail('Bara admin kan göra det här', 403);
    }
    return $agent;
}

function client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}
