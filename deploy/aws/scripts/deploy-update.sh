#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${GRADTRACK_APP_ROOT:-/var/www/gradtrack}"
BACKEND_ENV="${GRADTRACK_BACKEND_ENV:-/etc/gradtrack/gradtrack.env}"
FRONTEND_ENV="${GRADTRACK_FRONTEND_ENV:-/etc/gradtrack/frontend.env}"
MIGRATION_ENV="${GRADTRACK_MIGRATION_ENV:-/etc/gradtrack/migration.env}"

[[ "$EUID" -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
[[ -d "$APP_ROOT/.git" ]] || { echo "Expected a Git checkout at $APP_ROOT." >&2; exit 1; }
[[ -r "$BACKEND_ENV" && -r "$FRONTEND_ENV" ]] || { echo "Missing protected environment files under /etc/gradtrack." >&2; exit 1; }

touch "$APP_ROOT/.maintenance"
deployment_succeeded=false
cleanup() {
    if [[ "$deployment_succeeded" == "true" ]]; then
        rm -f "$APP_ROOT/.maintenance"
    else
        echo "Deployment failed; maintenance mode remains enabled at $APP_ROOT/.maintenance." >&2
    fi
}
trap cleanup EXIT

git -C "$APP_ROOT" pull --ff-only
composer install --working-dir="$APP_ROOT/backend" --no-dev --no-interaction --prefer-dist --optimize-autoloader
npm --prefix "$APP_ROOT" ci --omit=dev --no-audit
npm --prefix "$APP_ROOT/frontend" ci --no-audit

set -a
# shellcheck disable=SC1090
source "$FRONTEND_ENV"
set +a
npm --prefix "$APP_ROOT/frontend" run typecheck
npm --prefix "$APP_ROOT/frontend" run build

if [[ -r "$MIGRATION_ENV" ]]; then
    (
        set -a
        # shellcheck disable=SC1090
        source "$BACKEND_ENV"
        # shellcheck disable=SC1090
        source "$MIGRATION_ENV"
        set +a
        php "$APP_ROOT/backend/scripts/migrate_database.php" --apply --production-approved
        php "$APP_ROOT/backend/scripts/hash_legacy_admin_passwords.php" --apply
    )
else
    echo "Missing $MIGRATION_ENV (restricted migration DB credentials)." >&2
    exit 1
fi

chown -R root:www-data "$APP_ROOT"
find "$APP_ROOT" -type d -exec chmod 0750 {} +
find "$APP_ROOT" -type f -exec chmod 0640 {} +
chmod 0750 "$APP_ROOT/deploy/aws/scripts/verify-production.sh" "$APP_ROOT/deploy/aws/scripts/deploy-update.sh"

systemctl restart php8.3-fpm gradtrack-realtime.service
systemctl reload nginx
GRADTRACK_APP_ROOT="$APP_ROOT" GRADTRACK_BACKEND_ENV="$BACKEND_ENV" "$APP_ROOT/deploy/aws/scripts/verify-production.sh"
deployment_succeeded=true
echo "GradTrack update completed successfully."
