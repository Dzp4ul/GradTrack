#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${GRADTRACK_APP_ROOT:-/var/www/gradtrack}"
BACKEND_ENV="${GRADTRACK_BACKEND_ENV:-/etc/gradtrack/gradtrack.env}"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }
require_command() { command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"; }

[[ -d "$APP_ROOT" ]] || fail "application root does not exist: $APP_ROOT"
[[ -r "$BACKEND_ENV" ]] || fail "backend environment file is not readable: $BACKEND_ENV"
set -a
# shellcheck disable=SC1090
source "$BACKEND_ENV"
set +a

[[ "${APP_ENV:-}" == "production" || "${APP_ENV:-}" == "prod" ]] || fail "APP_ENV must be production"
for variable in DB_HOST DB_NAME DB_USER DB_PASSWORD DB_SSL_CA STORAGE_DRIVER AWS_REGION S3_BUCKET FRONTEND_URL CORS_ALLOWED_ORIGINS GRADTRACK_API_BASE_URL REALTIME_HOST MAIL_HOST MAIL_PORT MAIL_USERNAME MAIL_PASSWORD MAIL_FROM_ADDRESS GROQ_API_KEY; do
    [[ -n "${!variable:-}" ]] || fail "$variable is required"
    [[ "${!variable}" != *"replace-with"* && "${!variable}" != *"change-me"* && "${!variable}" != *"your-domain"* ]] || fail "$variable still contains a placeholder"
done
[[ "$STORAGE_DRIVER" == "s3" ]] || fail "STORAGE_DRIVER must be s3"
[[ "${APP_DEBUG:-false}" != "true" ]] || fail "APP_DEBUG must be false"
[[ "${SCHEMA_AUTO_MIGRATE:-false}" != "true" ]] || fail "SCHEMA_AUTO_MIGRATE must be false"
[[ "${CHAT_AUTO_MIGRATE:-false}" != "true" ]] || fail "CHAT_AUTO_MIGRATE must be false"
[[ "${REALTIME_AUTO_MIGRATE:-false}" != "true" ]] || fail "REALTIME_AUTO_MIGRATE must be false"
[[ -z "${AWS_ACCESS_KEY_ID:-}" && -z "${AWS_SECRET_ACCESS_KEY:-}" && -z "${AWS_PROFILE:-}" ]] || fail "production must use the EC2 IAM role, not static AWS credentials or a profile"
[[ "${AWS_EC2_METADATA_DISABLED:-false}" != "true" ]] || fail "EC2 metadata cannot be disabled for IAM-role credentials"
[[ "$REALTIME_HOST" == "127.0.0.1" || "$REALTIME_HOST" == "::1" ]] || fail "REALTIME_HOST must be loopback-only"
[[ "$FRONTEND_URL" == https://* ]] || fail "FRONTEND_URL must use HTTPS"
[[ "$CORS_ALLOWED_ORIGINS" != *"*"* ]] || fail "wildcard CORS is forbidden"
[[ -r "$DB_SSL_CA" ]] || fail "DB_SSL_CA is not readable"
pass "production environment policy"

for command_name in php node aws nginx systemctl; do require_command "$command_name"; done
[[ "$(systemctl show -p User --value gradtrack-realtime.service)" == "gradtrack" ]] || fail "realtime service must run as the dedicated gradtrack user"
pass "restricted realtime service account"
php "$APP_ROOT/backend/scripts/verify_schema.php" >/dev/null 2>&1 || fail "database schema verification failed"
php "$APP_ROOT/backend/scripts/hash_legacy_admin_passwords.php" --verify >/dev/null 2>&1 || fail "administrator password hash verification failed"
pass "database schema and password hashes"

aws sts get-caller-identity --no-cli-pager --output text --query Account >/dev/null 2>&1 || fail "EC2 IAM credentials are unavailable"
aws s3api head-bucket --bucket "$S3_BUCKET" --no-cli-pager >/dev/null 2>&1 || fail "configured S3 bucket is unavailable to the EC2 role"
pass "EC2 IAM credentials and S3 bucket access"

[[ -f "$APP_ROOT/frontend/dist/index.html" ]] || fail "frontend/dist/index.html is missing"
if grep -RIEq 'http://localhost/GradTrack|http://localhost:3001|http://127\.0\.0\.1/GradTrack|https://your-(backend|frontend|realtime)|https://[^/[:space:]]*example\.com' "$APP_ROOT/frontend/dist"; then
    fail "production frontend bundle contains a local or placeholder service URL"
fi
pass "production frontend assets"

debug_guard_output="$(php "$APP_ROOT/backend/api/debug.php" 2>/dev/null)"
[[ "$debug_guard_output" == *'"error":"Not found"'* ]] || fail "application debug endpoint guard is inactive"
nginx_configuration="$(nginx -T 2>&1)" || fail "Nginx configuration is invalid"
[[ "$nginx_configuration" == *"diagnose-survey"* && "$nginx_configuration" == *"/backend/scripts/"* ]] || fail "Nginx diagnostic/script deny rules are missing"
pass "production diagnostic endpoints are denied"

node --check "$APP_ROOT/backend/realtime/socket-server.js" >/dev/null 2>&1 || fail "realtime JavaScript syntax check failed"
if ! find "$APP_ROOT/backend/api" -type f -name '*.php' -print0 | xargs -0 -n1 php -l >/dev/null 2>&1; then
    fail "PHP API syntax check failed"
fi
pass "PHP, realtime, and Nginx syntax"
pass "production verification complete; no emails or write diagnostics were sent"
