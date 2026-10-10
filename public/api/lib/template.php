<?php
// Server copy of src/lib/template.ts + src/lib/leadVars.ts — keep in sync.

declare(strict_types=1);

const CC_IF_BLOCK = '/\{\{#if (\w+)(?:\s*=\s*([^}]+?))?\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/u';

/** Appended to every outreach email so recipients can always opt out. Mirrored in src/lib/template.ts */
const CC_OPT_OUT_FOOTER = "\n\n—\nVill du inte få fler mejl från oss? Svara \"avregistrera\" så tar vi bort er från listan.";

const CC_CSV_COLUMNS = [
    'company_name', 'email', 'phone', 'niche', 'city', 'website', 'source_query',
    'bolagsnamn', 'org_nr', 'bolagstyp', 'registreringsdatum', 'momsregistrerad',
    'f_skatt', 'arbetsgivarregistrerad', 'lan', 'enrich_source_url',
    'enrich_match_confidence', 'kontaktperson', 'kontaktperson_roll',
];

function render_template(string $tpl, array $vars): string
{
    $out = preg_replace_callback(CC_IF_BLOCK, function (array $m) use ($vars): string {
        $value = mb_strtolower(trim($vars[$m[1]] ?? ''));
        $options = $m[2] ?? '';
        $hit = $options !== ''
            ? in_array($value, array_map(fn ($o) => mb_strtolower(trim($o)), explode('|', $options)), true)
            : $value !== '';
        return $hit ? $m[3] : ($m[4] ?? '');
    }, $tpl);
    return preg_replace_callback('/\{\{\s*(\w+)\s*\}\}/u', fn ($m) => $vars[$m[1]] ?? '', $out);
}

/** Template whose niche list contains the lead's niche, else the default one. */
function pick_template(array $templates, ?string $niche): ?array
{
    $n = mb_strtolower($niche ?? '');
    foreach ($templates as $t) {
        foreach ($t['niches'] as $x) {
            if (mb_strtolower($x) === $n) {
                return $t;
            }
        }
    }
    foreach ($templates as $t) {
        if ($t['is_default']) {
            return $t;
        }
    }
    return $templates[0] ?? null;
}

/** Every parameter available to email templates. Mirrors leadVars() in src/lib/leadVars.ts */
function lead_vars(array $lead, string $agentName): array
{
    $s = fn ($v) => $v === null ? '' : (string) $v;
    $parts = preg_split('/\s+/u', trim($s($lead['kontaktperson'] ?? null)), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $first = $parts[0] ?? '';
    $last = count($parts) > 1 ? $parts[count($parts) - 1] : '';
    $reg = $s($lead['registreringsdatum'] ?? null);
    $regYear = (int) substr($reg, 0, 4);

    $vars = [];
    foreach (CC_CSV_COLUMNS as $c) {
        $vars[$c] = $s($lead[$c] ?? null);
    }
    return array_merge($vars, [
        'agent_name' => $agentName,
        'kontaktperson' => trim("$first $last"),
        'kontaktperson_fullt' => $s($lead['kontaktperson'] ?? null),
        'first_name' => $first,
        'last_name' => $last,
        'website' => rtrim(preg_replace('#^https?://(www\.)?#i', '', $s($lead['website'] ?? null)), '/'),
        'ar_i_branschen' => $regYear > 1800 ? (string) ((int) date('Y') - $regYear) : '',
        'registreringsar' => substr($reg, 0, 4),
        'om_foretaget' => $s($lead['om_foretaget'] ?? null),
        'specialitet' => $s($lead['specialitet'] ?? null),
    ]);
}
