<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/forum.php';

function ai_moderate_json_error(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function ai_moderate_keyword_check(string $text): array
{
    $badWords = [
        // English profanity
        'fuck', 'fucking', 'fuck you', 'fck', 'fuk', 'fuking', 'shit', 'bitch', 'asshole',
        'motherfucker', 'dick', 'piss', 'cunt', 'bastard', 'damn', 'pissed', 'b1tch', 'sh!t',
        // Tagalog profanity
        'putangina', 'puta', 'tangina', 'tngina', 'bobo', 'tanga', 'gago', 'gaga',
        'ulol', 'baliw', 'lintik', 'leche', 'buwisit', 'bwisit', 'peste',
        'sira ulo', 'siraulo', 'hindot', 'tarantado', 'pokpok', 'bading',
        'ungas', 'engot', 'pakyu', 'kupal', 'kantot', 'kantutan', 'suso',
        'tite', 'pekpek', 'dede', 'animal', 'hayop', 'inutil', 'walang kwenta',
        'pota', 'tamod', 'puke', 'ulul',
        // Variations
        'tang ina', 'putang ina', 'potaena', 'putaena', 'tarantada',
        'gunggong', 'bobo ka', 'tanga ka', 'gago ka',
    ];

    $textLower = mb_strtolower($text);
    foreach ($badWords as $badWord) {
        $pattern = '/' . preg_quote($badWord, '/') . '/i';
        if (preg_match($pattern, $textLower)) {
            return [
                'flagged' => true,
                'categories' => ['profanity'],
                'reason' => 'Post contains inappropriate language: "' . htmlspecialchars($badWord) . '"',
                'confidence' => 0.99,
            ];
        }
    }

    return [
        'flagged' => false,
        'categories' => [],
        'reason' => null,
        'confidence' => 0.0,
    ];
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    ai_moderate_json_error(405, 'Method not allowed');
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$database = new Database();
$db = $database->getConnection();
$graduateUser = gradtrack_current_graduate_user($db);
if (!$graduateUser) {
    ai_moderate_json_error(401, 'Graduate authentication required');
}

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    ai_moderate_json_error(400, 'Invalid JSON payload');
}

$title = trim((string) ($data['title'] ?? ''));
$content = trim((string) ($data['content'] ?? ''));
$category = trim((string) ($data['category'] ?? ''));

if ($title === '' && $content === '') {
    ai_moderate_json_error(400, 'Title or content is required for moderation');
}

// FIRST: Always run keyword check (works without AI API)
$combinedText = $title . ' ' . $content . ' ' . $category;
$keywordResult = ai_moderate_keyword_check($combinedText);

if ($keywordResult['flagged']) {
    echo json_encode([
        'success' => true,
        'is_appropriate' => false,
        'source' => 'keyword',
        'moderation' => $keywordResult,
    ]);
    exit;
}

// SECOND: Try Groq AI for advanced detection
$groqApiKey = getenv('GROQ_API_KEY');
if (!empty($groqApiKey)) {
    $prompt = "You are a strict content moderation assistant for a Filipino graduate alumni forum called GradTrack.
Analyze if the post is appropriate for a professional academic alumni community.

IMPORTANT: Detect profanity in BOTH ENGLISH AND TAGALOG (FILIPINO).

Common Filipino/Tagalog bad words to detect: putangina, puta, tangina, bobo, tanga, gago, gaga, ulol, baliw, lintik, leche, buwisit, peste, siraulo, hindot, tarantado, pokpok, bading, engot, pakyu, kupal, kantot, suso, tite, pepek, walang kwenta, animal, hayop, inutil

Check for categories: harassment, hate_speech, profanity, spam, violence, explicit, misinformation, advertising

Post Title: " . $title . "
Post Content: " . $content . "
Category: " . $category . "

BE STRICT - Flag ANY post containing bad words in English, Tagalog, or mixed.
Even a single bad word should be flagged.

Respond with valid JSON only:
{\"flagged\": true/false, \"categories\": [\"list\"], \"reason\": \"explanation or null\"}";

    $requestBody = json_encode([
        'model' => 'llama-3.1-8b-instant',
        'messages' => [
            ['role' => 'system', 'content' => 'You are a content moderation API. Respond only with valid JSON.'],
            ['role' => 'user', 'content' => $prompt],
        ],
        'temperature' => 0.1,
        'max_tokens' => 300,
    ]);

    $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $requestBody,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $groqApiKey,
        ],
        CURLOPT_TIMEOUT => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError === '' && $httpCode === 200) {
        $result = json_decode($response, true);
        $aiContent = $result['choices'][0]['message']['content'] ?? '';
        $moderation = json_decode($aiContent, true);
        if (!is_array($moderation)) {
            preg_match('/\{[^}]+\}/', $aiContent, $matches);
            $moderation = isset($matches[0]) ? json_decode($matches[0], true) : null;
        }

        if (is_array($moderation)) {
            $flagged = !empty($moderation['flagged']);
            $categories = is_array($moderation['categories'] ?? null) ? $moderation['categories'] : [];
            $reason = isset($moderation['reason']) ? trim((string) $moderation['reason']) : null;

            if ($flagged) {
                echo json_encode([
                    'success' => true,
                    'is_appropriate' => false,
                    'source' => 'ai',
                    'moderation' => [
                        'flagged' => true,
                        'categories' => $categories,
                        'reason' => $reason ?: 'Content violates community guidelines.',
                        'confidence' => 0.85,
                    ],
                ]);
                exit;
            }
        }
    }
}

// If we get here, post passed both checks
echo json_encode([
    'success' => true,
    'is_appropriate' => true,
    'source' => $groqApiKey ? 'ai' : 'keyword',
    'moderation' => [
        'flagged' => false,
        'categories' => [],
        'reason' => null,
        'confidence' => 1.0,
    ],
]);
exit;