<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off']);
session_start();
if (!isset($_SESSION['voter'])) {
    $_SESSION['voter'] = bin2hex(random_bytes(24));
}


$scores = ['S' => 5, 'A' => 4, 'B' => 3, 'C' => 2, 'D' => 1, 'F' => 0];

$categories = [
    'academic' => ['sCDI', 'heafey', 'oconnor', 'kenna', 'daly', 'lucas', 'vari', 'bergin', 'alumni', 'charney'],
    'dorms' => ['sobratoHall', 'graham', 'finn', 'swig', 'dunne', 'mclaughlinWalsh', 'campisi', 'sanfilippo', 'casaItaliana'],
    'food' => ['benson', 'bronco', 'missionBakery', 'sunstream']
];

$category = $_GET['category'] ?? 'academic';
if (!array_key_exists($category, $categories)) respond(400, ['error' => 'Invalid category.']);

$ids = $categories[$category];
$path = dirname(__DIR__) . '/data/submissions.json';


// Pre: code is an HTTP status and body is JSON-serializable.
// Post: Sends the JSON response and ends the request.
function respond(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

// Pre: submissions contains validated building tiers; ids and scores define the catalog.
// Post: Returns each building's average, tier, count and vote distribution.
//       Unranked buildings are excluded; submissions are unchanged.
function community(array $submissions, array $ids, array $scores): array {
    $result = [];
    foreach ($ids as $id) {
        $count = 0;
        $sum = 0;
        $distribution = array_fill_keys(array_keys($scores), 0);
        foreach ($submissions as $ranking) {
            if (isset($ranking[$id], $scores[$ranking[$id]])) {
                $sum += $scores[$ranking[$id]];
                $distribution[$ranking[$id]]++;
                $count++;
            }
        }
        $average = $count ? $sum / $count : null;
        $tier = $average === null ? null : array_keys($scores)[5 - (int) round($average, 0, PHP_ROUND_HALF_UP)];
        $result[$id] = ['average' => $average, 'tier' => $tier, 'count' => $count, 'distribution' => $distribution];
    }
    return $result;
}

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET' && $method !== 'POST') respond(405, ['error' => 'Method not allowed.']);
if ($method === 'POST') {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($origin && parse_url($origin, PHP_URL_HOST) !== explode(':', $host)[0]) {
        respond(403, ['error' => 'Invalid request origin.']);
    }
    if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) respond(415, ['error' => 'Expected JSON.']);
    $input = json_decode(file_get_contents('php://input', false, null, 0, 8192), true);
    $ranking = $input['ranking'] ?? null;
    if (!is_array($ranking) || !$ranking || count($ranking) > count($ids)) respond(400, ['error' => 'Rank at least one building.']);
    foreach ($ranking as $id => $tier) {
        if (!in_array($id, $ids, true) || !is_string($tier) || !array_key_exists($tier, $scores)) {
            respond(400, ['error' => 'Invalid building or tier.']);
        }
    }
}

$file = fopen($path, 'c+');
if (!$file) respond(500, ['error' => 'Storage is unavailable.']);
try {
    if (!flock($file, $method === 'POST' ? LOCK_EX : LOCK_SH)) throw new RuntimeException('Lock failed');
    $raw = stream_get_contents($file);
    $submissions = $raw === '' ? [] : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($submissions)) throw new RuntimeException('Invalid stored data');
    
    if ($method === 'POST') {
        $voter = $_SESSION['voter'];

        if (!isset($submissions[$voter]['academic']) &&
            !isset($submissions[$voter]['dorms']) &&
            !isset($submissions[$voter]['food']) &&
            isset($submissions[$voter]) &&
            is_array($submissions[$voter])) {
            $submissions[$voter] = ['academic' => $submissions[$voter]];
        }

        $submissions[$voter][$category] = $ranking;

        $json = json_encode($submissions, JSON_THROW_ON_ERROR);
        rewind($file);
        if (fwrite($file, $json) !== strlen($json) || !ftruncate($file, strlen($json)) || !fflush($file)) throw new RuntimeException('Write failed');
    }

    $voter = $_SESSION['voter'];
    $mine = $submissions[$voter][$category] ?? null;

    if ($category === 'academic' && $mine === null && !empty(array_intersect_key($submissions[$voter] ?? [], array_flip($categories['academic'])))) {
        $mine = $submissions[$voter];
    }

    $categorySubmissions = [];

    foreach ($submissions as $voterRanking) {
        if (isset($voterRanking[$category]) && is_array($voterRanking[$category])) {
            $categorySubmissions[] = $voterRanking[$category];
        } elseif ($category === 'academic' && !empty(array_intersect_key($voterRanking, array_flip($categories['academic'])))) {
            $categorySubmissions[] = $voterRanking;
        }
    }

    $summary = community($categorySubmissions, $ids, $scores);

    flock($file, LOCK_UN);
    fclose($file);
    respond(200, ['mine' => $mine, 'community' => $summary]);
} catch (Throwable $error) {
    flock($file, LOCK_UN);
    fclose($file);
    respond(500, ['error' => 'Could not read or save rankings.']);
}
