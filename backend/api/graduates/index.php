<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

function normalize_nullable_text($value) {
    if (!isset($value)) {
        return null;
    }

    $trimmed = trim((string)$value);
    return $trimmed === '' ? null : $trimmed;
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["success" => false, "error" => "Authentication required"]);
    exit;
}

if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'registrar') {
    http_response_code(403);
    echo json_encode(["success" => false, "error" => "Only registrar accounts can manage graduates"]);
    exit;
}

try {
    switch ($method) {
        case 'GET':
            if (isset($_GET['id'])) {
                // Get single graduate
                $stmt = $db->prepare("
                    SELECT g.*, p.name as program_name, p.code as program_code,
                        e.company_name, e.job_title, e.industry, e.employment_status, 
                        e.is_aligned, e.date_hired, e.monthly_salary, e.time_to_employment
                    FROM graduates g
                    LEFT JOIN programs p ON g.program_id = p.id
                    LEFT JOIN employment e ON e.graduate_id = g.id
                    WHERE g.id = :id
                ");
                $stmt->bindParam(':id', $_GET['id']);
                $stmt->execute();
                $graduate = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($graduate) {
                    echo json_encode(["success" => true, "data" => $graduate]);
                } else {
                    http_response_code(404);
                    echo json_encode(["success" => false, "error" => "Graduate not found"]);
                }
            } else {
                // List all graduates with filters
                $where = [];
                $params = [];

                if (isset($_GET['search']) && !empty($_GET['search'])) {
                    $where[] = "(g.first_name LIKE :search OR g.middle_name LIKE :search2 OR g.last_name LIKE :search3 OR g.student_id LIKE :search4 OR g.email LIKE :search5)";
                    $searchTerm = '%' . $_GET['search'] . '%';
                    $params[':search'] = $searchTerm;
                    $params[':search2'] = $searchTerm;
                    $params[':search3'] = $searchTerm;
                    $params[':search4'] = $searchTerm;
                    $params[':search5'] = $searchTerm;
                }
                if (isset($_GET['program_id']) && !empty($_GET['program_id'])) {
                    $where[] = "g.program_id = :program_id";
                    $params[':program_id'] = $_GET['program_id'];
                }
                if (isset($_GET['year_graduated']) && !empty($_GET['year_graduated'])) {
                    $where[] = "g.year_graduated = :year";
                    $params[':year'] = $_GET['year_graduated'];
                }
                if (isset($_GET['employment_status']) && !empty($_GET['employment_status'])) {
                    $where[] = "e.employment_status = :emp_status";
                    $params[':emp_status'] = $_GET['employment_status'];
                }

                $whereClause = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';

                $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
                $limit = isset($_GET['limit']) ? min(100, max(1, (int)$_GET['limit'])) : 20;
                $offset = ($page - 1) * $limit;

                // Count total
                $countSql = "SELECT COUNT(*) as total FROM graduates g LEFT JOIN employment e ON e.graduate_id = g.id $whereClause";
                $countStmt = $db->prepare($countSql);
                $countStmt->execute($params);
                $total = $countStmt->fetch(PDO::FETCH_ASSOC)['total'];

                // Fetch data
                $sql = "
                    SELECT g.*, p.name as program_name, p.code as program_code,
                        e.employment_status, e.is_aligned, e.job_title, e.company_name
                    FROM graduates g
                    LEFT JOIN programs p ON g.program_id = p.id
                    LEFT JOIN employment e ON e.graduate_id = g.id
                    $whereClause
                    ORDER BY g.created_at DESC
                    LIMIT $limit OFFSET $offset
                ";
                $stmt = $db->prepare($sql);
                $stmt->execute($params);
                $graduates = $stmt->fetchAll(PDO::FETCH_ASSOC);

                echo json_encode([
                    "success" => true,
                    "data" => $graduates,
                    "pagination" => [
                        "total" => (int)$total,
                        "page" => $page,
                        "limit" => $limit,
                        "pages" => ceil($total / $limit)
                    ]
                ]);
            }
            break;

        case 'POST':
            $data = json_decode(file_get_contents("php://input"), true);

            $studentId = normalize_nullable_text($data['student_id'] ?? null);
            $email = normalize_nullable_text($data['email'] ?? null);
            $phone = normalize_nullable_text($data['phone'] ?? null);
            $middleName = normalize_nullable_text($data['middle_name'] ?? null);
            $address = normalize_nullable_text($data['address'] ?? null);

            if ($email !== null) {
                $emailCheckStmt = $db->prepare("SELECT id FROM graduates WHERE email = :email LIMIT 1");
                $emailCheckStmt->execute([':email' => $email]);
                if ($emailCheckStmt->fetch(PDO::FETCH_ASSOC)) {
                    http_response_code(409);
                    echo json_encode(["success" => false, "error" => "Email already exists. Please use a different email or leave it blank."]);
                    break;
                }
            }

            $stmt = $db->prepare("
                INSERT INTO graduates (student_id, first_name, middle_name, last_name, email, phone, program_id, year_graduated, address)
                VALUES (:student_id, :first_name, :middle_name, :last_name, :email, :phone, :program_id, :year_graduated, :address)
            ");
            $stmt->execute([
                ':student_id' => $studentId,
                ':first_name' => $data['first_name'],
                ':middle_name' => $middleName,
                ':last_name' => $data['last_name'],
                ':email' => $email,
                ':phone' => $phone,
                ':program_id' => $data['program_id'] ?? null,
                ':year_graduated' => $data['year_graduated'] ?? null,
                ':address' => $address,
            ]);
            $graduateId = $db->lastInsertId();

            // Create employment record
            $empStmt = $db->prepare("
                INSERT INTO employment (graduate_id, company_name, job_title, industry, employment_status, is_aligned, date_hired, monthly_salary, time_to_employment)
                VALUES (:graduate_id, :company, :job_title, :industry, :status, :aligned, :date_hired, :salary, :time)
            ");
            $empStmt->execute([
                ':graduate_id' => $graduateId,
                ':company' => $data['company_name'] ?? null,
                ':job_title' => $data['job_title'] ?? null,
                ':industry' => $data['industry'] ?? null,
                ':status' => $data['employment_status'] ?? 'unemployed',
                ':aligned' => $data['is_aligned'] ?? 'not_aligned',
                ':date_hired' => $data['date_hired'] ?? null,
                ':salary' => $data['monthly_salary'] ?? null,
                ':time' => $data['time_to_employment'] ?? 0,
            ]);

            echo json_encode(["success" => true, "message" => "Graduate added successfully", "id" => $graduateId]);
            break;

        case 'PUT':
            $data = json_decode(file_get_contents("php://input"), true);
            if (!isset($data['id'])) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "ID is required"]);
                break;
            }

            $studentId = normalize_nullable_text($data['student_id'] ?? null);
            $email = normalize_nullable_text($data['email'] ?? null);
            $phone = normalize_nullable_text($data['phone'] ?? null);
            $middleName = normalize_nullable_text($data['middle_name'] ?? null);
            $address = normalize_nullable_text($data['address'] ?? null);

            if ($email !== null) {
                $emailCheckStmt = $db->prepare("SELECT id FROM graduates WHERE email = :email AND id <> :id LIMIT 1");
                $emailCheckStmt->execute([':email' => $email, ':id' => $data['id']]);
                if ($emailCheckStmt->fetch(PDO::FETCH_ASSOC)) {
                    http_response_code(409);
                    echo json_encode(["success" => false, "error" => "Email already exists. Please use a different email or leave it blank."]);
                    break;
                }
            }

            $stmt = $db->prepare("
                UPDATE graduates SET 
                    student_id = :student_id, first_name = :first_name, middle_name = :middle_name, last_name = :last_name,
                    email = :email, phone = :phone, program_id = :program_id,
                    year_graduated = :year_graduated, address = :address
                WHERE id = :id
            ");
            $stmt->execute([
                ':id' => $data['id'],
                ':student_id' => $studentId,
                ':first_name' => $data['first_name'],
                ':middle_name' => $middleName,
                ':last_name' => $data['last_name'],
                ':email' => $email,
                ':phone' => $phone,
                ':program_id' => $data['program_id'] ?? null,
                ':year_graduated' => $data['year_graduated'] ?? null,
                ':address' => $address,
            ]);

            // Update employment
            $empStmt = $db->prepare("
                UPDATE employment SET 
                    company_name = :company, job_title = :job_title, industry = :industry,
                    employment_status = :status, is_aligned = :aligned, date_hired = :date_hired,
                    monthly_salary = :salary, time_to_employment = :time
                WHERE graduate_id = :graduate_id
            ");
            $empStmt->execute([
                ':graduate_id' => $data['id'],
                ':company' => $data['company_name'] ?? null,
                ':job_title' => $data['job_title'] ?? null,
                ':industry' => $data['industry'] ?? null,
                ':status' => $data['employment_status'] ?? 'unemployed',
                ':aligned' => $data['is_aligned'] ?? 'not_aligned',
                ':date_hired' => $data['date_hired'] ?? null,
                ':salary' => $data['monthly_salary'] ?? null,
                ':time' => $data['time_to_employment'] ?? 0,
            ]);

            echo json_encode(["success" => true, "message" => "Graduate updated successfully"]);
            break;

        case 'DELETE':
            $data = json_decode(file_get_contents("php://input"), true);
            if (!isset($data['id'])) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "ID is required"]);
                break;
            }
            $stmt = $db->prepare("DELETE FROM graduates WHERE id = :id");
            $stmt->execute([':id' => $data['id']]);
            echo json_encode(["success" => true, "message" => "Graduate deleted successfully"]);
            break;

        default:
            http_response_code(405);
            echo json_encode(["success" => false, "error" => "Method not allowed"]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
