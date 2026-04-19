<?php

require_once __DIR__ . '/graduate_auth.php';

if (!function_exists('gradtrack_rating_non_empty')) {
    function gradtrack_rating_non_empty($value): bool
    {
        if ($value === null) {
            return false;
        }

        if (is_string($value)) {
            return trim($value) !== '';
        }

        return true;
    }
}

if (!function_exists('gradtrack_rating_answered')) {
    function gradtrack_rating_answered($value): bool
    {
        if ($value === null) {
            return false;
        }

        if (is_array($value)) {
            return count($value) > 0;
        }

        if (is_string($value)) {
            return trim($value) !== '';
        }

        return true;
    }
}

if (!function_exists('gradtrack_rating_percent')) {
    function gradtrack_rating_percent(float $earned, float $max): float
    {
        if ($max <= 0) {
            return 0.0;
        }

        return round(($earned / $max) * 100, 1);
    }
}

if (!function_exists('gradtrack_rating_normalize_text')) {
    function gradtrack_rating_normalize_text($value): string
    {
        if ($value === null) {
            return '';
        }

        return strtolower(trim((string) $value));
    }
}

if (!function_exists('gradtrack_rating_is_employed_status')) {
    function gradtrack_rating_is_employed_status(string $status): bool
    {
        return in_array($status, ['employed', 'self_employed', 'freelance', 'yes', 'employed_local', 'employed_abroad'], true);
    }
}

if (!function_exists('gradtrack_rating_is_aligned_status')) {
    function gradtrack_rating_is_aligned_status(string $status): bool
    {
        return in_array($status, ['aligned', 'yes', 'true', '1', 'directly related'], true);
    }
}

if (!function_exists('gradtrack_rating_is_survey_complete')) {
    function gradtrack_rating_is_survey_complete(array $surveyMeta): bool
    {
        return ($surveyMeta['required_total'] ?? 0) > 0
            && (int) ($surveyMeta['required_answered'] ?? 0) >= (int) ($surveyMeta['required_total'] ?? 0);
    }
}

if (!function_exists('gradtrack_rating_answer_to_text')) {
    function gradtrack_rating_answer_to_text($answer): string
    {
        if ($answer === null) {
            return '';
        }

        if (is_array($answer)) {
            $joined = implode(' ', array_map(function ($item) {
                return is_scalar($item) ? (string) $item : '';
            }, $answer));
            return strtolower(trim($joined));
        }

        return strtolower(trim((string) $answer));
    }
}

if (!function_exists('gradtrack_rating_detect_response_key_offset')) {
    function gradtrack_rating_detect_response_key_offset(array $questions, array $responses): ?int
    {
        $questionIds = [];
        foreach ($questions as $question) {
            $questionId = (string) ($question['id'] ?? '');
            if ($questionId !== '' && ctype_digit($questionId)) {
                $questionIds[] = (int) $questionId;
            }
        }

        $responseKeySet = [];
        foreach (array_keys($responses) as $key) {
            $responseKey = (string) $key;
            if ($responseKey !== '' && ctype_digit($responseKey)) {
                $responseKeySet[(int) $responseKey] = true;
            }
        }

        if (!$questionIds || !$responseKeySet) {
            return null;
        }

        $scores = [];
        foreach ($questionIds as $questionId) {
            foreach (array_keys($responseKeySet) as $responseKey) {
                $offset = $questionId - (int) $responseKey;
                $scores[$offset] = ($scores[$offset] ?? 0) + 1;
            }
        }

        arsort($scores);
        $minimumMatches = max(2, min(5, (int) floor(count($questionIds) * 0.2)));

        foreach ($scores as $offset => $score) {
            $offset = (int) $offset;
            $matches = 0;

            foreach ($questionIds as $questionId) {
                if (isset($responseKeySet[$questionId - $offset])) {
                    $matches++;
                }
            }

            if ($matches >= $minimumMatches) {
                return $offset;
            }
        }

        return null;
    }
}

if (!function_exists('gradtrack_rating_response_for_question')) {
    function gradtrack_rating_response_for_question(array $responses, string $questionId, ?int $responseKeyOffset)
    {
        if (array_key_exists($questionId, $responses)) {
            return $responses[$questionId];
        }

        if ($responseKeyOffset !== null && ctype_digit($questionId)) {
            $legacyQuestionId = (string) ((int) $questionId - $responseKeyOffset);
            if (array_key_exists($legacyQuestionId, $responses)) {
                return $responses[$legacyQuestionId];
            }
        }

        return null;
    }
}

