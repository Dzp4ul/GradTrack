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

if (!function_exists('gradtrack_get_alumni_rating')) {
    function gradtrack_get_alumni_rating(PDO $db, array $user): array
    {
        $graduateId = (int) ($user['graduate_id'] ?? 0);
        $accountId = (int) ($user['account_id'] ?? 0);

        $maxSurvey = 35.0;
        $maxProfile = 25.0;
        $maxCareer = 15.0;
        $maxDocuments = 15.0;
        $maxEngagement = 10.0;

        $surveyEarned = 0.0;
        $surveyMeta = [
            'required_total' => 0,
            'required_answered' => 0,
            'optional_total' => 0,
            'optional_answered' => 0,
            'latest_survey_response_id' => null
        ];

        $latestSurveyStmt = $db->prepare('SELECT id, survey_id, responses FROM survey_responses WHERE graduate_id = :graduate_id ORDER BY submitted_at DESC, id DESC LIMIT 1');
        $latestSurveyStmt->bindParam(':graduate_id', $graduateId);
        $latestSurveyStmt->execute();
        $latestSurvey = $latestSurveyStmt->fetch(PDO::FETCH_ASSOC);

        if ($latestSurvey) {
            $surveyMeta['latest_survey_response_id'] = (int) $latestSurvey['id'];
            $decodedResponses = json_decode((string) $latestSurvey['responses'], true);
            $responses = is_array($decodedResponses) ? $decodedResponses : [];

            $questionStmt = $db->prepare('SELECT id, is_required FROM survey_questions WHERE survey_id = :survey_id');
            $questionStmt->bindParam(':survey_id', $latestSurvey['survey_id']);
            $questionStmt->execute();
            $questions = $questionStmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($questions as $question) {
                $questionId = (string) $question['id'];
                $isRequired = (int) $question['is_required'] === 1;
                $answer = $responses[$questionId] ?? null;
                $isAnswered = gradtrack_rating_answered($answer);

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

        $profileWeights = [
            'student_id' => 2.0,
            'first_name' => 3.0,
            'middle_name' => 1.0,
            'last_name' => 3.0,
            'email' => 4.0,
            'phone' => 3.0,
            'address' => 3.0,
            'program_id' => 3.0,
            'year_graduated' => 3.0,
        ];

        $profileEarned = 0.0;
        $missingProfileFields = [];
        $profileStmt = $db->prepare('SELECT g.student_id, g.first_name, g.middle_name, g.last_name, COALESCE(g.email, ga.email) AS email, g.phone, g.address, g.program_id, g.year_graduated
                                     FROM graduates g
                                     LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
                                     WHERE g.id = :graduate_id
                                     LIMIT 1');
        $profileStmt->bindParam(':graduate_id', $graduateId);
        $profileStmt->execute();
        $profile = $profileStmt->fetch(PDO::FETCH_ASSOC) ?: [];

        foreach ($profileWeights as $field => $weight) {
            if (gradtrack_rating_non_empty($profile[$field] ?? null)) {
                $profileEarned += $weight;
            } else {
                $missingProfileFields[] = $field;
            }
        }

        $careerEarned = 0.0;
        $careerMeta = [
            'has_record' => false,
            'employment_status' => null
        ];
        $careerWeights = [
            'employment_status' => 2.0,
            'company_name' => 3.0,
            'job_title' => 3.0,
            'industry' => 2.0,
            'date_hired' => 2.0,
            'is_aligned' => 2.0,
            'monthly_salary' => 1.0,
        ];

        $careerStmt = $db->prepare('SELECT employment_status, company_name, job_title, industry, date_hired, is_aligned, monthly_salary
                                    FROM employment
                                    WHERE graduate_id = :graduate_id
                                    ORDER BY updated_at DESC, id DESC
                                    LIMIT 1');
        $careerStmt->bindParam(':graduate_id', $graduateId);
        $careerStmt->execute();
        $career = $careerStmt->fetch(PDO::FETCH_ASSOC);

        if ($career) {
            $careerMeta['has_record'] = true;
            $careerMeta['employment_status'] = $career['employment_status'];

            foreach ($careerWeights as $field => $weight) {
                if (gradtrack_rating_non_empty($career[$field] ?? null)) {
                    $careerEarned += $weight;
                }
            }
        }

        $docsStmt = $db->prepare('SELECT document_type, is_verified
                                  FROM alumni_supporting_documents
                                  WHERE graduate_account_id = :account_id
                                    AND is_active = 1');
        $docsStmt->bindParam(':account_id', $accountId);
        $docsStmt->execute();
        $docs = $docsStmt->fetchAll(PDO::FETCH_ASSOC);

        $totalDocs = count($docs);
        $docTypes = [];
        $verifiedDocs = 0;

        foreach ($docs as $doc) {
            $docTypes[(string) $doc['document_type']] = true;
            if ((int) $doc['is_verified'] === 1) {
                $verifiedDocs++;
            }
        }

        $distinctDocTypes = count($docTypes);
        $documentEarned = min(
            $maxDocuments,
            (min($totalDocs, 3) * 2.0)
            + (min($distinctDocTypes, 4) * 2.0)
            + ($verifiedDocs > 0 ? 1.0 : 0.0)
        );

        $jobPostsCountStmt = $db->prepare('SELECT COUNT(*) AS cnt FROM job_posts WHERE posted_by_account_id = :account_id');
        $jobPostsCountStmt->bindParam(':account_id', $accountId);
        $jobPostsCountStmt->execute();
        $jobPostsCount = (int) ($jobPostsCountStmt->fetch(PDO::FETCH_ASSOC)['cnt'] ?? 0);

        $jobApplicationsCountStmt = $db->prepare('SELECT COUNT(*) AS cnt FROM job_applications WHERE applicant_account_id = :account_id');
        $jobApplicationsCountStmt->bindParam(':account_id', $accountId);
        $jobApplicationsCountStmt->execute();
        $jobApplicationsCount = (int) ($jobApplicationsCountStmt->fetch(PDO::FETCH_ASSOC)['cnt'] ?? 0);

        $completedMentorshipStmt = $db->prepare("SELECT COUNT(*) AS cnt
                                                FROM mentorship_requests mr
                                                LEFT JOIN mentors m ON mr.mentor_id = m.id
                                                WHERE mr.status = 'completed'
                                                  AND (mr.mentee_account_id = :account_id OR m.graduate_account_id = :account_id)");
        $completedMentorshipStmt->bindParam(':account_id', $accountId);
        $completedMentorshipStmt->execute();
        $completedMentorshipCount = (int) ($completedMentorshipStmt->fetch(PDO::FETCH_ASSOC)['cnt'] ?? 0);

        $feedbackGivenStmt = $db->prepare('SELECT COUNT(*) AS cnt FROM mentorship_feedback WHERE mentee_account_id = :account_id');
        $feedbackGivenStmt->bindParam(':account_id', $accountId);
        $feedbackGivenStmt->execute();
        $feedbackGivenCount = (int) ($feedbackGivenStmt->fetch(PDO::FETCH_ASSOC)['cnt'] ?? 0);

        $surveyCountStmt = $db->prepare('SELECT COUNT(*) AS cnt FROM survey_responses WHERE graduate_id = :graduate_id');
        $surveyCountStmt->bindParam(':graduate_id', $graduateId);
        $surveyCountStmt->execute();
        $surveyCount = (int) ($surveyCountStmt->fetch(PDO::FETCH_ASSOC)['cnt'] ?? 0);

        $loginStmt = $db->prepare('SELECT last_login_at FROM graduate_accounts WHERE id = :account_id LIMIT 1');
        $loginStmt->bindParam(':account_id', $accountId);
        $loginStmt->execute();
        $lastLoginAt = $loginStmt->fetch(PDO::FETCH_ASSOC)['last_login_at'] ?? null;

        $engagementEarned = 0.0;
        $engagementEarned += min($jobPostsCount, 3) * 1.0;
        $engagementEarned += min($jobApplicationsCount, 2) * 1.0;
        $engagementEarned += min($completedMentorshipCount, 2) * 1.5;
        $engagementEarned += $feedbackGivenCount > 0 ? 1.0 : 0.0;
        $engagementEarned += $lastLoginAt ? 1.0 : 0.0;
        $engagementEarned += min($surveyCount, 2) * 0.5;
        $engagementEarned = min($maxEngagement, $engagementEarned);

        $mentorStatsStmt = $db->prepare("SELECT COUNT(mf.id) AS feedback_count,
                                                COALESCE(AVG(mf.rating), 0) AS avg_rating
                                         FROM mentors m
                                         LEFT JOIN mentorship_requests mr ON mr.mentor_id = m.id AND mr.status = 'completed'
                                         LEFT JOIN mentorship_feedback mf ON mf.mentorship_request_id = mr.id
                                         WHERE m.graduate_account_id = :account_id");
        $mentorStatsStmt->bindParam(':account_id', $accountId);
        $mentorStatsStmt->execute();
        $mentorStats = $mentorStatsStmt->fetch(PDO::FETCH_ASSOC) ?: ['feedback_count' => 0, 'avg_rating' => 0];

        $totalScore = $surveyEarned + $profileEarned + $careerEarned + $documentEarned + $engagementEarned;
        $score = (int) round(min(100.0, $totalScore));

        $breakdown = [
            'survey_completeness' => [
                'label' => 'Tracer Survey Completeness',
                'max_points' => $maxSurvey,
                'earned_points' => round($surveyEarned, 2),
                'percent' => gradtrack_rating_percent($surveyEarned, $maxSurvey),
                'meta' => $surveyMeta,
            ],
            'profile_completeness' => [
                'label' => 'Profile Completeness',
                'max_points' => $maxProfile,
                'earned_points' => round($profileEarned, 2),
                'percent' => gradtrack_rating_percent($profileEarned, $maxProfile),
                'meta' => [
                    'missing_fields' => $missingProfileFields,
                ],
            ],
            'career_details' => [
                'label' => 'Employment / Career Details',
                'max_points' => $maxCareer,
                'earned_points' => round($careerEarned, 2),
                'percent' => gradtrack_rating_percent($careerEarned, $maxCareer),
                'meta' => $careerMeta,
            ],
            'supporting_documents' => [
                'label' => 'Training / Certificates / Supporting Documents',
                'max_points' => $maxDocuments,
                'earned_points' => round($documentEarned, 2),
                'percent' => gradtrack_rating_percent($documentEarned, $maxDocuments),
                'meta' => [
                    'total_documents' => $totalDocs,
                    'distinct_document_types' => $distinctDocTypes,
                    'verified_documents' => $verifiedDocs,
                    'max_counted_documents' => 3,
                ],
            ],
            'engagement' => [
                'label' => 'Participation / Engagement Activity',
                'max_points' => $maxEngagement,
                'earned_points' => round($engagementEarned, 2),
                'percent' => gradtrack_rating_percent($engagementEarned, $maxEngagement),
                'meta' => [
                    'job_posts' => $jobPostsCount,
                    'job_applications' => $jobApplicationsCount,
                    'completed_mentorships' => $completedMentorshipCount,
                    'feedback_given' => $feedbackGivenCount,
                    'survey_submissions' => $surveyCount,
                    'has_logged_in' => $lastLoginAt !== null,
                ],
            ],
        ];

        $recommendations = [];
        foreach ($breakdown as $key => $item) {
            $missing = round((float) $item['max_points'] - (float) $item['earned_points'], 2);
            if ($missing <= 0) {
                continue;
            }

            $action = 'Keep maintaining your records.';
            if ($key === 'survey_completeness') {
                $action = 'Complete required and optional tracer survey questions.';
            } elseif ($key === 'profile_completeness') {
                $action = 'Fill missing profile fields such as contact details, address, program, and graduation year.';
            } elseif ($key === 'career_details') {
                $action = 'Add/update your latest employment status, role, company, and alignment details.';
            } elseif ($key === 'supporting_documents') {
                $action = 'Upload certificates, seminar proofs, training records, or awards (max score is capped).';
            } elseif ($key === 'engagement') {
                $action = 'Engage by posting jobs, applying to opportunities, and completing mentorship activities.';
            }

            $recommendations[] = [
                'area_key' => $key,
                'area' => $item['label'],
                'missing_points' => $missing,
                'current_points' => (float) $item['earned_points'],
                'max_points' => (float) $item['max_points'],
                'action' => $action,
            ];
        }

        usort($recommendations, function ($a, $b) {
            return $b['missing_points'] <=> $a['missing_points'];
        });

        $permissions = [
            'can_post_jobs' => $score >= 50,
            'can_use_mentorship' => $score >= 70,
            'can_register_mentor' => $score >= 70,
            'job_post_threshold' => 50,
            'mentor_threshold' => 70,
            'points_to_unlock_job_posting' => max(0, 50 - $score),
            'points_to_unlock_mentorship' => max(0, 70 - $score),
        ];

        $badges = [];

        if ($breakdown['profile_completeness']['percent'] >= 90) {
            $badges[] = [
                'code' => 'profile_complete',
                'name' => 'Profile Complete',
                'description' => 'Profile is at least 90% complete.',
            ];
        }

        if ($verifiedDocs > 0 || $documentEarned >= 10) {
            $badges[] = [
                'code' => 'verified_contributor',
                'name' => 'Verified Contributor',
                'description' => 'Uploaded supporting records with strong document coverage.',
            ];
        }

        if ($score >= 70 && $breakdown['survey_completeness']['percent'] >= 75 && $breakdown['profile_completeness']['percent'] >= 80) {
            $badges[] = [
                'code' => 'active_alumni',
                'name' => 'Active Alumni',
                'description' => 'Consistently complete and high-quality alumni participation.',
            ];
        }

        if ((int) $mentorStats['feedback_count'] >= 3 && (float) $mentorStats['avg_rating'] >= 4.5) {
            $badges[] = [
                'code' => 'top_mentor',
                'name' => 'Top Mentor',
                'description' => 'Maintained excellent mentor feedback over multiple sessions.',
            ];
        }

        if ($jobPostsCount >= 2) {
            $badges[] = [
                'code' => 'career_supporter',
                'name' => 'Career Supporter',
                'description' => 'Shared opportunities with the alumni community.',
            ];
        }

        if ($breakdown['engagement']['percent'] >= 80) {
            $badges[] = [
                'code' => 'highly_engaged',
                'name' => 'Highly Engaged',
                'description' => 'Sustained participation in jobs, mentorship, and alumni activities.',
            ];
        }

        return [
            'score' => $score,
            'breakdown' => $breakdown,
            'badges' => $badges,
            'permissions' => $permissions,
            'recommendations' => $recommendations,
            'weights' => [
                'survey_completeness' => $maxSurvey,
                'profile_completeness' => $maxProfile,
                'career_details' => $maxCareer,
                'supporting_documents' => $maxDocuments,
                'engagement' => $maxEngagement,
            ],
        ];
    }
}

if (!function_exists('gradtrack_require_alumni_score')) {
    function gradtrack_require_alumni_score(PDO $db, array $user, int $minimumScore, string $featureLabel): array
    {
        $rating = gradtrack_get_alumni_rating($db, $user);
        $score = (int) ($rating['score'] ?? 0);

        if ($score < $minimumScore) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Insufficient alumni rating score for this feature',
                'feature' => $featureLabel,
                'current_score' => $score,
                'required_score' => $minimumScore,
                'rating' => $rating,
                'next_steps' => array_slice($rating['recommendations'] ?? [], 0, 3),
            ]);
            exit;
        }

        return $rating;
    }
}
