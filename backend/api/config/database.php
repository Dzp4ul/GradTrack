<?php
require_once __DIR__ . '/env.php';

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
        gradtrack_load_env_file();

        $this->app_timezone = gradtrack_env('APP_TIMEZONE', 'Asia/Manila');
        $this->db_timezone = gradtrack_env('DB_TIMEZONE', '+08:00');

        if (@date_default_timezone_set($this->app_timezone) === false) {
            date_default_timezone_set('Asia/Manila');
            $this->app_timezone = 'Asia/Manila';
        }
        
        $this->host = $this->envFirst(['DB_HOST']);
        $this->db_name = $this->envFirst(['DB_NAME', 'DB_DATABASE']);
        $this->username = $this->envFirst(['DB_USER', 'DB_USERNAME']);
        $this->password = $this->envFirst(['DB_PASSWORD']);
        $this->port = $this->envFirst(['DB_PORT'], '3306');
    }

    public function getConnection() {
        $this->conn = null;
        try {
            $host = $this->normalizeHost($this->host);
            $port = $this->normalizePort($this->port);
            $dbName = $this->requiredConfig($this->db_name, 'DB_NAME/DB_DATABASE');
            $username = $this->requiredConfig($this->username, 'DB_USER/DB_USERNAME');
            $password = $this->requiredConfig($this->password, 'DB_PASSWORD');

            $dsn = "mysql:host={$host};port={$port};dbname={$dbName};charset=utf8mb4";

            $this->conn = $this->connectWithRetry($dsn, $username, $password);
            $this->conn->exec("SET NAMES utf8mb4");
            $this->setConnectionTimezone();
        } catch(Throwable $exception) {
            error_log('GradTrack database connection failed: ' . $exception->getMessage());
            if (!headers_sent()) {
                http_response_code(500);
                header('Content-Type: application/json; charset=UTF-8');
            }
            echo json_encode(["error" => "Unable to connect to the server. Please try again later."]);
            exit;
        }
        return $this->conn;
    }

    private function connectWithRetry(string $dsn, string $username, string $password): PDO {
        $options = array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        );
        $maxAttempts = 4;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                return new PDO($dsn, $username, $password, $options);
            } catch (PDOException $exception) {
                if ($attempt >= $maxAttempts || !$this->isTransientConnectionError($exception)) {
                    throw $exception;
                }

                usleep(250000 * $attempt);
            }
        }

        throw new RuntimeException('Database connection retry failed unexpectedly.');
    }

    private function isTransientConnectionError(PDOException $exception): bool {
        $message = strtolower($exception->getMessage());
        $code = (string) $exception->getCode();

        return $code === '2002'
            || strpos($message, 'getaddrinfo failed') !== false
            || strpos($message, 'no such host') !== false
            || strpos($message, 'timed out') !== false
            || strpos($message, 'failed to respond') !== false;
    }

    private function envFirst(array $keys, string $default = ''): string {
        foreach ($keys as $key) {
            $value = gradtrack_env($key);
            if ($value !== null && trim((string) $value) !== '') {
                return (string) $value;
            }
        }

        return $default;
    }

    private function requiredConfig(string $value, string $label): string {
        $value = trim($value);
        if ($value === '') {
            throw new RuntimeException($label . ' is not configured.');
        }
        return $value;
    }

    private function normalizeHost(string $host): string {
        $host = $this->requiredConfig($host, 'DB_HOST');
        $host = trim($host, " \t\n\r\0\x0B\"'");

        if (preg_match('/^https?:\/\//i', $host) === 1) {
            throw new RuntimeException('DB_HOST must be a hostname only; remove http:// or https://.');
        }

        if (preg_match('/:\d+$/', $host) === 1) {
            throw new RuntimeException('DB_HOST must not include a port; use DB_PORT separately.');
        }

        if (preg_match('/\s/', $host) === 1 || strpos($host, '/') !== false) {
            throw new RuntimeException('DB_HOST contains invalid hostname characters.');
        }

        return $host;
    }

    private function normalizePort(string $port): int {
        $port = trim($port, " \t\n\r\0\x0B\"'");
        if ($port === '' || preg_match('/^\d+$/', $port) !== 1) {
            throw new RuntimeException('DB_PORT must be a numeric TCP port.');
        }

        $portNumber = (int) $port;
        if ($portNumber < 1 || $portNumber > 65535) {
            throw new RuntimeException('DB_PORT is outside the valid TCP port range.');
        }

        return $portNumber;
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
