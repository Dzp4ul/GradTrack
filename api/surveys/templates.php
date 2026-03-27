<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            // Get all predefined templates
            $templates = [
                [
                    'id' => 'graduate_tracer',
                    'name' => 'Graduate Tracer Study Survey',
                    'description' => 'Comprehensive survey for tracking graduate employment and career outcomes',
                    'category' => 'Employment',
                    'icon' => 'briefcase',
                    'questions_count' => 33,
                    'analytics_enabled' => true
                ],
                [
                    'id' => 'course_satisfaction',
                    'name' => 'Course Satisfaction Survey',
                    'description' => 'Evaluate graduate satisfaction with their academic program',
                    'category' => 'Academic',
                    'icon' => 'star',
                    'questions_count' => 15,
                    'analytics_enabled' => true
                ],
                [
                    'id' => 'alumni_engagement',
                    'name' => 'Alumni Engagement Survey',
                    'description' => 'Assess alumni interest in college events and initiatives',
                    'category' => 'Engagement',
                    'icon' => 'users',
                    'questions_count' => 10,
                    'analytics_enabled' => true
                ],
                [
                    'id' => 'skills_assessment',
                    'name' => 'Skills Assessment Survey',
                    'description' => 'Evaluate skills gained and their relevance to current employment',
                    'category' => 'Skills',
                    'icon' => 'award',
                    'questions_count' => 12,
                    'analytics_enabled' => true
                ]
            ];

            if (isset($_GET['id'])) {
                $template = getTemplateById($_GET['id']);
                if ($template) {
                    echo json_encode(["success" => true, "data" => $template]);
                } else {
                    http_response_code(404);
                    echo json_encode(["success" => false, "error" => "Template not found"]);
                }
            } else {
                echo json_encode(["success" => true, "data" => $templates]);
            }
            break;

        default:
            http_response_code(405);
            echo json_encode(["success" => false, "error" => "Method not allowed"]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}

