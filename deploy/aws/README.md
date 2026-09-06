# GradTrack single-EC2 production runbook

This package targets the requested low-cost topology without adding an ALB, NAT Gateway, CloudFront, ElastiCache, WAF, or a managed container platform:

`Route 53 -> EC2/Nginx -> React static files + PHP-FPM + loopback Socket.IO -> existing RDS and private S3`

The repository scripts do not create, change, or delete AWS resources. Complete the AWS console/IAM/DNS actions below manually.

## 1. Manual AWS and secret actions

1. Rotate every credential that has ever appeared in a local `.env`, terminal transcript, archive, or shared message: database password, SMTP/app password, Groq key, and any AWS access keys. Disable and delete the old AWS access keys after confirming the EC2 role works.
2. Attach an EC2 instance profile with least-privilege access to the configured bucket. At minimum the application needs `s3:ListBucket` on the bucket and `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` on the application prefixes. Add `kms:Encrypt`, `kms:Decrypt`, `kms:GenerateDataKey`, and `kms:DescribeKey` only when `S3_KMS_KEY_ID` is used.
3. Keep the bucket private, enable Block Public Access, default encryption, and versioning. Apply lifecycle rules only after retention requirements are agreed.
4. Assign/retain an Elastic IP for the EC2 instance and create the Route 53 `A` record for the production hostname.
5. Limit the EC2 security group to inbound 80/443 from the internet and SSH only from an administrator IP (or use SSM and close SSH). Allow RDS 3306 only from the EC2 security group. Do not expose port 3001.
6. Take an RDS snapshot and an application-aware database backup before the first migration.
7. Download the current AWS RDS CA bundle to `/etc/ssl/certs/global-bundle.pem`, owned by root and world-readable. `DB_SSL_CA` must reference it.

ACM now supports newly requested exportable public certificates, but older and non-exportable ACM certificates still cannot provide Nginx with a private key. This no-ALB runbook uses Certbot as the simplest automated option. Alternatively, request a new ACM certificate with export enabled, protect the exported private key, install it in Nginx, and automate renewed-certificate deployment. See https://docs.aws.amazon.com/acm/latest/userguide/acm-exportable-certificates.html.

## 2. Database accounts and grants

Use two RDS users. The runtime user should have only normal application DML:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON gradtrack.* TO 'gradtrack_runtime'@'%';
```

The deployment-only migration user needs temporary schema permissions:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
ON gradtrack.* TO 'gradtrack_migrator'@'%';
```

Store runtime credentials in `/etc/gradtrack/gradtrack.env` and only the two migration overrides in `/etc/gradtrack/migration.env`. Remove or lock the migration account when the deployment window closes.

## 3. First EC2 deployment

The commands below assume Ubuntu 24.04 and that the repository URL and hostname placeholders are replaced.

```bash
sudo install -d -o root -g www-data -m 0750 /var/www/gradtrack /etc/gradtrack
sudo git clone YOUR_REPOSITORY_URL /var/www/gradtrack
sudo cp /var/www/gradtrack/deploy/aws/env/gradtrack.env.example /etc/gradtrack/gradtrack.env
sudo cp /var/www/gradtrack/deploy/aws/env/frontend.env.example /etc/gradtrack/frontend.env
sudo cp /var/www/gradtrack/deploy/aws/env/migration.env.example /etc/gradtrack/migration.env
sudo chown root:www-data /etc/gradtrack/gradtrack.env
sudo chmod 0640 /etc/gradtrack/gradtrack.env
sudo chmod 0600 /etc/gradtrack/frontend.env /etc/gradtrack/migration.env
sudo curl --fail --silent --show-error https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem --output /etc/ssl/certs/global-bundle.pem
sudo chmod 0644 /etc/ssl/certs/global-bundle.pem
sudo editor /etc/gradtrack/gradtrack.env
sudo editor /etc/gradtrack/frontend.env
sudo editor /etc/gradtrack/migration.env
cd /var/www/gradtrack
sudo GRADTRACK_DOMAIN=grad-track.app bash backend/deploy-ec2.sh
sudo certbot --nginx -d grad-track.app --redirect
sudo certbot renew --dry-run
sudo nginx -t && sudo systemctl reload nginx
sudo /var/www/gradtrack/deploy/aws/scripts/verify-production.sh
```

The setup script installs PHP 8.3 and Node.js 22 (Vite 8 requires Node 20.19+ or 22.12+), installs locked dependencies, builds `frontend/dist`, applies the ledger-backed database migration with the restricted migration user, hashes legacy administrator passwords, installs services, and runs read-only verification before reporting success.

Before enabling real scheduled mail, run the existing reminder path in dry-run mode:

```bash
sudo -u www-data /usr/bin/php /var/www/gradtrack/backend/api/surveys/auto-reminders.php --dry-run=true
sudo systemctl start gradtrack-reminders.timer
systemctl list-timers gradtrack-reminders.timer
```

## 4. Legacy upload migration (separate approved change)

Do not combine this with the first code/database deployment. Retain every local file until verification and the rollback window are complete.

```bash
cd /var/www/gradtrack
sudo -u www-data php backend/scripts/migrate_legacy_uploads_to_s3.php --manifest=/var/lib/gradtrack/upload-dry-run.json
# Review the manifest and orphan list. Then, during an approved window:
sudo -u www-data php backend/scripts/migrate_legacy_uploads_to_s3.php --apply --production-approved --manifest=/var/lib/gradtrack/upload-applied.json
sudo -u www-data php backend/scripts/migrate_legacy_uploads_to_s3.php --verify=/var/lib/gradtrack/upload-applied.json
```

No mode deletes local files. Roll back only database references with `--rollback=MANIFEST`; S3 objects and local files remain intact.

## 5. Subsequent deployments

```bash
sudo /var/www/gradtrack/deploy/aws/scripts/deploy-update.sh
```

The update script creates the Nginx maintenance marker, performs a fast-forward-only pull, installs locked dependencies, builds the frontend, applies migrations and password upgrades, resets safe permissions, restarts services, verifies production, and removes the marker only after all steps succeed. A failed update deliberately leaves maintenance mode enabled for investigation or code rollback.

## 6. Operations and rollback

```bash
systemctl status gradtrack-realtime.service gradtrack-reminders.timer php8.3-fpm nginx
journalctl -u gradtrack-realtime.service -u gradtrack-reminders.service --since today
sudo nginx -t
curl -fsS https://grad-track.app/healthz
```

For a code rollback, keep the database forward-compatible, check out the previously approved commit, rebuild with `/etc/gradtrack/frontend.env`, and restart PHP-FPM/realtime. Do not reverse schema changes or delete S3/local objects without a separately reviewed rollback plan.
