<?php
// Minimal IMAP client + MIME reader for the cPanel mailbox (Dovecot), used by Utskick → Inkorg.
// Pure PHP over a TLS socket, so it works even where the php-imap extension is missing.

declare(strict_types=1);

final class Imap
{
    /** @var resource */
    private $sock;
    private int $tag = 0;

    public function __construct(array $cfg)
    {
        $host = $cfg['host'];
        $port = (int) ($cfg['port'] ?? 993);
        $ctx = stream_context_create(['ssl' => ['peer_name' => $host, 'SNI_enabled' => true]]);
        // Plaintext (port 143) is only acceptable when the mail server is this same machine.
        $plain = $port === 143 && in_array($host, ['localhost', '127.0.0.1'], true);
        $sock = @stream_socket_client(($plain ? 'tcp' : 'ssl') . "://$host:$port", $errno, $errstr, 20, STREAM_CLIENT_CONNECT, $ctx);
        if (!$sock) {
            throw new RuntimeException("Kan inte ansluta till inkorgen $host:$port ($errstr)");
        }
        $this->sock = $sock;
        stream_set_timeout($this->sock, 30);
        $this->readLine(); // greeting
        try {
            $this->command('LOGIN ' . self::quote($cfg['user']) . ' ' . self::quote($cfg['pass']));
        } catch (RuntimeException) {
            throw new RuntimeException('Fel användarnamn eller lösenord för e-postkontot (IMAP)');
        }
    }

    public function __destruct()
    {
        if (is_resource($this->sock)) {
            @fwrite($this->sock, 'Z LOGOUT' . "\r\n");
            @fclose($this->sock);
        }
    }

    public static function quote(string $s): string
    {
        return '"' . addcslashes($s, '"\\') . '"';
    }

    /** Name of the Sent folder (special-use \Sent, else the usual cPanel/Dovecot names). */
    public function sentFolder(): string
    {
        $names = [];
        foreach ($this->command('LIST "" "*"') as $line) {
            if (!preg_match('/^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (.+)$/i', $line['text'], $m)) {
                continue;
            }
            $name = trim($m[2]);
            if ($name !== '' && $name[0] === '"') {
                $name = stripcslashes(substr($name, 1, -1));
            }
            if (stripos($m[1], '\\Sent') !== false) {
                return $name;
            }
            $names[strtolower($name)] = $name;
        }
        foreach (['inbox.sent', 'sent', 'inbox.sent items', 'sent items', 'inbox.skickat', 'skickat'] as $guess) {
            if (isset($names[$guess])) {
                return $names[$guess];
            }
        }
        return 'INBOX.Sent';
    }

    public function select(string $folder): void
    {
        $this->command('SELECT ' . self::quote($folder));
    }

    /** @return int[] UIDs, oldest first */
    public function search(?string $text): array
    {
        $criteria = $text ? 'CHARSET UTF-8 TEXT ' . self::quote($text) : 'ALL';
        foreach ($this->command("UID SEARCH $criteria") as $line) {
            if (str_starts_with($line['text'], '* SEARCH')) {
                return array_map('intval', preg_split('/\s+/', trim(substr($line['text'], 8)), -1, PREG_SPLIT_NO_EMPTY));
            }
        }
        return [];
    }

    /**
     * Fetches UIDs with the given items. Returns [uid => ['FLAGS' => …, 'BODY[…]' => string, …]].
     * @param int[] $uids
     */
    public function fetch(array $uids, string $items): array
    {
        if (!$uids) {
            return [];
        }
        $out = [];
        foreach ($this->command('UID FETCH ' . implode(',', $uids) . " ($items)") as $line) {
            if (!preg_match('/^\* \d+ FETCH /', $line['text'])) {
                continue;
            }
            $tokens = self::tokenize($line['text'], $line['literals']);
            $list = self::parseList($tokens, 3); // skip "*", "n", "FETCH"
            $map = [];
            for ($i = 0; $i + 1 < count($list); $i += 2) {
                $map[strtoupper((string) $list[$i])] = $list[$i + 1];
            }
            if (isset($map['UID'])) {
                $out[(int) $map['UID']] = $map;
            }
        }
        return $out;
    }

    public function addFlag(int $uid, string $flag): void
    {
        $this->command("UID STORE $uid +FLAGS ($flag)");
    }

    /** Saves a copy of a sent message (so it shows in webmail's Sent folder). */
    public function append(string $folder, string $raw, string $flags = '\\Seen'): void
    {
        $tag = 'A' . (++$this->tag);
        $this->write("$tag APPEND " . self::quote($folder) . " ($flags) {" . strlen($raw) . '}');
        $cont = $this->readLine();
        if (!str_starts_with($cont, '+')) {
            throw new RuntimeException('Kunde inte spara i Skickat: ' . trim($cont));
        }
        $this->write($raw);
        $this->collect($tag);
    }

