<?php

require_once __DIR__ . '/env.php';

gradtrack_load_env_file();

if (!function_exists('gradtrack_groq_candidate_models')) {
    /**
     * Return the project-configured Groq model first, followed by the same
     * compatibility fallbacks used by the GradTrack assistant.
     */
    function gradtrack_groq_candidate_models(array $fallbackModels = []): array
    {
        $configured = getenv('GROQ_MODEL');
        $models = [
            $configured !== false && trim($configured) !== '' ? trim($configured) : null,
            ...($fallbackModels !== [] ? $fallbackModels : [
                'openai/gpt-oss-120b',
                'openai/gpt-oss-20b',
                'qwen/qwen3.6-27b',
            ]),
        ];

        $unique = [];
        foreach ($models as $model) {
            if (is_string($model) && trim($model) !== '' && !in_array(trim($model), $unique, true)) {
                $unique[] = trim($model);
            }
        }

        return $unique;
    }
}

if (!function_exists('gradtrack_groq_chat')) {
    /**
     * Shared server-side Groq client. Never return the API key or provider
     * response body to callers; endpoints decide which safe error metadata to
     * expose to their own logs.
     */
    function gradtrack_groq_chat(string $systemPrompt, string $userPrompt, array $options = []): array
    {
        $apiKey = getenv('GROQ_API_KEY');
        if ($apiKey === false || trim($apiKey) === '') {
            return [
                'content' => null,
                'model' => null,
                'error' => 'GROQ_API_KEY is not configured.',
                'error_type' => 'configuration',
                'http_code' => null,
                'latency_ms' => 0,
            ];
        }

        if (!function_exists('curl_init')) {
            return [
                'content' => null,
                'model' => null,
                'error' => 'The server HTTP client is unavailable.',
                'error_type' => 'configuration',
                'http_code' => null,
                'latency_ms' => 0,
            ];
        }

        $temperature = isset($options['temperature']) && is_numeric($options['temperature'])
            ? max(0.0, min(1.0, (float)$options['temperature']))
            : 0.2;
        $maxTokens = isset($options['max_tokens']) && is_numeric($options['max_tokens'])
            ? max(128, min(4096, (int)$options['max_tokens']))
            : 3200;
        $timeout = isset($options['timeout']) && is_numeric($options['timeout'])
            ? max(5, min(60, (int)$options['timeout']))
            : 45;
        $connectTimeout = isset($options['connect_timeout']) && is_numeric($options['connect_timeout'])
            ? max(2, min(15, (int)$options['connect_timeout']))
            : 8;
        $fallbackModels = is_array($options['fallback_models'] ?? null)
            ? $options['fallback_models']
            : [];
        $models = is_array($options['models'] ?? null) && $options['models'] !== []
            ? array_values(array_filter($options['models'], 'is_string'))
            : gradtrack_groq_candidate_models($fallbackModels);

        $lastError = null;
        $lastErrorType = 'service_unavailable';
        $lastHttpCode = null;
        $requestStarted = microtime(true);

        foreach ($models as $model) {
            $body = [
                'model' => $model,
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ['role' => 'user', 'content' => $userPrompt],
                ],
                'temperature' => $temperature,
                'max_tokens' => $maxTokens,
            ];
            if (is_array($options['response_format'] ?? null)) {
                $body['response_format'] = $options['response_format'];
            }

            $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                CURLOPT_HTTPHEADER => [
                    'Content-Type: application/json',
                    'Authorization: Bearer ' . trim($apiKey),
                ],
                CURLOPT_TIMEOUT => $timeout,
                CURLOPT_CONNECTTIMEOUT => $connectTimeout,
            ]);

            $response = curl_exec($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($curlError === '' && $httpCode === 200 && is_string($response)) {
                $decoded = json_decode($response, true);
                $content = $decoded['choices'][0]['message']['content'] ?? null;
                if (is_string($content) && trim($content) !== '') {
                    return [
                        'content' => $content,
                        'model' => $model,
                        'error' => null,
                        'error_type' => null,
                        'http_code' => 200,
                        'latency_ms' => (int)round((microtime(true) - $requestStarted) * 1000),
                    ];
                }
                $lastError = 'Groq returned an empty AI message.';
                $lastErrorType = 'empty_response';
                $lastHttpCode = 200;
            } else {
                $lastError = $curlError !== ''
                    ? $curlError
                    : 'Groq request failed with HTTP ' . $httpCode . '.';
                $lastHttpCode = $httpCode > 0 ? $httpCode : null;
                $lastErrorType = $curlError !== '' || $httpCode === 0
                    ? 'network'
                    : ($httpCode === 429
                        ? 'rate_limit'
                        : (in_array($httpCode, [401, 403], true) ? 'configuration' : 'service_unavailable'));
            }

            if (!in_array($httpCode, [400, 403, 404, 429, 500, 502, 503, 504], true)) {
                break;
            }
        }

        return [
            'content' => null,
            'model' => null,
            'error' => $lastError ?: 'Groq request failed.',
            'error_type' => $lastErrorType,
            'http_code' => $lastHttpCode,
            'latency_ms' => (int)round((microtime(true) - $requestStarted) * 1000),
        ];
    }
}

if (!function_exists('gradtrack_groq_decode_json')) {
    function gradtrack_groq_decode_json(?string $content): ?array
    {
        if ($content === null) {
            return null;
        }

        $candidate = trim($content);
        $candidate = preg_replace('/^```(?:json)?\s*/i', '', $candidate) ?? $candidate;
        $candidate = preg_replace('/\s*```$/', '', $candidate) ?? $candidate;
        $decoded = json_decode($candidate, true);
        if (is_array($decoded)) {
            return $decoded;
        }

        $start = strpos($candidate, '{');
        $end = strrpos($candidate, '}');
        if ($start !== false && $end !== false && $end > $start) {
            $decoded = json_decode(substr($candidate, $start, $end - $start + 1), true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return null;
    }
}
