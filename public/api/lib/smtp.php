<?php
// Minimal SMTP client for the cPanel mailbox (no Composer/PHPMailer needed).
// Supports implicit TLS (port 465) and STARTTLS (port 587), AUTH LOGIN/PLAIN,
// and keeps one connection open for a whole batch.

declare(strict_types=1);

final class Smtp
{
    /** @var resource|null */
    private $sock = null;

    public function __construct(private array $cfg)
    {
    }

    public function connect(): void
    {
        $host = $this->cfg['host'];
        $port = (int) $this->cfg['port'];
        $implicitTls = $port === 465 || ($this->cfg['secure'] ?? '') === 'ssl';
        $ctx = stream_context_create(['ssl' => ['peer_name' => $host, 'SNI_enabled' => true]]);
        $this->sock = @stream_socket_client(
            ($implicitTls ? 'ssl://' : 'tcp://') . "$host:$port",
            $errno,
            $errstr,
            20,
            STREAM_CLIENT_CONNECT,
            $ctx,
        );
        if (!$this->sock) {
            throw new RuntimeException("Kan inte ansluta till e-postservern $host:$port ($errstr)");
        }
        stream_set_timeout($this->sock, 30);
        $this->expect(220);
        $ehloHost = gethostname() ?: 'localhost';
        $ext = $this->cmd("EHLO $ehloHost", 250);
        // Plaintext is only acceptable when the mail server is this same machine.
        $local = in_array($host, ['localhost', '127.0.0.1'], true);
        if (!$implicitTls && !($local && !str_contains($ext, 'STARTTLS'))) {
            if (!str_contains($ext, 'STARTTLS')) {
                throw new RuntimeException('E-postservern erbjuder inte kryptering (STARTTLS). Använd port 465.');
            }
            $this->cmd('STARTTLS', 220);
            if (!stream_socket_enable_crypto($this->sock, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
                throw new RuntimeException('TLS-handskakningen med e-postservern misslyckades');
            }
            $ext = $this->cmd("EHLO $ehloHost", 250);
        }
        if (preg_match('/AUTH[ =][^\r\n]*PLAIN/i', $ext)) {
            $this->cmd('AUTH PLAIN ' . base64_encode("\0{$this->cfg['user']}\0{$this->cfg['pass']}"), 235, true);
        } else {
            $this->cmd('AUTH LOGIN', 334);
            $this->cmd(base64_encode($this->cfg['user']), 334, true);
            $this->cmd(base64_encode($this->cfg['pass']), 235, true);
        }
    }

    /** Sends one already-built message (headers + body, CRLF line endings). */
    public function send(string $from, string $to, string $raw): void
    {
        if (!$this->sock) {
            $this->connect();
        }
        $this->cmd("MAIL FROM:<$from>", 250);
        $this->cmd("RCPT TO:<$to>", [250, 251]);
        $this->cmd('DATA', 354);
        // Dot-stuffing: a line starting with "." must be doubled.
        $data = preg_replace('/^\./m', '..', $raw);
        $this->write($data . "\r\n.");
        $this->expect(250);
    }

    /** Resets the envelope after a refused recipient so the connection can be reused. */
    public function reset(): void
    {
        if ($this->sock) {
            try {
                $this->cmd('RSET', 250);
            } catch (Throwable) {
                $this->close();
            }
        }
    }

    public function close(): void
    {
        if ($this->sock) {
            @fwrite($this->sock, "QUIT\r\n");
            @fclose($this->sock);
        }
        $this->sock = null;
    }

    public function __destruct()
    {
        $this->close();
    }

    private function cmd(string $line, int|array $ok, bool $secret = false): string
    {
        $this->write($line);
        return $this->expect($ok, $secret ? '(lösenord)' : $line);
    }

    private function write(string $line): void
    {
        if (fwrite($this->sock, $line . "\r\n") === false) {
            throw new RuntimeException('Anslutningen till e-postservern bröts');
        }
    }

    private function expect(int|array $ok, string $after = ''): string
    {
        $resp = '';
        while (($line = fgets($this->sock, 2048)) !== false) {
            $resp .= $line;
            if (strlen($line) < 4 || $line[3] !== '-') {
                break;
            }
        }
        $code = (int) substr($resp, 0, 3);
        if (!in_array($code, (array) $ok, true)) {
            $msg = trim($resp) ?: 'inget svar (timeout)';
            if ($code === 535) {
                $msg = 'Fel användarnamn eller lösenord för e-postkontot';
            }
            throw new RuntimeException("E-postservern svarade: $msg" . ($after && $code !== 535 ? " (efter $after)" : ''));
        }
        return $resp;
    }
}

/** RFC 2047 encoding for non-ASCII header text (subject, display names). */
function mime_header(string $text): string
{
    if (!preg_match('/[^\x20-\x7e]/', $text)) {
        return $text;
    }
    return mb_encode_mimeheader($text, 'UTF-8', 'B', "\r\n");
}

function mime_address(string $email, string $name = ''): string
{
    if ($name === '') {
        return "<$email>";
    }
    $n = preg_match('/[^\x20-\x7e]/', $name) ? mime_header($name) : '"' . addcslashes($name, '"\\') . '"';
    return "$n <$email>";
}

/**
 * Builds a plain-text UTF-8 email. Returns [raw message, Message-ID].
 * $extraHeaders e.g. ['In-Reply-To' => '<id>', 'References' => '<id>'].
 */
function build_message(array $from, string $to, string $subject, string $text, ?string $replyTo = null, array $extraHeaders = []): array
{
    $domain = substr(strrchr($from['email'], '@') ?: '@localhost', 1);
    $messageId = '<' . bin2hex(random_bytes(12)) . '.' . time() . "@$domain>";
    $headers = [
        'Date' => date(DATE_RFC2822),
        'From' => mime_address($from['email'], $from['name'] ?? ''),
        'To' => "<$to>",
        'Subject' => mime_header($subject),
        'Message-ID' => $messageId,
        'MIME-Version' => '1.0',
        'Content-Type' => 'text/plain; charset=UTF-8',
        'Content-Transfer-Encoding' => 'quoted-printable',
    ];
    if ($replyTo) {
        $headers['Reply-To'] = "<$replyTo>";
    }
    $headers = array_merge($headers, $extraHeaders);
    $raw = '';
    foreach ($headers as $k => $v) {
        $raw .= "$k: $v\r\n";
    }
    $body = quoted_printable_encode(str_replace(["\r\n", "\r"], "\n", $text));
    $body = str_replace("\n", "\r\n", str_replace("\r\n", "\n", $body));
    return [$raw . "\r\n" . $body, $messageId];
}
