<?php
class Database {
    private $host = "gradtrackdb.cry06m2ok5u8.ap-southeast-2.rds.amazonaws.com";
    private $db_name = "gradtrackdb";
    private $username = "admin";
    private $password = "Gradtrack301";
    private $port = 3306;
    public $conn;

    public function getConnection() {
        $this->conn = null;
        try {
            // Build PDO DSN with port
            $dsn = "mysql:host=" . $this->host . ";port=" . $this->port . ";dbname=" . $this->db_name;

            $this->conn = new PDO(
                $dsn,
                $this->username,
                $this->password,
                array(
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
                )
            );
            $this->conn->exec("set names utf8");
        } catch(PDOException $exception) {
            http_response_code(500);
            echo json_encode(["error" => "Database connection failed: " . $exception->getMessage()]);
            exit;
        }
        return $this->conn;
    }
}
