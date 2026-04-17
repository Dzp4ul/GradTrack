<?php
require 'backend/api/config/database.php';
$db = (new Database())->getConnection();
$stmt = $db->prepare('SELECT id,survey_id,graduate_id,responses,submitted_at FROM survey_responses WHERE id=:id');
$stmt->execute([':id' => 1040]);
$r = $stmt->fetch(PDO::FETCH_ASSOC);
var_export($r);
echo PHP_EOL;
if ($r) {
  $q = $db->prepare('SELECT id,sort_order,question_text FROM survey_questions WHERE survey_id=:sid ORDER BY sort_order,id');
  $q->execute([':sid' => $r['survey_id']]);
  $qs = $q->fetchAll(PDO::FETCH_ASSOC);
  echo 'questions=' . count($qs) . PHP_EOL;
  echo 'first5=' . json_encode(array_slice($qs, 0, 5)) . PHP_EOL;
  $d = json_decode($r['responses'], true);
  echo 'responseKeys=' . json_encode(array_slice(array_keys((array) $d), 0, 30)) . PHP_EOL;
  echo 'responseCount=' . (is_array($d) ? count($d) : 0) . PHP_EOL;
}
?>
