<?php
/**
 * Database Fix Script
 * Run this file once to fix the survey_responses table
 * Access: http://localhost/api/fix-database.php
 */

header("Content-Type: text/html; charset=UTF-8");

require_once 'config/database.php';

echo "<!DOCTYPE html>
<html>
<head>
    <title>GradTrack Database Fix</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #1e40af;
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 10px;
        }
        .success {
            background: #d1fae5;
            border-left: 4px solid #10b981;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
        }
        .error {
            background: #fee2e2;
            border-left: 4px solid #ef4444;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
        }
        .info {
            background: #dbeafe;
            border-left: 4px solid #3b82f6;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
        }
        code {
            background: #f3f4f6;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }
        .btn {
            display: inline-block;
            background: #3b82f6;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
        }
        .btn:hover {
            background: #2563eb;
        }
    </style>
</head>
<body>
    <div class='container'>
        <h1>🔧 GradTrack Database Fix</h1>
        <p>This script will fix the <code>survey_responses</code> table to allow anonymous survey submissions.</p>
";

try {
    $database = new Database();
    $conn = $database->getConnection();
    
    echo "<div class='info'><strong>Step 1:</strong> Checking database connection... ✓ Connected</div>";
    
    // Check current column definition
    $checkQuery = "SHOW COLUMNS FROM survey_responses WHERE Field = 'graduate_id'";
    $stmt = $conn->query($checkQuery);
    $column = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($column) {
        echo "<div class='info'><strong>Step 2:</strong> Current column definition:<br>";
        echo "Field: <code>{$column['Field']}</code><br>";
        echo "Type: <code>{$column['Type']}</code><br>";
        echo "Null: <code>{$column['Null']}</code><br>";
        echo "Key: <code>{$column['Key']}</code></div>";
        
        if ($column['Null'] === 'NO') {
            echo "<div class='info'><strong>Step 3:</strong> Applying fix...</div>";
            
            // Apply the fix
            $fixQuery = "ALTER TABLE survey_responses MODIFY COLUMN graduate_id INT NULL";
            $conn->exec($fixQuery);
            
            echo "<div class='success'>
                <strong>✓ SUCCESS!</strong><br>
                The <code>graduate_id</code> column has been updated to allow NULL values.<br>
                Anonymous survey submissions are now enabled!
            </div>";
            
            // Verify the fix
            $stmt = $conn->query($checkQuery);
            $updatedColumn = $stmt->fetch(PDO::FETCH_ASSOC);
            
            echo "<div class='info'><strong>Step 4:</strong> Verification:<br>";
            echo "Field: <code>{$updatedColumn['Field']}</code><br>";
            echo "Type: <code>{$updatedColumn['Type']}</code><br>";
            echo "Null: <code>{$updatedColumn['Null']}</code> ✓</div>";
            
        } else {
            echo "<div class='success'>
                <strong>✓ Already Fixed!</strong><br>
                The <code>graduate_id</code> column already allows NULL values.<br>
                No changes needed. Survey submissions should work fine!
            </div>";
        }
    } else {
        echo "<div class='error'>
            <strong>✗ ERROR:</strong> Column <code>graduate_id</code> not found in <code>survey_responses</code> table.
        </div>";
    }
    
    echo "
        <h2>Next Steps:</h2>
        <ol>
            <li>Test survey submission at <a href='/survey' target='_blank'>/survey</a></li>
            <li>Check if data appears in Dashboard at <a href='/admin' target='_blank'>/admin</a></li>
            <li>View responses at <a href='/admin/surveys' target='_blank'>/admin/surveys</a></li>
        </ol>
        
        <a href='/survey' class='btn'>Test Survey Now →</a>
    ";
    
} catch (PDOException $e) {
    echo "<div class='error'>
        <strong>✗ DATABASE ERROR:</strong><br>
        {$e->getMessage()}
    </div>";
    
    echo "
        <h3>Manual Fix:</h3>
        <p>If this script fails, run this SQL command manually in phpMyAdmin:</p>
        <code style='display:block; padding:15px; background:#1f2937; color:#10b981; margin:10px 0;'>
        ALTER TABLE survey_responses MODIFY COLUMN graduate_id INT NULL;
        </code>
    ";
} catch (Exception $e) {
    echo "<div class='error'>
        <strong>✗ ERROR:</strong><br>
        {$e->getMessage()}
    </div>";
}

echo "
    </div>
</body>
</html>";
?>
