<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/audit_trail.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function gradtrack_announcements_require_admin_writer(): array
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(["success" => false, "error" => "Authentication required"]);
        exit;
    }

    if (!gradtrack_audit_role_is_allowed($_SESSION['role'] ?? '')) {
        http_response_code(403);
        echo json_encode(["success" => false, "error" => "Unauthorized announcement management"]);
        exit;
    }

    return gradtrack_audit_current_admin_context();
}

try {
    switch ($method) {
        case 'GET':
            if (isset($_GET['id'])) {
                $stmt = $db->prepare("SELECT * FROM announcements WHERE id = :id");
                $stmt->bindParam(':id', $_GET['id']);
                $stmt->execute();
                $announcement = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($announcement) {
                    echo json_encode(["success" => true, "data" => $announcement]);
                } else {
                    http_response_code(404);
                    echo json_encode(["success" => false, "error" => "Announcement not found"]);
                }
            } else {
                $status = isset($_GET['status']) ? $_GET['status'] : null;
                $sql = "SELECT * FROM announcements";
                $params = [];

                if ($status) {
                    $sql .= " WHERE status = :status";
                    $params[':status'] = $status;
                }
                $sql .= " ORDER BY created_at DESC";

                $stmt = $db->prepare($sql);
                $stmt->execute($params);
                $announcements = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(["success" => true, "data" => $announcements]);
            }
            break;

        case 'POST':
            $auditUser = gradtrack_announcements_require_admin_writer();
            $data = json_decode(file_get_contents("php://input"), true);

            $publishedAt = null;
            if (($data['status'] ?? 'draft') === 'published') {
                $publishedAt = date('Y-m-d H:i:s');
            }

            $stmt = $db->prepare("
                INSERT INTO announcements (title, content, category, status, published_at)
                VALUES (:title, :content, :category, :status, :published_at)
            ");
            $stmt->execute([
                ':title' => $data['title'],
                ':content' => $data['content'],
                ':category' => $data['category'] ?? 'general',
                ':status' => $data['status'] ?? 'draft',
                ':published_at' => $publishedAt
            ]);
            $announcementId = (int) $db->lastInsertId();

            logAuditTrail(
                $auditUser['user_id'],
                $auditUser['user_name'],
                $auditUser['user_role'],
                $auditUser['department'],
                'Create',
                'Announcements',
                "Created announcement with record ID {$announcementId}.",
                $announcementId,
                null,
                [
                    'category' => $data['category'] ?? 'general',
                    'status' => $data['status'] ?? 'draft',
                ]
            );

            echo json_encode(["success" => true, "message" => "Announcement created", "id" => $announcementId]);
            break;

        case 'PUT':
            $auditUser = gradtrack_announcements_require_admin_writer();
            $data = json_decode(file_get_contents("php://input"), true);
            if (!isset($data['id'])) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "ID is required"]);
                break;
            }

            $publishedAt = $data['published_at'] ?? null;
            if (($data['status'] ?? '') === 'published' && !$publishedAt) {
                $publishedAt = date('Y-m-d H:i:s');
            }

            $stmt = $db->prepare("
                UPDATE announcements SET 
                    title = :title, content = :content, category = :category,
                    status = :status, published_at = :published_at
                WHERE id = :id
            ");
            $stmt->execute([
                ':id' => $data['id'],
                ':title' => $data['title'],
                ':content' => $data['content'],
                ':category' => $data['category'] ?? 'general',
                ':status' => $data['status'] ?? 'draft',
                ':published_at' => $publishedAt
            ]);

            logAuditTrail(
                $auditUser['user_id'],
                $auditUser['user_name'],
                $auditUser['user_role'],
                $auditUser['department'],
                'Update',
                'Announcements',
                "Updated announcement with record ID {$data['id']}.",
                $data['id'],
                null,
                [
                    'category' => $data['category'] ?? 'general',
                    'status' => $data['status'] ?? 'draft',
                ]
            );

            echo json_encode(["success" => true, "message" => "Announcement updated"]);
            break;

        case 'DELETE':
            $auditUser = gradtrack_announcements_require_admin_writer();
            $data = json_decode(file_get_contents("php://input"), true);
            if (!isset($data['id'])) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "ID is required"]);
                break;
            }
            $stmt = $db->prepare("DELETE FROM announcements WHERE id = :id");
            $stmt->execute([':id' => $data['id']]);
            logAuditTrail(
                $auditUser['user_id'],
                $auditUser['user_name'],
                $auditUser['user_role'],
                $auditUser['department'],
                'Delete',
                'Announcements',
                "Deleted announcement with record ID {$data['id']}.",
                $data['id']
            );
            echo json_encode(["success" => true, "message" => "Announcement deleted"]);
            break;

        default:
            http_response_code(405);
            echo json_encode(["success" => false, "error" => "Method not allowed"]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
