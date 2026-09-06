#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="/var/www/gradtrack"
DOMAIN="${GRADTRACK_DOMAIN:-}"

[[ "$EUID" -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
[[ "$(pwd -P)" == "$APP_ROOT" ]] || { echo "Run this script from $APP_ROOT." >&2; exit 1; }
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Set GRADTRACK_DOMAIN to the Route 53 hostname." >&2; exit 1; }
[[ -r /etc/gradtrack/gradtrack.env && -r /etc/gradtrack/frontend.env && -r /etc/gradtrack/migration.env ]] || {
    echo "Create the protected runtime, frontend, and migration environment files under /etc/gradtrack first." >&2
    exit 1
}
if [[ -e backend/.env && ! -L backend/.env ]]; then
    echo "Refusing to replace backend/.env; move it into /etc/gradtrack securely first." >&2
    exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg unzip nginx php8.3-fpm php8.3-cli php8.3-mysql php8.3-curl php8.3-mbstring php8.3-xml php8.3-zip composer certbot python3-certbot-nginx

# Ubuntu 24.04 does not ship the legacy awscli Debian package. Install the
# supported AWS CLI v2 bundle so IAM-role and S3 verification work reliably.
AWSCLI_INSTALL_DIR="$(mktemp -d)"
curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o "$AWSCLI_INSTALL_DIR/awscliv2.zip"
unzip -q "$AWSCLI_INSTALL_DIR/awscliv2.zip" -d "$AWSCLI_INSTALL_DIR"
"$AWSCLI_INSTALL_DIR/aws/install" --update
rm -rf -- "$AWSCLI_INSTALL_DIR"

if ! id -u gradtrack >/dev/null 2>&1; then
    useradd --system --gid www-data --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin gradtrack
fi

# Vite 8 requires Node 20.19+ or 22.12+. Pin this host to the maintained Node 22
# repository instead of Ubuntu 24.04's older default Node package.
install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
chmod 0644 /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 12)) process.exit(1)"

ln -sfn /etc/gradtrack/gradtrack.env backend/.env
chown root:www-data /etc/gradtrack/gradtrack.env
chmod 0640 /etc/gradtrack/gradtrack.env
install -d -o www-data -g www-data -m 0750 /var/lib/gradtrack /var/lib/gradtrack/login-throttle /var/lib/gradtrack/psgc-cache
install -m 0644 deploy/aws/php/99-gradtrack.ini /etc/php/8.3/fpm/conf.d/99-gradtrack.ini
install -m 0644 deploy/aws/php/99-gradtrack.ini /etc/php/8.3/cli/conf.d/99-gradtrack.ini
sed "s/__SERVER_NAME__/$DOMAIN/g" deploy/aws/nginx/gradtrack.conf > /etc/nginx/sites-available/gradtrack
ln -sfn /etc/nginx/sites-available/gradtrack /etc/nginx/sites-enabled/gradtrack
rm -f /etc/nginx/sites-enabled/default
install -m 0644 deploy/aws/systemd/gradtrack-realtime.service /etc/systemd/system/gradtrack-realtime.service
install -m 0644 deploy/aws/systemd/gradtrack-reminders.service /etc/systemd/system/gradtrack-reminders.service
install -m 0644 deploy/aws/systemd/gradtrack-reminders.timer /etc/systemd/system/gradtrack-reminders.timer

composer install --working-dir=backend --no-dev --no-interaction --prefer-dist --optimize-autoloader
npm ci --omit=dev --no-audit
npm --prefix frontend ci --no-audit
set -a
# shellcheck disable=SC1091
source /etc/gradtrack/frontend.env
set +a
npm --prefix frontend run typecheck
npm --prefix frontend run build

(
    set -a
    # shellcheck disable=SC1091
    source /etc/gradtrack/gradtrack.env
    # shellcheck disable=SC1091
    source /etc/gradtrack/migration.env
    set +a
    php backend/scripts/migrate_database.php --apply --production-approved
    php backend/scripts/hash_legacy_admin_passwords.php --apply
)

chown -R root:www-data "$APP_ROOT"
find "$APP_ROOT" -type d -exec chmod 0750 {} +
find "$APP_ROOT" -type f -exec chmod 0640 {} +
chmod 0750 deploy/aws/scripts/*.sh backend/deploy-ec2.sh

systemctl daemon-reload
systemctl enable --now php8.3-fpm nginx gradtrack-realtime.service
systemctl enable gradtrack-reminders.timer
nginx -t
deploy/aws/scripts/verify-production.sh

echo "Software setup, migrations, and verification complete. Obtain TLS, run a reminder dry run, then start gradtrack-reminders.timer."
