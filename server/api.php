<?php
/**
 * Mini-API de stockage des séances Hit Timer (hébergement mutualisé OVH).
 *
 * Voir README.md dans ce dossier pour l'installation.
 * Nécessite config.php (créé à partir de config.example.php) définissant :
 *   define('HIIT_TOKEN', '...jeton secret...');
 */

declare(strict_types=1);

require __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Hit-Token');
header('Cache-Control: no-store');

const DATA_FILE = __DIR__ . '/data/sessions.jsonl';

/**
 * Jeton transmis soit dans l'en-tête X-Hit-Token (appli), soit en
 * paramètre ?token= (lecture depuis un navigateur / un agent).
 */
function auth_ok(): bool {
    $token = $_SERVER['HTTP_X_HIT_TOKEN'] ?? ($_GET['token'] ?? '');
    if (!is_string($token) || $token === '' || !defined('HIIT_TOKEN')) {
        return false;
    }
    return hash_equals(HIIT_TOKEN, $token);
}

function fail(int $code, string $msg): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

function load_sessions(): array {
    if (!is_file(DATA_FILE)) return [];
    $out = [];
    foreach (file(DATA_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $json = json_decode($line, true);
        if (is_array($json)) $out[] = $json;
    }
    return $out;
}

function ensure_data_dir(): bool {
    $dir = dirname(DATA_FILE);
    if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
        return false;
    }
    return is_writable($dir) || is_writable(DATA_FILE);
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!auth_ok()) {
    fail(401, 'unauthorized');
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $body = file_get_contents('php://input');
    $json = json_decode($body ?: '', true);
    if (!is_array($json)) fail(400, 'invalid-json');

    // Sécurité : on ne garde que les champs attendus et leurs types.
    $day = str_pad((string)($json['day'] ?? ''), 10, '0');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
        $day = date('Y-m-d'); // jour du serveur en dernier recours
    }

    $reps = [];
    if (isset($json['reps']) && is_array($json['reps'])) {
        foreach ($json['reps'] as $r) {
            if (!is_array($r)) continue;
            $exercise = mb_substr(trim((string)($r['exercise'] ?? '')), 0, 60);
            $round = (int)($r['round'] ?? 0);
            $value = (int)($r['reps'] ?? 0);
            if ($exercise === '' || $round < 0 || $value < 0 || $value > 9999) continue;
            $reps[] = ['exercise' => $exercise, 'round' => $round, 'reps' => $value];
        }
    }

    $config = [];
    if (isset($json['config']) && is_array($json['config'])) {
        foreach (['work', 'rest', 'exercises', 'rounds', 'longRest', 'prepare'] as $k) {
            $config[$k] = (int)($json['config'][$k] ?? 0);
        }
    }

    $record = [
        'receivedAt' => date('c'),
        'day' => $day,
        'realMs' => (int)($json['realMs'] ?? 0),
        'totalMs' => (int)($json['totalMs'] ?? 0),
        'config' => $config,
        'reps' => $reps,
    ];
    // Calories estimées (kcal, méthode MET) : présentes pour les séances récentes.
    if (isset($json['kcal']) && is_numeric($json['kcal'])) {
        $record['kcal'] = (int)$json['kcal'];
    }

    if (!ensure_data_dir()) fail(500, 'storage-unwritable');

    $line = json_encode($record, JSON_UNESCAPED_UNICODE) . PHP_EOL;
    if (@file_put_contents(DATA_FILE, $line, FILE_APPEND | LOCK_EX) === false) {
        fail(500, 'storage-write-error');
    }
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => true]);
    exit;
}

if ($method === 'GET') {
    $format = $_GET['format'] ?? 'json';
    $sessions = load_sessions();
    // Ordre chronologique (jour de séance, pas l'heure de réception interne).
    usort($sessions, fn($a, $b) => strcmp((string)($a['day'] ?? ''), (string)($b['day'] ?? '')));

    if ($format === 'csv') {
        header('Content-Type: text/csv; charset=utf-8');
        // BOM UTF-8 pour que Excel fr reconnaisse l'encodage.
        echo "\xEF\xBB\xBF";
        echo "date;exercice;round;reps;duree_min;kcal\r\n";
        foreach ($sessions as $s) {
            $day = (string)($s['day'] ?? '');
            $minutes = round(((int)($s['realMs'] ?? 0)) / 60000, 1);
            $kcal = isset($s['kcal']) ? (string)(int)$s['kcal'] : '';
            printf("%s;Séance;0;;%s;%s\r\n", $day, $minutes, $kcal);
            foreach (($s['reps'] ?? []) as $r) {
                printf(
                    "%s;%s;%d;%d;;\r\n",
                    $day,
                    str_replace([';', "\r", "\n"], ' ', (string)($r['exercise'] ?? '')),
                    (int)($r['round'] ?? 0),
                    (int)($r['reps'] ?? 0)
                );
            }
        }
        exit;
    }

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => true, 'sessions' => $sessions], JSON_UNESCAPED_UNICODE);
    exit;
}

fail(405, 'method-not-allowed');