    // -- protocol plumbing -------------------------------------------------

    /** @return array<int, array{text: string, literals: string[]}> untagged response lines */
    private function command(string $cmd): array
    {
        $tag = 'A' . (++$this->tag);
        $this->write("$tag $cmd");
        return $this->collect($tag);
    }

    private function collect(string $tag): array
    {
        $lines = [];
        while (true) {
            $line = $this->readLine();
            $literals = [];
            // A line ending in {n} is followed by n raw bytes, then the rest of the line.
            while (preg_match('/\{(\d+)\}\r\n$/', $line, $m)) {
                $literals[] = $this->readBytes((int) $m[1]);
                $line = substr($line, 0, -strlen($m[0])) . '{L' . (count($literals) - 1) . '}' . $this->readLine();
            }
            $line = rtrim($line, "\r\n");
            if (str_starts_with($line, "$tag ")) {
                if (!preg_match("/^$tag OK/i", $line)) {
                    throw new RuntimeException('IMAP: ' . substr($line, strlen($tag) + 1));
                }
                return $lines;
            }
            $lines[] = ['text' => $line, 'literals' => $literals];
        }
    }

    private function write(string $s): void
    {
        if (fwrite($this->sock, $s . "\r\n") === false) {
            throw new RuntimeException('Anslutningen till inkorgen bröts');
        }
    }

    private function readLine(): string
    {
        $line = fgets($this->sock);
        if ($line === false) {
            throw new RuntimeException('Inkorgen svarade inte (timeout)');
        }
        return $line;
    }

    private function readBytes(int $n): string
    {
        $buf = '';
        while (strlen($buf) < $n) {
            $chunk = fread($this->sock, min(8192, $n - strlen($buf)));
            if ($chunk === false || $chunk === '') {
                throw new RuntimeException('Inkorgen svarade inte (timeout)');
            }
            $buf .= $chunk;
        }
        return $buf;
    }

    /** Splits an IMAP response line into tokens: '(' ')' atoms, strings, literals. */
    private static function tokenize(string $s, array $literals): array
    {
        $tokens = [];
        $n = strlen($s);
        for ($i = 0; $i < $n;) {
            $c = $s[$i];
            if ($c === ' ') {
                $i++;
            } elseif ($c === '(' || $c === ')') {
                $tokens[] = $c;
                $i++;
            } elseif ($c === '"') {
                $j = $i + 1;
                $str = '';
                while ($j < $n && $s[$j] !== '"') {
                    if ($s[$j] === '\\' && $j + 1 < $n) {
                        $j++;
                    }
                    $str .= $s[$j++];
                }
                $tokens[] = ['s' => $str];
                $i = $j + 1;
            } elseif ($c === '{' && preg_match('/\G\{L(\d+)\}/', $s, $m, 0, $i)) {
                $tokens[] = ['s' => $literals[(int) $m[1]]];
                $i += strlen($m[0]);
            } else {
                // Atom; BODY[HEADER.FIELDS (A B)]<0> keeps its brackets together.
                $j = $i;
                $depth = 0;
                while ($j < $n) {
                    $ch = $s[$j];
                    if ($ch === '[') {
                        $depth++;
                    } elseif ($ch === ']') {
                        $depth--;
                    } elseif ($depth === 0 && ($ch === ' ' || $ch === '(' || $ch === ')')) {
                        break;
                    }
                    $j++;
                }
                $atom = substr($s, $i, $j - $i);
                $tokens[] = strtoupper($atom) === 'NIL' ? null : $atom;
                $i = $j;
            }
        }
        return $tokens;
    }

    /** Parses tokens from $pos (expects '(') into nested arrays; strings come back as PHP strings. */
    private static function parseList(array $tokens, int $pos): array
    {
        $stack = [[]];
        for ($i = $pos; $i < count($tokens); $i++) {
            $t = $tokens[$i];
            if ($t === '(') {
                $stack[] = [];
            } elseif ($t === ')') {
                $done = array_pop($stack);
                if (count($stack) === 1) {
                    return $done;
                }
                $stack[count($stack) - 1][] = $done;
            } else {
                $stack[count($stack) - 1][] = is_array($t) ? $t['s'] : $t;
            }
        }
        return $stack[count($stack) - 1];
    }
}

// ---------------------------------------------------------------------------
// MIME reading (enough for replies to outreach mail: text, html, multipart)
// ---------------------------------------------------------------------------

