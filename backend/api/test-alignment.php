<?php
// Test script to verify alignment calculation from survey responses
require_once __DIR__ . '/config/database.php';

$database = new Database();
$db = $database->getConnection();

echo "<h2>Alignment Rate Calculation Test</h2>";

// Get survey questions
$stmt = $db->query("SELECT q.id, q.question_text FROM surveys s JOIN survey_questions q ON s.id = q.survey_id WHERE s.status = 'active' ORDER BY q.sort_order");
$questions = $stmt->fetchAll(PDO::FETCH_ASSOC);
$questionMap = [];
foreach ($questions as $q) {
    $questionMap[$q['id']] = strtolower($q['question_text']);
}

echo "<h3>Survey Questions:</h3><ul>";
foreach ($questionMap as $id => $text) {
    echo "<li>ID $id: $text</li>";
}
echo "</ul>";

// Get survey responses
$stmt = $db->query("SELECT id, responses FROM survey_responses");
$surveyResponses = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "<h3>Survey Responses Analysis:</h3>";
$employedCount = 0;
$alignedCount = 0;

foreach ($surveyResponses as $response) {
    $data = json_decode($response['responses'], true);
    if (!is_array($data)) continue;
    
    $isEmployed = false;
    $jobRelated = '';
    
    echo "<div style='border:1px solid #ccc; padding:10px; margin:10px 0;'>";
    echo "<strong>Response ID: {$response['id']}</strong><br>";
    
    foreach ($data as $questionId => $answer) {
        $questionText = isset($questionMap[$questionId]) ? $questionMap[$questionId] : '';
        
        if (strpos($questionText, 'employment status') !== false || strpos($questionText, 'presently employed') !== false) {
            $answerLower = strtolower($answer);
            if ($answerLower === 'yes' || $answerLower === 'employed') {
                $isEmployed = true;
                $employedCount++;
                echo "Employment Status: <strong style='color:green;'>Employed</strong><br>";
            }
        }
        
        if (strpos($questionText, 'job related to') !== false || strpos($questionText, 'related to your course') !== false) {
            $jobRelated = strtolower(trim($answer));
            echo "Job Alignment: <strong>$answer</strong><br>";
        }
    }
    
    if ($isEmployed) {
        if (strpos($jobRelated, 'yes') !== false || strpos($jobRelated, 'directly related') !== false) {
            $alignedCount++;
            echo "Result: <strong style='color:green;'>ALIGNED</strong>";
        } else if (strpos($jobRelated, 'partially') !== false) {
            echo "Result: <strong style='color:orange;'>PARTIALLY ALIGNED</strong>";
        } else {
            echo "Result: <strong style='color:red;'>NOT ALIGNED</strong>";
        }
    }
    echo "</div>";
}

$alignmentRate = $employedCount > 0 ? round(($alignedCount / $employedCount) * 100, 1) : 0;

echo "<h3>Summary:</h3>";
echo "<p>Total Employed: <strong>$employedCount</strong></p>";
echo "<p>Total Aligned: <strong>$alignedCount</strong></p>";
echo "<p>Alignment Rate: <strong style='font-size:24px; color:#f97316;'>{$alignmentRate}%</strong></p>";