function getTemplateById($id) {
    $templates = [
        'graduate_tracer' => [
            'id' => 'graduate_tracer',
            'name' => 'Graduate Tracer Study Survey',
            'description' => 'Comprehensive survey for tracking graduate employment and career outcomes',
            'category' => 'Employment',
            'status' => 'draft',
            'analytics_enabled' => true,
            'questions' => [
                // Section A - General Information
                ['question_text' => '1. Last Name', 'question_type' => 'text', 'options' => null, 'is_required' => 1, 'sort_order' => 1],
                ['question_text' => '1. First Name', 'question_type' => 'text', 'options' => null, 'is_required' => 1, 'sort_order' => 2],
                ['question_text' => '1. Middle Name', 'question_type' => 'text', 'options' => null, 'is_required' => 0, 'sort_order' => 3],
                ['question_text' => '2. Region', 'question_type' => 'multiple_choice', 'options' => ['NCR', 'CAR', 'Region I', 'Region II', 'Region III', 'Region IV-A', 'Region IV-B', 'Region V', 'Region VI', 'Region VII', 'Region VIII', 'Region IX', 'Region X', 'Region XI', 'Region XII', 'Region XIII', 'BARMM'], 'is_required' => 1, 'sort_order' => 4],
                ['question_text' => '3. E-mail Address', 'question_type' => 'text', 'options' => null, 'is_required' => 1, 'sort_order' => 5],
                ['question_text' => '4. Mobile Number', 'question_type' => 'text', 'options' => null, 'is_required' => 1, 'sort_order' => 6],
                ['question_text' => '5. Civil Status', 'question_type' => 'multiple_choice', 'options' => ['Single', 'Married', 'Widowed', 'Separated'], 'is_required' => 1, 'sort_order' => 7],
                ['question_text' => '6. Sex', 'question_type' => 'multiple_choice', 'options' => ['Male', 'Female'], 'is_required' => 1, 'sort_order' => 8],
                
                // Section B - Educational Background
                ['question_text' => '7. Degree Program & Specialization', 'question_type' => 'multiple_choice', 'options' => ['Bachelor of Science in Computer Science', 'Associate in Computer Technology', 'Bachelor of Secondary Education - General Science', 'Bachelor of Elementary Education', 'Bachelor of Science in Hospitality Management'], 'is_required' => 1, 'sort_order' => 9],
                ['question_text' => '8. Year Graduated', 'question_type' => 'text', 'options' => null, 'is_required' => 1, 'sort_order' => 10],
                ['question_text' => '9. Honors / Awards Received', 'question_type' => 'checkbox', 'options' => ['Cum Laude', 'Magna Cum Laude', 'Leadership Award', 'Best in Thesis', "Dean's Lister", 'Academic Excellence'], 'is_required' => 0, 'sort_order' => 11],
                
                // Section C - Employment Data
                ['question_text' => '10. Are you presently employed?', 'question_type' => 'multiple_choice', 'options' => ['Yes', 'No'], 'is_required' => 1, 'sort_order' => 12],
                ['question_text' => '11. If NO, reason(s) why you are not yet employed', 'question_type' => 'checkbox', 'options' => ['Advance or further study', 'Family concern', 'Health-related reason', 'Lack of work experience', 'No job opportunity', 'Did not look for a job'], 'is_required' => 0, 'sort_order' => 13],
                ['question_text' => '12. If YES, present employment status', 'question_type' => 'multiple_choice', 'options' => ['Regular/Permanent', 'Temporary', 'Casual', 'Contractual', 'Self-employed'], 'is_required' => 0, 'sort_order' => 14],
                ['question_text' => '13. Current position/designation', 'question_type' => 'text', 'options' => null, 'is_required' => 0, 'sort_order' => 15],
                ['question_text' => '14. Company/Organization name', 'question_type' => 'text', 'options' => null, 'is_required' => 0, 'sort_order' => 16],
                ['question_text' => '15. Industry/Sector', 'question_type' => 'multiple_choice', 'options' => ['IT/Technology', 'Education', 'Hospitality', 'Healthcare', 'Government', 'Business/Finance', 'Manufacturing', 'Other'], 'is_required' => 0, 'sort_order' => 17],
                ['question_text' => '16. Monthly salary range', 'question_type' => 'multiple_choice', 'options' => ['Below 10,000', '10,000-20,000', '20,000-30,000', '30,000-50,000', 'Above 50,000'], 'is_required' => 0, 'sort_order' => 18],
                ['question_text' => '17. How long did it take to find your first job?', 'question_type' => 'multiple_choice', 'options' => ['Less than 1 month', '1-3 months', '3-6 months', '6-12 months', 'More than 1 year'], 'is_required' => 0, 'sort_order' => 19],
                ['question_text' => '18. Is your current job related to your course?', 'question_type' => 'multiple_choice', 'options' => ['Yes, directly related', 'Partially related', 'Not related'], 'is_required' => 0, 'sort_order' => 20],
                ['question_text' => '19. Suggestions to improve the course curriculum', 'question_type' => 'text', 'options' => null, 'is_required' => 0, 'sort_order' => 21],
            ]
        ],
        'course_satisfaction' => [
            'id' => 'course_satisfaction',
            'name' => 'Course Satisfaction Survey',
            'description' => 'Evaluate graduate satisfaction with their academic program',
            'category' => 'Academic',
            'status' => 'draft',
            'analytics_enabled' => true,
            'questions' => [
                ['question_text' => 'Rate your overall satisfaction with your academic program', 'question_type' => 'rating', 'options' => ['1', '2', '3', '4', '5'], 'is_required' => 1, 'sort_order' => 1],
                ['question_text' => 'Did the program prepare you well for your career?', 'question_type' => 'multiple_choice', 'options' => ['Strongly Agree', 'Agree', 'Neutral', 'Disagree', 'Strongly Disagree'], 'is_required' => 1, 'sort_order' => 2],
                ['question_text' => 'Quality of instruction', 'question_type' => 'rating', 'options' => ['1', '2', '3', '4', '5'], 'is_required' => 1, 'sort_order' => 3],
                ['question_text' => 'Relevance of curriculum to industry needs', 'question_type' => 'rating', 'options' => ['1', '2', '3', '4', '5'], 'is_required' => 1, 'sort_order' => 4],
                ['question_text' => 'Availability of learning resources', 'question_type' => 'rating', 'options' => ['1', '2', '3', '4', '5'], 'is_required' => 1, 'sort_order' => 5],
                ['question_text' => 'What skills from the program are most useful in your career?', 'question_type' => 'text', 'options' => null, 'is_required' => 0, 'sort_order' => 6],
                ['question_text' => 'What improvements would you suggest?', 'question_type' => 'text', 'options' => null, 'is_required' => 0, 'sort_order' => 7],
            ]
        ],
        'alumni_engagement' => [
            'id' => 'alumni_engagement',
            'name' => 'Alumni Engagement Survey',
            'description' => 'Assess alumni interest in college events and initiatives',
            'category' => 'Engagement',
            'status' => 'draft',
            'analytics_enabled' => true,
            'questions' => [
                ['question_text' => 'How often do you visit the college website?', 'question_type' => 'multiple_choice', 'options' => ['Daily', 'Weekly', 'Monthly', 'Rarely', 'Never'], 'is_required' => 1, 'sort_order' => 1],
                ['question_text' => 'Would you attend alumni events?', 'question_type' => 'multiple_choice', 'options' => ['Yes, definitely', 'Maybe', 'No'], 'is_required' => 1, 'sort_order' => 2],
                ['question_text' => 'What type of events interest you?', 'question_type' => 'checkbox', 'options' => ['Homecoming', 'Career Fair', 'Networking Events', 'Workshops', 'Sports Events', 'Fundraising'], 'is_required' => 0, 'sort_order' => 3],
                ['question_text' => 'Would you be willing to mentor current students?', 'question_type' => 'multiple_choice', 'options' => ['Yes', 'No', 'Maybe'], 'is_required' => 1, 'sort_order' => 4],
                ['question_text' => 'How can the college better engage with alumni?', 'question_type' => 'text', 'options' => null, 'is_required' => 0, 'sort_order' => 5],
            ]
        ],
        'skills_assessment' => [
            'id' => 'skills_assessment',
            'name' => 'Skills Assessment Survey',
            'description' => 'Evaluate skills gained and their relevance to current employment',
            'category' => 'Skills',
            'status' => 'draft',
            'analytics_enabled' => true,
            'questions' => [
                ['question_text' => 'Rate your technical skills gained from the program', 'question_type' => 'rating', 'options' => ['1', '2', '3', '4', '5'], 'is_required' => 1, 'sort_order' => 1],
                ['question_text' => 'Rate your communication skills', 'question_type' => 'rating', 'options' => ['1', '2', '3', '4', '5'], 'is_required' => 1, 'sort_order' => 2],
                ['question_text' => 'Rate your problem-solving abilities', 'question_type' => 'rating', 'options' => ['1', '2', '3', '4', '5'], 'is_required' => 1, 'sort_order' => 3],
                ['question_text' => 'Rate your teamwork and collaboration skills', 'question_type' => 'rating', 'options' => ['1', '2', '3', '4', '5'], 'is_required' => 1, 'sort_order' => 4],
                ['question_text' => 'Which skills are most valuable in your current job?', 'question_type' => 'checkbox', 'options' => ['Technical/Programming', 'Communication', 'Leadership', 'Critical Thinking', 'Research', 'Project Management'], 'is_required' => 0, 'sort_order' => 5],
                ['question_text' => 'What additional skills would have been helpful?', 'question_type' => 'text', 'options' => null, 'is_required' => 0, 'sort_order' => 6],
            ]
        ]
    ];

    return $templates[$id] ?? null;
}