if (!function_exists('gradtrack_rating_parse_employment_from_answer')) {
    function gradtrack_rating_parse_employment_from_answer(string $answerText): ?bool
    {
        if ($answerText === '') {
            return null;
        }

        if (strpos($answerText, 'unemployed') !== false || $answerText === 'no' || strpos($answerText, 'not employed') !== false) {
            return false;
        }

        if (
            strpos($answerText, 'employed') !== false
            || $answerText === 'yes'
            || strpos($answerText, 'self-employed') !== false
            || strpos($answerText, 'freelance') !== false
            || strpos($answerText, 'regular') !== false
            || strpos($answerText, 'permanent') !== false
            || strpos($answerText, 'temporary') !== false
            || strpos($answerText, 'contractual') !== false
            || strpos($answerText, 'casual') !== false
        ) {
            return true;
        }

        return null;
    }
}

if (!function_exists('gradtrack_rating_parse_alignment_from_answer')) {
    function gradtrack_rating_parse_alignment_from_answer(string $answerText): ?bool
    {
        if ($answerText === '') {
            return null;
        }

        if (strpos($answerText, 'not aligned') !== false || strpos($answerText, 'not related') !== false || $answerText === 'no' || strpos($answerText, 'partially') !== false) {
            return false;
        }

        if (strpos($answerText, 'aligned') !== false || strpos($answerText, 'directly related') !== false || strpos($answerText, 'related') !== false || $answerText === 'yes') {
            return true;
        }

        return null;
    }
}

