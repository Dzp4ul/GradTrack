<?php
require 'backend/api/config/database.php';
$db = (new Database())->getConnection();
$stmt = $db->prepare('SELECT id, student_id, first_name, last_name FROM graduates WHERE student_id = :sid LIMIT 5');
$stmt->execute([':sid' => '2017-1234']);
var_export($stmt->fetchAll(PDO::FETCH_ASSOC));
?>
