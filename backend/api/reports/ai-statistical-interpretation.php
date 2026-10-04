<?php

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/admin_auth.php';
require_once __DIR__ . '/../config/statistical_interpretation.php';

$database = new Database();
$db = $database->getConnection();

try {
    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
        exit;
    }

    $authUser = gradtrack_require_admin_auth(
        $db,
        ['research_coordinator'],
        'Only Research Coordinator accounts can generate statistical interpretations'
    );
    $body = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'A valid interpretation request is required.']);
        exit;
    }

    $fingerprint = is_string($body['analysisFingerprint'] ?? null)
        ? strtolower(trim($body['analysisFingerprint']))
        : '';
    if (preg_match('/^[a-f0-9]{64}$/', $fingerprint) !== 1) {
        http_response_code(422);
        echo json_encode(['success' => false, 'error' => 'The analysis context is invalid. Run the analysis again.']);
        exit;
    }

    // Loading a context verifies the current session user and role against the
    // server-owned result registered by inferential-analysis.php. This prevents
    // a manipulated program filter or statistical payload from being accepted.
    $context = gradtrack_statistical_load_context($authUser, $fingerprint);
    if ($context === null) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'The analysis context expired. Run the analysis again.']);
        exit;
    }

    $regenerate = filter_var($body['regenerate'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $cached = gradtrack_statistical_get_cached_interpretation($fingerprint);
    $regenerationLimited = false;

    if ($regenerate && !gradtrack_statistical_regeneration_allowed($fingerprint) && $cached !== null) {
        $regenerationLimited = true;
    }

    if ($cached !== null && (!$regenerate || $regenerationLimited)) {
        gradtrack_statistical_safe_log(
            $authUser,
            'completed',
            (string)($cached['source'] ?? 'fallback'),
            0,
            true
        );
        echo json_encode([
            'success' => true,
            'data' => [
                'analysisFingerprint' => $fingerprint,
                'interpretation' => $cached['interpretation'],
                'source' => $cached['source'],
                'model' => $cached['model'] ?? null,
                'cached' => true,
                'regenerationLimited' => $regenerationLimited,
                'notice' => ($cached['source'] ?? '') === 'ai'
                    ? ($regenerationLimited ? 'Please wait briefly before regenerating again.' : null)
                    : 'AI interpretation is temporarily unavailable. Showing the standard statistical interpretation.',
            ],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $resolved = gradtrack_statistical_resolve_interpretation(
        $context['payload'],
        $context['fallback']
    );
    gradtrack_statistical_cache_interpretation($fingerprint, $resolved);
    gradtrack_statistical_safe_log(
        $authUser,
        ($resolved['source'] ?? '') === 'ai' ? 'completed' : 'fallback',
        (string)($resolved['source'] ?? 'fallback'),
        (int)($resolved['latency_ms'] ?? 0),
        false,
        is_string($resolved['reason'] ?? null) ? $resolved['reason'] : null
    );

    echo json_encode([
        'success' => true,
        'data' => [
            'analysisFingerprint' => $fingerprint,
            'interpretation' => $resolved['interpretation'],
            'source' => $resolved['source'],
            'model' => $resolved['model'] ?? null,
            'cached' => false,
            'regenerationLimited' => false,
            'notice' => ($resolved['source'] ?? '') === 'ai'
                ? null
                : 'AI interpretation is temporarily unavailable. Showing the standard statistical interpretation.',
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $exception) {
    error_log(json_encode([
        'event' => 'gradtrack_statistical_interpretation',
        'timestamp' => gmdate('c'),
        'status' => 'server_error',
        'exception_type' => get_class($exception),
    ], JSON_UNESCAPED_SLASHES));
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'AI interpretation is temporarily unavailable. The statistical analysis is still available.',
    ]);
}
