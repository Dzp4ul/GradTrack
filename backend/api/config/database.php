<?php
class Database {
    private $host;
    private $db_name;
    private $username;
    private $password;
    private $port;
    private $app_timezone;
    private $db_timezone;
    public $conn;

    public function __construct() {
        // Load environment variables
        $this->loadEnv();

        $this->app_timezone = getenv('APP_TIMEZONE') ?: 'Asia/Manila';
        $this->db_timezone = getenv('DB_TIMEZONE') ?: '+08:00';

        if (@date_default_timezone_set($this->app_timezone) === false) {
            date_default_timezone_set('Asia/Manila');
            $this->app_timezone = 'Asia/Manila';
        }
        
        $this->host = getenv('DB_HOST') ?: 'localhost';
        $this->db_name = getenv('DB_NAME') ?: 'gradtrackdb';
        $this->username = getenv('DB_USER') ?: 'root';
        $this->password = getenv('DB_PASSWORD') ?: '';
        $this->port = getenv('DB_PORT') ?: 3306;
    }

    private function loadEnv() {
        $envFile = __DIR__ . '/../../.env';
        if (file_exists($envFile)) {
            $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                if (strpos(trim($line), '#') === 0) continue;
                list($key, $value) = explode('=', $line, 2);
                $key = trim($key);
                $value = trim($value);
                if (!getenv($key)) {
                    putenv("$key=$value");
                }
            }
        }
    }

    public function getConnection() {
        $this->conn = null;
        try {
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
            $this->setConnectionTimezone();
        } catch(PDOException $exception) {
            http_response_code(500);
            echo json_encode(["error" => "Database connection failed: " . $exception->getMessage()]);
            exit;
        }
        return $this->conn;
    }

    private function setConnectionTimezone() {
        $timezone = $this->db_timezone;
        if (!preg_match('/^[+-](0\d|1[0-4]):[0-5]\d$/', $timezone)) {
            $timezone = '+08:00';
            $this->db_timezone = $timezone;
        }

        $this->conn->exec("SET time_zone = " . $this->conn->quote($timezone));
    }
}