function mime_decode_header(string $value): string
{
    $value = preg_replace('/\r?\n[ \t]+/', ' ', $value);
    $decoded = @iconv_mime_decode($value, ICONV_MIME_DECODE_CONTINUE_ON_ERROR, 'UTF-8');
    return $decoded !== false ? $decoded : $value;
}

/** @return array<string, string> lower-case header name → decoded value (first occurrence) */
function mime_parse_headers(string $head): array
{
    $out = [];
    foreach (preg_split('/\r?\n(?![ \t])/', trim($head)) as $line) {
        $p = strpos($line, ':');
        if ($p === false) {
            continue;
        }
        $name = strtolower(trim(substr($line, 0, $p)));
        $out[$name] ??= mime_decode_header(trim(substr($line, $p + 1)));
    }
    return $out;
}

/** "Anna Lindqvist <anna@x.se>" → ['name' => 'Anna Lindqvist', 'address' => 'anna@x.se'] */
function mime_parse_address(string $value): ?array
{
    $value = trim($value);
    if ($value === '') {
        return null;
    }
    if (preg_match('/^(.*?)<([^>]+)>/', $value, $m)) {
        $name = trim(trim($m[1]), '"\' ');
        return ['address' => trim($m[2]), 'name' => $name !== '' ? $name : null];
    }
    return ['address' => trim(explode(',', $value)[0]), 'name' => null];
}

function mime_header_param(string $header, string $param): ?string
{
    if (preg_match('/' . $param . '\s*=\s*"?([^";]+)"?/i', $header, $m)) {
        return trim($m[1]);
    }
    return null;
}

/** Best readable text of a raw RFC 822 message: text/plain preferred, else de-tagged HTML. */
function mime_body_text(string $raw): string
{
    [$plain, $html] = mime_walk($raw, 0);
    if ($plain !== null && trim($plain) !== '') {
        return trim($plain);
    }
    if ($html !== null) {
        return trim(html_to_text($html));
    }
    return '';
}

/** @return array{0: ?string, 1: ?string} [text/plain, text/html] found in this entity */
function mime_walk(string $entity, int $depth): array
{
    $parts = preg_split('/\r?\n\r?\n/', $entity, 2);
    $headers = mime_parse_headers($parts[0]);
    $body = $parts[1] ?? '';
    $type = strtolower($headers['content-type'] ?? 'text/plain');

    if ($depth < 6 && str_starts_with($type, 'multipart/')) {
        $boundary = mime_header_param($headers['content-type'], 'boundary');
        if (!$boundary) {
            return [null, null];
        }
        $plain = $html = null;
        $chunks = explode('--' . $boundary, $body);
        array_shift($chunks); // preamble
        foreach ($chunks as $chunk) {
            if (str_starts_with($chunk, '--')) {
                break; // closing boundary
            }
            [$p, $h] = mime_walk(ltrim($chunk, "\r\n"), $depth + 1);
            $plain ??= $p;
            $html ??= $h;
        }
        return [$plain, $html];
    }
    if (str_contains(strtolower($headers['content-disposition'] ?? ''), 'attachment')) {
        return [null, null];
    }
    if (!str_starts_with($type, 'text/plain') && !str_starts_with($type, 'text/html')) {
        return [null, null];
    }

    $enc = strtolower(trim($headers['content-transfer-encoding'] ?? ''));
    if ($enc === 'base64') {
        $body = base64_decode(preg_replace('/\s+/', '', $body)) ?: '';
    } elseif ($enc === 'quoted-printable') {
        $body = quoted_printable_decode($body);
    }
    $charset = strtoupper(mime_header_param($headers['content-type'] ?? '', 'charset') ?? 'UTF-8');
    // Mail labelled Latin-1 is in practice Windows-1252 (Outlook's – and ” live there), as browsers assume too.
    if (in_array($charset, ['ISO-8859-1', 'LATIN1', 'US-ASCII'], true)) {
        $charset = 'WINDOWS-1252';
    }
    if ($charset !== 'UTF-8') {
        $converted = @iconv($charset, 'UTF-8//IGNORE', $body);
        $body = $converted !== false ? $converted : $body;
    }
    $body = str_replace("\r\n", "\n", $body);
    return str_starts_with($type, 'text/html') ? [null, $body] : [$body, null];
}

function html_to_text(string $html): string
{
    $html = preg_replace('#<(script|style|head)\b.*?</\1>#is', '', $html);
    $html = preg_replace('#<br\s*/?>|</p>|</div>|</tr>|</h\d>#i', "\n", $html);
    $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace("/[ \t]+/", ' ', $text);
    return preg_replace("/\n\s*\n\s*\n+/", "\n\n", $text);
}