if (!function_exists('gradtrack_rating_get_latest_employment')) {
    function gradtrack_rating_get_latest_employment(PDO $db, int $graduateId): ?array
    {
        $stmt = $db->prepare('SELECT employment_status, is_aligned
                              FROM employment
                              WHERE graduate_id = :graduate_id
                              ORDER BY id DESC
                              LIMIT 1');
        $stmt->bindParam(':graduate_id', $graduateId);
        $stmt->execute();

        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}

if (!function_exists('gradtrack_rating_get_verification_flags')) {
    function gradtrack_rating_get_verification_flags(PDO $db, int $accountId): array
    {
        $verifiedDocStmt = $db->prepare('SELECT id
                                         FROM alumni_supporting_documents
                                         WHERE graduate_account_id = :account_id
                                           AND is_active = 1
                                           AND is_verified = 1
                                         LIMIT 1');
        $verifiedDocStmt->bindParam(':account_id', $accountId);
        $verifiedDocStmt->execute();
        $hasVerifiedDocument = (bool) $verifiedDocStmt->fetch(PDO::FETCH_ASSOC);

        $activeMentorStmt = $db->prepare("SELECT mr.id
                                          FROM mentorship_requests mr
                                          JOIN mentors m ON mr.mentor_id = m.id
                                          WHERE mr.status = 'completed'
                                            AND (
                                                m.graduate_account_id = :account_id
                                                OR mr.mentee_account_id = :account_id
                                            )
                                          LIMIT 1");
        $activeMentorStmt->bindParam(':account_id', $accountId);
        $activeMentorStmt->execute();
        $isActiveMentor = (bool) $activeMentorStmt->fetch(PDO::FETCH_ASSOC);

        return [
            'is_verified_graduate' => $hasVerifiedDocument,
            'is_active_mentor' => $isActiveMentor,
        ];
    }      
}

if (!function_exists('gradtrack_rating_build_permissions')) {
    function gradtrack_rating_build_permissions(array $status): array
    {
        $isEmployed = (bool) ($status['is_employed'] ?? false);
        $isAligned = (bool) ($status['is_aligned'] ?? false);

        $canPostJobs = $isEmployed;
        $canUseMentorship = $isEmployed && $isAligned;
        $canRequestMentorship = !$isEmployed || !$isAligned;

        return [
            'can_post_jobs' => $canPostJobs,
            'can_use_mentorship' => $canUseMentorship,
            'can_request_mentorship' => $canRequestMentorship,
            'can_register_mentor' => $canUseMentorship,
            'requirements' => [
                'job_posting' => [
                    'is_employed' => true,
                ],
                'mentorship_request' => [
                    'is_unemployed' => true,
                ],
                'mentorship' => [
                    'is_employed' => true,
                    'is_aligned' => true,
                ],
            ],
        ];
    }
}

if (!function_exists('gradtrack_get_alumni_rating')) {
    function gradtrack_get_alumni_rating(PDO $db, array $user): array
    {
        $graduateId = (int) ($user['graduate_id'] ?? 0);
        $accountId = (int) ($user['account_id'] ?? 0);

        $maxSurvey = 35.0;

        $surveyEarned = 0.0;
        $surveyMeta = [
            'required_total' => 0,
            'required_answered' => 0,
            'optional_total' => 0,
            'optional_answered' => 0,
            'latest_survey_response_id' => null,
            'employment_signal' => null,
            'alignment_signal' => null,
        ];

        $latestSurveyStmt = $db->prepare('SELECT id, survey_id, responses FROM survey_responses WHERE graduate_id = :graduate_id ORDER BY submitted_at DESC, id DESC LIMIT 1');
        $latestSurveyStmt->bindParam(':graduate_id', $graduateId);
        $latestSurveyStmt->execute();
        $latestSurvey = $latestSurveyStmt->fetch(PDO::FETCH_ASSOC);

        if ($latestSurvey) {
            $surveyMeta['latest_survey_response_id'] = (int) $latestSurvey['id'];
            $decodedResponses = json_decode((string) $latestSurvey['responses'], true);
            $responses = is_array($decodedResponses) ? $decodedResponses : [];

            $questionStmt = $db->prepare('SELECT id, is_required, question_text FROM survey_questions WHERE survey_id = :survey_id ORDER BY sort_order ASC, id ASC');
            $questionStmt->bindParam(':survey_id', $latestSurvey['survey_id']);
            $questionStmt->execute();
            $questions = $questionStmt->fetchAll(PDO::FETCH_ASSOC);
            $responseKeyOffset = gradtrack_rating_detect_response_key_offset($questions, $responses);

            foreach ($questions as $question) {
                $questionId = (string) $question['id'];
                $isRequired = (int) $question['is_required'] === 1;
                $answer = gradtrack_rating_response_for_question($responses, $questionId, $responseKeyOffset);
                $isAnswered = gradtrack_rating_answered($answer);
                $questionText = strtolower((string) ($question['question_text'] ?? ''));
                $answerText = gradtrack_rating_answer_to_text($answer);

                if ($answerText !== '') {
                    if (
                        strpos($questionText, 'employment status') !== false
                        || strpos($questionText, 'presently employed') !== false
                        || strpos($questionText, 'are you employed') !== false
                        || strpos($questionText, 'present employment') !== false
                    ) {
                        $parsedEmployment = gradtrack_rating_parse_employment_from_answer($answerText);
                        if ($parsedEmployment !== null) {
                            $surveyMeta['employment_signal'] = $parsedEmployment;
                        }
                    }

                    if (
                        strpos($questionText, 'job related') !== false
                        || strpos($questionText, 'related to your course') !== false
                        || strpos($questionText, 'job alignment') !== false
                        || strpos($questionText, 'aligned') !== false
                    ) {
                        $parsedAlignment = gradtrack_rating_parse_alignment_from_answer($answerText);
                        if ($parsedAlignment !== null) {
                            $surveyMeta['alignment_signal'] = $parsedAlignment;
                        }
                    }
                }

                if ($isRequired) {
                    $surveyMeta['required_total']++;
                    if ($isAnswered) {
                        $surveyMeta['required_answered']++;
                    }
                } else {
                    $surveyMeta['optional_total']++;
                    if ($isAnswered) {
                        $surveyMeta['optional_answered']++;
                    }
                }
            }

            $requiredRatio = $surveyMeta['required_total'] > 0
                ? ((float) $surveyMeta['required_answered'] / (float) $surveyMeta['required_total'])
                : 1.0;
            $optionalRatio = $surveyMeta['optional_total'] > 0
                ? ((float) $surveyMeta['optional_answered'] / (float) $surveyMeta['optional_total'])
                : 0.0;

            $surveyRatio = min(1.0, (0.8 * $requiredRatio) + (0.2 * $optionalRatio));
            $surveyEarned = round($maxSurvey * $surveyRatio, 2);
        }

        // Keep credibility score for dashboard display only.
        $surveyPercent = gradtrack_rating_percent($surveyEarned, $maxSurvey);
        $score = (int) round($surveyPercent);

        $isSurveyComplete = gradtrack_rating_is_survey_complete($surveyMeta);

        $employment = gradtrack_rating_get_latest_employment($db, $graduateId);
        $employmentStatus = gradtrack_rating_normalize_text($employment['employment_status'] ?? '');
        $alignmentStatus = gradtrack_rating_normalize_text($employment['is_aligned'] ?? '');

        $employmentFromTable = gradtrack_rating_is_employed_status($employmentStatus);
        $alignmentFromTable = gradtrack_rating_is_aligned_status($alignmentStatus);

        $employmentFromSurvey = $surveyMeta['employment_signal'];
        $alignmentFromSurvey = $surveyMeta['alignment_signal'];

        $isEmployed = is_bool($employmentFromSurvey) ? $employmentFromSurvey : $employmentFromTable;
        $isAligned = is_bool($alignmentFromSurvey) ? $alignmentFromSurvey : $alignmentFromTable;

        $verificationFlags = gradtrack_rating_get_verification_flags($db, $accountId);
        $hasSurveyCompletedBadge = $surveyPercent >= 70;

        $statusFlags = [
            'is_survey_complete' => $isSurveyComplete,
            'is_employed' => $isEmployed,
            'is_aligned' => $isAligned,
            'has_survey_completed_badge' => $hasSurveyCompletedBadge,
            'is_verified_graduate' => (bool) ($verificationFlags['is_verified_graduate'] ?? false),
            'is_active_mentor' => (bool) ($verificationFlags['is_active_mentor'] ?? false),
        ];

        $breakdown = [
            'survey_completeness' => [
                'label' => 'Tracer Survey Completeness',
                'max_points' => $maxSurvey,
                'earned_points' => round($surveyEarned, 2),
                'percent' => $surveyPercent,
                'meta' => $surveyMeta,
            ],
        ];

        $recommendations = [];

        if (!$isSurveyComplete) {
            $recommendations[] = [
                'area_key' => 'survey_completeness',
                'area' => 'Tracer Survey Completion',
                'missing_points' => round($maxSurvey - $surveyEarned, 2),
                'current_points' => (float) round($surveyEarned, 2),
                'max_points' => (float) $maxSurvey,
                'action' => 'Complete all required tracer survey fields to unlock platform features.',
            ];
        }

        if (!$isEmployed) {
            $recommendations[] = [
                'area_key' => 'employment_status',
                'area' => 'Employment Status',
                'missing_points' => 0.0,
                'current_points' => 0.0,
                'max_points' => 0.0,
                'action' => 'Update your employment information and indicate that you are employed.',
            ];
        }

        if (!$isAligned) {
            $recommendations[] = [
                'area_key' => 'course_alignment',
                'area' => 'Course Alignment',
                'missing_points' => 0.0,
                'current_points' => 0.0,
                'max_points' => 0.0,
                'action' => 'Set your employment alignment to aligned for mentorship eligibility.',
            ];
        }

        $permissions = gradtrack_rating_build_permissions($statusFlags);

        $badges = [];

        if ($hasSurveyCompletedBadge) {
            $badges[] = [
                'code' => 'survey_completed_70',
                'name' => 'Survey Completed (70%)',
                'description' => 'Awarded when your survey completion reaches at least 70%.',
            ];
        }

        if ($statusFlags['is_verified_graduate']) {
            $badges[] = [
                'code' => 'verified_graduate',
                'name' => 'Verified Graduate',
                'description' => 'Granted after admin verification of your graduate credentials.',
            ];
        }

        if ($statusFlags['is_active_mentor']) {
            $badges[] = [
                'code' => 'active_mentor',
                'name' => 'Active Mentor',
                'description' => 'Granted after successful participation in mentorship.',
            ];
        }

        return [
            'score' => $score,
            'breakdown' => $breakdown,
            'badges' => $badges,
            'status_flags' => $statusFlags,
            'permissions' => $permissions,
            'recommendations' => $recommendations,
            'weights' => [
                'survey_completeness' => $maxSurvey,
            ],
        ];
    }
}

if (!function_exists('gradtrack_require_feature_access')) {
    function gradtrack_require_feature_access(PDO $db, array $user, string $featureKey): array
    {
        $rating = gradtrack_get_alumni_rating($db, $user);
        $permissions = $rating['permissions'] ?? [];
        $statusFlags = $rating['status_flags'] ?? [];

        $featureMap = [
            'job_posting' => ['permission' => 'can_post_jobs', 'label' => 'Job posting'],
            'mentorship_request' => ['permission' => 'can_request_mentorship', 'label' => 'Mentorship request'],
            'mentorship' => ['permission' => 'can_use_mentorship', 'label' => 'Mentorship'],
            'mentor_registration' => ['permission' => 'can_register_mentor', 'label' => 'Mentor registration'],
        ];

        if (!isset($featureMap[$featureKey])) {
            throw new InvalidArgumentException('Unknown feature access key: ' . $featureKey);
        }

        $featureLabel = $featureMap[$featureKey]['label'];
        $permissionKey = $featureMap[$featureKey]['permission'];
        $isAllowed = (bool) ($permissions[$permissionKey] ?? false);

        if (!$isAllowed) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Feature is locked until required eligibility rules are met',
                'feature' => $featureLabel,
                'feature_key' => $featureKey,
                'rating' => $rating,
                'status_flags' => $statusFlags,
                'next_steps' => array_slice($rating['recommendations'] ?? [], 0, 3),
            ]);
            exit;
        }

        return $rating;
    }
}

if (!function_exists('gradtrack_require_alumni_score')) {
    function gradtrack_require_alumni_score(PDO $db, array $user, int $minimumScore, string $featureLabel): array
    {
        $feature = $minimumScore >= 70 ? 'mentor_registration' : 'job_posting';
        return gradtrack_require_feature_access($db, $user, $feature);
    }
}
