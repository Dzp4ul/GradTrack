<?php
require_once __DIR__ . '/../api/config/password_policy.php';
require_once __DIR__ . '/../api/config/login_throttle.php';
require_once __DIR__ . '/../api/config/csrf.php';

function security_assert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

security_assert(gradtrack_admin_password_error('Short1!') !== null, 'Short admin password was accepted');
security_assert(gradtrack_admin_password_error('LongEnough12!A') === null, 'Strong admin password was rejected');

$hash = password_hash('LongEnough12!A', PASSWORD_DEFAULT);
security_assert(gradtrack_verify_admin_password('LongEnough12!A', $hash), 'Password hash verification failed');

putenv('APP_ENV=production');
putenv('ALLOW_LEGACY_PLAINTEXT_PASSWORDS=true');
security_assert(!gradtrack_verify_admin_password('legacy-pass', 'legacy-pass'), 'Production accepted a plaintext password');
security_assert(!gradtrack_runtime_schema_changes_allowed(), 'Production allowed request-time schema changes');
security_assert(
    gradtrack_public_exception_message(new RuntimeException('sensitive detail'), 'Safe production error') === 'Safe production error',
    'Production exception details were exposed'
);

putenv('FRONTEND_URL=https://example.com');
$placeholderFrontendRejected = false;
try {
    gradtrack_frontend_url();
} catch (RuntimeException $error) {
    $placeholderFrontendRejected = true;
}
security_assert($placeholderFrontendRejected, 'Production accepted a placeholder frontend URL');
putenv('FRONTEND_URL=https://gradtrack.production.invalid');
security_assert(gradtrack_frontend_url() === 'https://gradtrack.production.invalid', 'Valid HTTPS frontend origin was rejected');

require_once __DIR__ . '/../api/config/database.php';
putenv('DB_SSL_CA=');
$missingDatabaseCaRejected = false;
try {
    gradtrack_database_pdo_options();
} catch (RuntimeException $error) {
    $missingDatabaseCaRejected = true;
}
security_assert($missingDatabaseCaRejected, 'Production allowed a database connection without a CA bundle');

require_once __DIR__ . '/../api/config/storage.php';
putenv('STORAGE_DRIVER=s3');
putenv('AWS_REGION=ap-southeast-1');
putenv('S3_BUCKET=gradtrack-production-assets');
putenv('AWS_ACCESS_KEY_ID=TESTSTATICACCESSKEY');
putenv('AWS_SECRET_ACCESS_KEY=test-static-secret-key');
$staticStorageCredentialsRejected = false;
try {
    gradtrack_storage_config();
} catch (RuntimeException $error) {
    $staticStorageCredentialsRejected = true;
}
security_assert($staticStorageCredentialsRejected, 'Production accepted static S3 credentials');
putenv('AWS_ACCESS_KEY_ID=');
putenv('AWS_SECRET_ACCESS_KEY=');

$cookieOptions = gradtrack_session_cookie_options();
security_assert($cookieOptions['secure'] === true, 'Production session cookie is not Secure');
security_assert($cookieOptions['httponly'] === true, 'Production session cookie is not HttpOnly');
security_assert($cookieOptions['samesite'] === 'Lax', 'Production session cookie is not SameSite=Lax');
security_assert($cookieOptions['domain'] === '', 'Production session cookie is not host-only');

security_assert(gradtrack_csrf_token_matches('known-token', 'known-token'), 'Matching CSRF tokens were rejected');
security_assert(!gradtrack_csrf_token_matches('known-token', 'wrong-token'), 'Mismatched CSRF tokens were accepted');
security_assert(!gradtrack_csrf_token_matches('', ''), 'Empty CSRF tokens were accepted');

$testDirectory = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
    . DIRECTORY_SEPARATOR . 'gradtrack-security-test-' . bin2hex(random_bytes(6));
putenv('LOGIN_THROTTLE_DIR=' . $testDirectory);
$_SERVER['REMOTE_ADDR'] = '192.0.2.15';
$identifier = 'security-test@example.invalid';
for ($attempt = 0; $attempt < 5; $attempt++) {
    gradtrack_login_throttle_record_failure($identifier);
}
$throttle = gradtrack_login_throttle_check($identifier);
security_assert($throttle['allowed'] === false, 'Account throttle did not activate');
security_assert((int) $throttle['retry_after'] > 0, 'Account throttle omitted retry duration');
gradtrack_login_throttle_clear_success($identifier);
security_assert(gradtrack_login_throttle_check($identifier)['allowed'] === true, 'Successful login did not clear account throttle');

foreach (glob($testDirectory . DIRECTORY_SEPARATOR . '*.json') ?: [] as $testFile) unlink($testFile);
rmdir($testDirectory);

echo "Security helper tests passed.\n";
