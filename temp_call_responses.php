<?php
session_start();
$_SESSION['user_id'] = 1;
$_SESSION['role'] = 'admin';
$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET['survey_id'] = '25';
$_GET['graduate_id'] = '2080';
$_GET['response_id'] = '1040';
ob_start();
include 'backend/api/surveys/responses.php';
$out = ob_get_clean();
echo $out;
?>
