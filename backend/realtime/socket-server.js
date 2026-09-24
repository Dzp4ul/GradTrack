const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { Server } = require('socket.io');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true, override: false });

const appEnvironment = String(process.env.APP_ENV || 'development').trim().toLowerCase();
const isProduction = ['prod', 'production'].includes(appEnvironment);

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`${name} is required for the AWS RDS connection`);
  }
  return value;
}

function requiredEnvAny(names, label) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) {
      return value;
    }
  }
  throw new Error(`${label} is required for the AWS RDS connection`);
}

function normalizedDbHost() {
  const host = requiredEnv('DB_HOST').replace(/^["']|["']$/g, '');
  if (/^https?:\/\//i.test(host)) {
    throw new Error('DB_HOST must be a hostname only; remove http:// or https://');
  }
  if (/:\d+$/.test(host)) {
    throw new Error('DB_HOST must not include a port; use DB_PORT separately');
  }
  if (/\s/.test(host) || host.includes('/')) {
    throw new Error('DB_HOST contains invalid hostname characters');
  }
  return host;
}

function normalizedDbPort() {
  const port = Number(process.env.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be a valid TCP port');
  }
  return port;
}

function normalizedDbTimezone() {
  const timezone = String(process.env.DB_TIMEZONE || '+08:00').trim();
  if (!/^[+-](0\d|1[0-4]):[0-5]\d$/.test(timezone)) {
    throw new Error('DB_TIMEZONE must be a UTC offset such as +08:00');
  }
  return timezone;
}

const port = Number(process.env.REALTIME_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('REALTIME_PORT must be a valid TCP port');
}
const realtimeHost = String(process.env.REALTIME_HOST || '127.0.0.1').trim();
if (isProduction && !['127.0.0.1', '::1'].includes(realtimeHost)) {
  throw new Error('REALTIME_HOST must remain loopback-only in production');
}
const configuredApiBaseUrl = String(process.env.GRADTRACK_API_BASE_URL || '').trim();
if (isProduction && !configuredApiBaseUrl) {
  throw new Error('GRADTRACK_API_BASE_URL is required in production');
}
const apiBaseUrl = (configuredApiBaseUrl || 'http://localhost/GradTrack/backend').replace(/\/+$/, '');
const authCheckUrl = process.env.REALTIME_AUTH_CHECK_URL || `${apiBaseUrl}/api/graduate-auth/check.php`;
function requireProductionLoopbackUrl(name, value) {
  if (!isProduction) return;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }
  if (parsed.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error(`${name} must use the loopback HTTP service in production`);
  }
}
requireProductionLoopbackUrl('GRADTRACK_API_BASE_URL', apiBaseUrl);
requireProductionLoopbackUrl('REALTIME_AUTH_CHECK_URL', authCheckUrl);
const dbTimezone = normalizedDbTimezone();
const configuredOrigins = String(process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || '').trim();
if (isProduction && !configuredOrigins) {
  throw new Error('CORS_ALLOWED_ORIGINS or FRONTEND_URL is required in production');
}
const allowedOrigins = (configuredOrigins || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);
if (isProduction) {
  if (allowedOrigins.length === 0) {
    throw new Error('At least one production realtime origin is required');
  }
  for (const origin of allowedOrigins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('Production realtime origins must be valid absolute URLs');
    }
    if (
      parsed.protocol !== 'https:'
      || parsed.origin !== origin
      || parsed.username
      || parsed.password
      || /(?:localhost|127\.0\.0\.1|example|change-me|your-)/i.test(origin)
    ) {
      throw new Error('Production realtime origins must be explicit real HTTPS origins');
    }
  }
}

function databaseTlsOptions() {
  const configuredCa = String(process.env.DB_SSL_CA || '').trim();
  if (!configuredCa) {
    if (isProduction) throw new Error('DB_SSL_CA is required in production');
    return undefined;
  }
  const caPath = path.isAbsolute(configuredCa)
    ? configuredCa
    : path.resolve(__dirname, '..', configuredCa);
  if (!fs.statSync(caPath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error('DB_SSL_CA must point to a readable CA bundle');
  }
  return { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
}

const pool = mysql.createPool({
  host: normalizedDbHost(),
  port: normalizedDbPort(),
  user: requiredEnvAny(['DB_USER', 'DB_USERNAME'], 'DB_USER/DB_USERNAME'),
  password: requiredEnv('DB_PASSWORD'),
  database: requiredEnvAny(['DB_NAME', 'DB_DATABASE'], 'DB_NAME/DB_DATABASE'),
  waitForConnections: true,
  connectionLimit: Number(process.env.REALTIME_DB_CONNECTION_LIMIT || 10),
  charset: 'utf8mb4',
  timezone: dbTimezone,
  ssl: databaseTlsOptions(),
});

// mysql2's `timezone` option controls JavaScript date conversion, but it does
// not change MySQL's session timezone. Queue this as the first statement on
// every pooled connection so NOW(), CURRENT_TIMESTAMP, and returned DATETIMEs
// all use the same configured clock as the PHP API.
pool.on('connection', (connection) => {
  connection.query('SET time_zone = ?', [dbTimezone], (error) => {
    if (error) {
      console.error(`[Realtime] Unable to set database session timezone to ${dbTimezone}:`, error);
    }
  });
});

const onlineSocketsByGraduate = new Map();
const pendingOfflineTimersByGraduate = new Map();
const presenceVersionByGraduate = new Map();
const pendingMembershipChanges = new Map();
const autoMigrate = !isProduction
  && String(process.env.REALTIME_AUTO_MIGRATE || '').toLowerCase() === 'true';
const presenceOfflineGraceMs = Math.max(0, Number(process.env.REALTIME_PRESENCE_OFFLINE_GRACE_MS || 1500));
const presenceRecoveryGraceMs = Math.max(presenceOfflineGraceMs, Number(process.env.REALTIME_PRESENCE_RECOVERY_GRACE_MS || 5000));
const pingInterval = Math.max(5000, Number(process.env.REALTIME_PING_INTERVAL_MS || 25000));
const pingTimeout = Math.max(5000, Number(process.env.REALTIME_PING_TIMEOUT_MS || 20000));
const authTimeoutMs = Math.max(5000, Number(process.env.REALTIME_AUTH_TIMEOUT_MS || 12000));
const sessionCookieName = String(process.env.SESSION_COOKIE_NAME || process.env.PHP_SESSION_COOKIE_NAME || 'GRADTRACKSESSID').trim() || 'GRADTRACKSESSID';
const storageDriver = String(process.env.STORAGE_DRIVER || process.env.APP_STORAGE_DRIVER || 'local').trim().toLowerCase();
const configuredPublishSecret = String(process.env.REALTIME_PUBLISH_SECRET || '').trim();
const realtimePublishSecret = configuredPublishSecret || (isProduction ? '' : 'gradtrack-local-realtime-publish');
if (
  realtimePublishSecret.length < 32
  || (isProduction && /(?:replace-with|change-me|gradtrack-local)/i.test(realtimePublishSecret))
) {
  throw new Error('REALTIME_PUBLISH_SECRET must contain at least 32 characters');
}
const realtimePublishMaxAgeSeconds = Math.max(15, Number(process.env.REALTIME_PUBLISH_MAX_AGE_SECONDS || 60));
const processedMutationEvents = new Map();
const mutationPublicationQueues = new Map();

function mediaAccessReference(reference) {
  const value = String(reference || '').trim();
  if (!value) return null;

  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');
  if (
    storageDriver !== 's3'
    || /^https?:\/\//i.test(value)
    || value.startsWith('/')
    || normalized.startsWith('uploads/')
    || normalized.startsWith('api/media.php?path=')
  ) {
    return value;
  }

  return `api/media.php?path=${encodeURIComponent(normalized)}`;
}

function socketRoom(roomId) {
  return `conversation:${roomId}`;
}

function userRoom(graduateId) {
  return `graduate:${graduateId}`;
}

function presenceRoom(graduateId) {
  return `presence:graduate:${graduateId}`;
}

function graduatePortalRoom() {
  return 'audience:graduate-portal';
}

function communityThreadRoom(postId) {
  return `community:post:${postId}`;
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [table, column],
  );

  return Number(rows[0]?.total || 0) > 0;
}

async function indexExists(table, indexName, columns, requireUnique = false) {
  const [rows] = await pool.query(
    `SELECT INDEX_NAME, NON_UNIQUE,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS indexed_columns
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      GROUP BY INDEX_NAME, NON_UNIQUE`,
    [table],
  );

  const signature = columns.join(',');
  return rows.some((row) => (
    row.INDEX_NAME === indexName
    || (row.indexed_columns === signature && (!requireUnique || Number(row.NON_UNIQUE) === 0))
  ));
}

async function addColumnIfMissing(table, column, sql) {
  if (!(await columnExists(table, column))) {
    await pool.query(sql);
  }
}

async function addIndexIfMissing(table, indexName, columns, requireUnique, sql) {
  if (!(await indexExists(table, indexName, columns, requireUnique))) {
    await pool.query(sql);
  }
}

async function columnIsNullable(table, column) {
  const [rows] = await pool.query(
    `SELECT IS_NULLABLE
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column],
  );
  return String(rows[0]?.IS_NULLABLE || 'NO').toUpperCase() === 'YES';
}

async function enumHasValue(table, column, value) {
  const [rows] = await pool.query(
    `SELECT COLUMN_TYPE
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column],
  );
  return String(rows[0]?.COLUMN_TYPE || '').includes(`'${value}'`);
}

async function ensureSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS forum_chat_rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    created_by INT NOT NULL,
    name VARCHAR(150) NULL,
    is_group TINYINT(1) NOT NULL DEFAULT 0,
    direct_pair_key VARCHAR(50) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_forum_chat_rooms_created_by (created_by),
    INDEX idx_forum_chat_rooms_updated (updated_at),
    CONSTRAINT fk_forum_chat_rooms_created_by FOREIGN KEY (created_by) REFERENCES graduates(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS forum_chat_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    graduate_id INT NOT NULL,
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_forum_chat_member (room_id, graduate_id),
    INDEX idx_forum_chat_members_graduate (graduate_id),
    CONSTRAINT fk_forum_chat_members_room FOREIGN KEY (room_id) REFERENCES forum_chat_rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_forum_chat_members_graduate FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS forum_chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    graduate_id INT NOT NULL,
    message TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_forum_chat_messages_room (room_id, created_at),
    INDEX idx_forum_chat_messages_graduate (graduate_id),
    CONSTRAINT fk_forum_chat_messages_room FOREIGN KEY (room_id) REFERENCES forum_chat_rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_forum_chat_messages_graduate FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await addColumnIfMissing('forum_chat_rooms', 'last_message_at', 'ALTER TABLE forum_chat_rooms ADD last_message_at DATETIME NULL AFTER updated_at');
  await addColumnIfMissing('forum_chat_rooms', 'direct_pair_key', 'ALTER TABLE forum_chat_rooms ADD direct_pair_key VARCHAR(50) NULL AFTER is_group');
  await addColumnIfMissing('forum_chat_rooms', 'group_image_path', 'ALTER TABLE forum_chat_rooms ADD group_image_path VARCHAR(255) NULL AFTER is_group');
  await addColumnIfMissing('forum_chat_rooms', 'group_image_original_name', 'ALTER TABLE forum_chat_rooms ADD group_image_original_name VARCHAR(255) NULL AFTER group_image_path');
  await addColumnIfMissing('forum_chat_rooms', 'group_image_mime_type', 'ALTER TABLE forum_chat_rooms ADD group_image_mime_type VARCHAR(120) NULL AFTER group_image_original_name');
  await addColumnIfMissing('forum_chat_rooms', 'group_image_updated_at', 'ALTER TABLE forum_chat_rooms ADD group_image_updated_at DATETIME NULL AFTER group_image_mime_type');
  await addColumnIfMissing('forum_chat_members', 'last_read_at', 'ALTER TABLE forum_chat_members ADD last_read_at DATETIME NULL AFTER joined_at');
  await addColumnIfMissing('forum_chat_members', 'last_read_message_id', 'ALTER TABLE forum_chat_members ADD last_read_message_id INT NULL AFTER last_read_at');
  await addColumnIfMissing('forum_chat_members', 'hidden_at', 'ALTER TABLE forum_chat_members ADD hidden_at DATETIME NULL AFTER last_read_message_id');
  await addColumnIfMissing('forum_chat_members', 'hidden_before_message_id', 'ALTER TABLE forum_chat_members ADD hidden_before_message_id INT NULL AFTER hidden_at');
  await addColumnIfMissing('forum_chat_members', 'created_at', 'ALTER TABLE forum_chat_members ADD created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER hidden_before_message_id');
  await addColumnIfMissing('forum_chat_members', 'updated_at', 'ALTER TABLE forum_chat_members ADD updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
  await pool.query('ALTER TABLE forum_chat_messages MODIFY message TEXT NULL');
  await addColumnIfMissing('forum_chat_messages', 'message_type', "ALTER TABLE forum_chat_messages ADD message_type ENUM('text', 'image', 'file', 'mixed', 'system') NOT NULL DEFAULT 'text' AFTER message");
  await addColumnIfMissing('forum_chat_messages', 'client_message_id', 'ALTER TABLE forum_chat_messages ADD client_message_id VARCHAR(80) NULL AFTER message_type');
  await addColumnIfMissing('forum_chat_messages', 'delivered_at', 'ALTER TABLE forum_chat_messages ADD delivered_at DATETIME NULL AFTER client_message_id');
  await addColumnIfMissing('forum_chat_messages', 'read_at', 'ALTER TABLE forum_chat_messages ADD read_at DATETIME NULL AFTER delivered_at');
  await addColumnIfMissing('forum_chat_messages', 'updated_at', 'ALTER TABLE forum_chat_messages ADD updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
  await addColumnIfMissing('forum_chat_messages', 'deleted_at', 'ALTER TABLE forum_chat_messages ADD deleted_at DATETIME NULL AFTER updated_at');
  if (!(await enumHasValue('forum_chat_messages', 'message_type', 'system'))) {
    await pool.query("ALTER TABLE forum_chat_messages MODIFY message_type ENUM('text', 'image', 'file', 'mixed', 'system') NOT NULL DEFAULT 'text'");
  }

  await addIndexIfMissing('forum_chat_rooms', 'idx_forum_chat_rooms_last_message', ['last_message_at', 'updated_at', 'id'], false, 'ALTER TABLE forum_chat_rooms ADD INDEX idx_forum_chat_rooms_last_message (last_message_at, updated_at, id)');
  await addIndexIfMissing('forum_chat_rooms', 'uniq_forum_chat_direct_pair', ['direct_pair_key'], true, 'ALTER TABLE forum_chat_rooms ADD UNIQUE KEY uniq_forum_chat_direct_pair (direct_pair_key)');
  await addIndexIfMissing('forum_chat_members', 'idx_forum_chat_members_read', ['room_id', 'graduate_id', 'last_read_at'], false, 'ALTER TABLE forum_chat_members ADD INDEX idx_forum_chat_members_read (room_id, graduate_id, last_read_at)');
  await addIndexIfMissing('forum_chat_members', 'idx_forum_chat_members_read_message', ['room_id', 'graduate_id', 'last_read_message_id'], false, 'ALTER TABLE forum_chat_members ADD INDEX idx_forum_chat_members_read_message (room_id, graduate_id, last_read_message_id)');
  await addIndexIfMissing('forum_chat_members', 'idx_forum_chat_members_visibility', ['graduate_id', 'hidden_at', 'room_id'], false, 'ALTER TABLE forum_chat_members ADD INDEX idx_forum_chat_members_visibility (graduate_id, hidden_at, room_id)');
  await addIndexIfMissing('forum_chat_messages', 'idx_forum_chat_messages_room_id', ['room_id', 'id'], false, 'ALTER TABLE forum_chat_messages ADD INDEX idx_forum_chat_messages_room_id (room_id, id)');
  await addIndexIfMissing('forum_chat_messages', 'idx_forum_chat_messages_sender_created', ['graduate_id', 'created_at'], false, 'ALTER TABLE forum_chat_messages ADD INDEX idx_forum_chat_messages_sender_created (graduate_id, created_at)');
  await addIndexIfMissing('forum_chat_messages', 'idx_forum_chat_messages_created', ['created_at', 'id'], false, 'ALTER TABLE forum_chat_messages ADD INDEX idx_forum_chat_messages_created (created_at, id)');
  await addIndexIfMissing('forum_chat_messages', 'uniq_forum_chat_client_message', ['room_id', 'graduate_id', 'client_message_id'], true, 'ALTER TABLE forum_chat_messages ADD UNIQUE KEY uniq_forum_chat_client_message (room_id, graduate_id, client_message_id)');

  await pool.query(`CREATE TABLE IF NOT EXISTS forum_chat_message_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NULL,
    message_id INT NULL,
    uploaded_by INT NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    storage_path VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_size INT NOT NULL,
    attachment_type ENUM('image', 'file') NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_forum_chat_attachment_path (storage_path),
    INDEX idx_forum_chat_attachment_message (message_id),
    INDEX idx_forum_chat_attachment_room (room_id, created_at),
    INDEX idx_forum_chat_attachment_uploader (uploaded_by),
    CONSTRAINT fk_forum_chat_attachment_room FOREIGN KEY (room_id) REFERENCES forum_chat_rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_forum_chat_attachment_message FOREIGN KEY (message_id) REFERENCES forum_chat_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_forum_chat_attachment_uploader FOREIGN KEY (uploaded_by) REFERENCES graduates(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS graduate_presence (
    graduate_id INT PRIMARY KEY,
    last_active_at DATETIME NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_graduate_presence_graduate FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  if (!(await columnIsNullable('forum_chat_message_attachments', 'room_id'))) {
    await pool.query('ALTER TABLE forum_chat_message_attachments MODIFY room_id INT NULL');
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS forum_chat_blocks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    blocker_id INT NOT NULL,
    blocked_id INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_forum_chat_block (blocker_id, blocked_id),
    INDEX idx_forum_chat_blocks_blocked (blocked_id, blocker_id),
    CONSTRAINT fk_forum_chat_blocks_blocker FOREIGN KEY (blocker_id) REFERENCES graduates(id) ON DELETE CASCADE,
    CONSTRAINT fk_forum_chat_blocks_blocked FOREIGN KEY (blocked_id) REFERENCES graduates(id) ON DELETE CASCADE,
    CONSTRAINT chk_forum_chat_blocks_distinct CHECK (blocker_id <> blocked_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`UPDATE forum_chat_rooms r
    SET r.last_message_at = (
      SELECT MAX(fcm.created_at)
        FROM forum_chat_messages fcm
       WHERE fcm.room_id = r.id
         AND fcm.deleted_at IS NULL
    )
    WHERE r.last_message_at IS NULL`);

  await pool.query(`UPDATE forum_chat_members member
    SET member.last_read_message_id = (
      SELECT MAX(message.id)
        FROM forum_chat_messages message
       WHERE message.room_id = member.room_id
         AND message.deleted_at IS NULL
         AND member.last_read_at IS NOT NULL
         AND message.created_at <= member.last_read_at
    )
    WHERE member.last_read_message_id IS NULL
      AND member.last_read_at IS NOT NULL`);
}

async function verifySchema() {
  await pool.query(`SELECT fcm.id, fcm.room_id, fcm.graduate_id, fcm.client_message_id,
                           fcm.created_at, fcm.deleted_at
                      FROM forum_chat_messages fcm
                      JOIN forum_chat_members members ON members.room_id = fcm.room_id
                     WHERE 1 = 0`);
  await pool.query('SELECT id, room_id, message_id, uploaded_by FROM forum_chat_message_attachments WHERE 1 = 0');
  await pool.query('SELECT room_id, graduate_id, last_read_message_id, hidden_at, hidden_before_message_id FROM forum_chat_members WHERE 1 = 0');
  await pool.query('SELECT graduate_id, last_active_at FROM graduate_presence WHERE 1 = 0');
  await pool.query('SELECT direct_pair_key, group_image_path, group_image_updated_at FROM forum_chat_rooms WHERE 1 = 0');
  await pool.query('SELECT blocker_id, blocked_id FROM forum_chat_blocks WHERE 1 = 0');
  await pool.query('SELECT id, graduate_id, status FROM forum_posts WHERE 1 = 0');
  await pool.query('SELECT id, post_id, graduate_id, status FROM forum_comments WHERE 1 = 0');
  await pool.query('SELECT id, post_id, graduate_id FROM forum_post_likes WHERE 1 = 0');
  await pool.query('SELECT id, status, published_at FROM announcements WHERE 1 = 0');
  await pool.query('SELECT id, posted_by_account_id, created_by_admin_id, is_active, approval_status FROM job_posts WHERE 1 = 0');
  await pool.query('SELECT graduate_account_id, first_name, last_name, updated_at FROM graduate_profiles WHERE 1 = 0');
}

async function verifyDatabaseTimezone() {
  const [timezoneRows] = await pool.query('SELECT @@session.time_zone AS session_timezone');
  if (String(timezoneRows[0]?.session_timezone || '') !== dbTimezone) {
    throw new Error(`Realtime database session timezone is ${timezoneRows[0]?.session_timezone || 'unknown'}; expected ${dbTimezone}`);
  }
}

async function authenticateSocket(socket) {
  const cookie = socket.handshake.headers.cookie || '';
  if (!cookie) {
    throw new Error('Graduate authentication required');
  }

  const response = await fetch(authCheckUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Cookie: cookie,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(authTimeoutMs),
  });
  const data = await response.json();

  if (!response.ok || !data.authenticated || !data.user?.graduate_id) {
    throw new Error('Graduate authentication required');
  }

  return data.user;
}

async function getRoomParticipants(roomId) {
  const [rows] = await pool.query(
    `SELECT graduate_id
       FROM forum_chat_members
      WHERE room_id = ?`,
    [roomId],
  );
  return rows.map((row) => Number(row.graduate_id));
}

async function requireRoomMember(roomId, graduateId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.created_by, r.name, r.is_group
       FROM forum_chat_rooms r
       JOIN forum_chat_members fcm
         ON fcm.room_id = r.id
        AND fcm.graduate_id = ?
      WHERE r.id = ?
      LIMIT 1`,
    [graduateId, roomId],
  );

  if (!rows.length) {
    throw new Error('Chat room not found');
  }

  return rows[0];
}

function onlineSocketCount(graduateId) {
  return onlineSocketsByGraduate.get(Number(graduateId))?.size || 0;
}

function isGraduateOnline(graduateId) {
  return onlineSocketCount(graduateId) > 0;
}

async function assertMessageAllowed(roomId, graduateId) {
  const room = await requireRoomMember(roomId, graduateId);
  if (Number(room.is_group) === 1) return;

  const [participants] = await pool.query(
    'SELECT graduate_id FROM forum_chat_members WHERE room_id = ? ORDER BY id ASC',
    [roomId],
  );
  if (participants.length !== 2) throw new Error('Direct conversation participants are invalid');
  const peer = participants.find((participant) => Number(participant.graduate_id) !== Number(graduateId));
  if (!peer) throw new Error('Direct conversation participants are invalid');

  const [blocks] = await pool.query(
    `SELECT id FROM forum_chat_blocks
      WHERE (blocker_id = ? AND blocked_id = ?)
         OR (blocker_id = ? AND blocked_id = ?)
      LIMIT 1`,
    [graduateId, peer.graduate_id, peer.graduate_id, graduateId],
  );
  if (blocks.length > 0) throw new Error('Messages are unavailable while this conversation is blocked');
}

function cookieValue(cookieHeader, name) {
  const prefix = `${name}=`;
  for (const part of String(cookieHeader || '').split(';')) {
    const cookie = part.trim();
    if (!cookie.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(cookie.slice(prefix.length));
    } catch {
      return cookie.slice(prefix.length);
    }
  }
  return '';
}

function disconnectSessionSockets(sessionId) {
  if (!sessionId) return 0;
  const sockets = Array.from(io.of('/').sockets.values()).filter(
    (connectedSocket) => connectedSocket.data.sessionId === sessionId,
  );

  for (const connectedSocket of sockets) {
    connectedSocket.data.explicitLogout = true;
    connectedSocket.emit('session:revoked', { reason: 'logout' });
    connectedSocket.disconnect(true);
  }

  return sockets.length;
}

function nextPresenceVersion(graduateId) {
  const normalizedGraduateId = Number(graduateId);
  const nextVersion = (presenceVersionByGraduate.get(normalizedGraduateId) || 0) + 1;
  presenceVersionByGraduate.set(normalizedGraduateId, nextVersion);
  return nextVersion;
}

function cancelPendingOffline(graduateId) {
  const normalizedGraduateId = Number(graduateId);
  const timeout = pendingOfflineTimersByGraduate.get(normalizedGraduateId);
  if (!timeout) return false;
  clearTimeout(timeout);
  pendingOfflineTimersByGraduate.delete(normalizedGraduateId);
  return true;
}

async function getMessageAttachments(messageIds) {
  if (!messageIds.length) return new Map();
  const [rows] = await pool.query(
    `SELECT id, room_id, message_id, original_name, stored_name, mime_type, file_size, attachment_type, created_at
       FROM forum_chat_message_attachments
      WHERE message_id IN (?)
      ORDER BY id ASC`,
    [messageIds],
  );

  const grouped = new Map();
  for (const row of rows) {
    const messageId = Number(row.message_id);
    if (!grouped.has(messageId)) grouped.set(messageId, []);
    grouped.get(messageId).push({
      id: Number(row.id),
      room_id: Number(row.room_id),
      message_id: messageId,
      original_name: row.original_name,
      stored_name: row.stored_name,
      mime_type: row.mime_type,
      file_size: Number(row.file_size),
      attachment_type: row.attachment_type,
      created_at: row.created_at,
      url: `api/forum/chat-attachments.php?id=${Number(row.id)}`,
      download_url: `api/forum/chat-attachments.php?id=${Number(row.id)}&download=1`,
    });
  }

  return grouped;
}

async function fetchMessage(messageId) {
  const [rows] = await pool.query(
    `SELECT fcm.id, fcm.room_id, fcm.graduate_id, fcm.message, fcm.message_type, fcm.client_message_id,
            fcm.delivered_at, fcm.read_at, fcm.created_at, fcm.updated_at,
            COALESCE(NULLIF(profile.first_name, ''), g.first_name) AS first_name,
            COALESCE(NULLIF(profile.last_name, ''), g.last_name) AS last_name,
            p.code AS sender_program_code, gpi.file_path AS sender_profile_image_path
       FROM forum_chat_messages fcm
       JOIN graduates g ON g.id = fcm.graduate_id
       LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
       LEFT JOIN graduate_profiles profile ON profile.graduate_account_id = ga.id
       LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
       LEFT JOIN programs p ON p.id = g.program_id
      WHERE fcm.id = ?
        AND fcm.deleted_at IS NULL
      LIMIT 1`,
    [messageId],
  );

  if (!rows.length) return null;
  const attachments = await getMessageAttachments([messageId]);
  return formatMessage(rows[0], attachments.get(messageId) || []);
}

function formatMessage(row, attachments = []) {
  return {
    id: Number(row.id),
    room_id: Number(row.room_id),
    graduate_id: Number(row.graduate_id),
    message: row.message || '',
    message_type: row.message_type || 'text',
    client_message_id: row.client_message_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    delivered_at: row.delivered_at || null,
    read_at: row.read_at || null,
    sender_name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Graduate',
    sender_program_code: row.sender_program_code || null,
    sender_profile_image_path: mediaAccessReference(row.sender_profile_image_path),
    attachments,
    status: row.read_at ? 'read' : row.delivered_at ? 'delivered' : 'sent',
  };
}

function previewText(message, messageType) {
  const clean = String(message || '').trim();
  if (clean) return clean;
  if (messageType === 'image') return 'Photo';
  if (messageType === 'file') return 'Attachment';
  if (messageType === 'mixed') return 'Message with attachment';
  return 'No messages yet';
}

async function getConversationForViewer(roomId, viewerGraduateId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.created_by, r.name, r.is_group, r.group_image_path, r.group_image_updated_at,
            r.created_at, r.updated_at,
            lm.message AS last_message, lm.message_type AS last_message_type, lm.created_at AS last_message_at,
            lm.graduate_id AS last_message_sender_id,
            (
              SELECT COUNT(*)
                FROM forum_chat_messages unread
               WHERE unread.room_id = r.id
                 AND unread.graduate_id <> ?
                 AND unread.deleted_at IS NULL
                 AND unread.id > GREATEST(
                   COALESCE(mine.last_read_message_id, 0),
                   COALESCE(mine.hidden_before_message_id, 0)
                 )
            ) AS unread_count
       FROM forum_chat_rooms r
       JOIN forum_chat_members mine
         ON mine.room_id = r.id
        AND mine.graduate_id = ?
       LEFT JOIN forum_chat_messages lm
         ON lm.id = (
           SELECT msg.id
             FROM forum_chat_messages msg
             WHERE msg.room_id = r.id
               AND msg.deleted_at IS NULL
               AND msg.id > COALESCE(mine.hidden_before_message_id, 0)
            ORDER BY msg.created_at DESC, msg.id DESC
            LIMIT 1
         )
      WHERE r.id = ?
        AND (mine.hidden_at IS NULL OR lm.id IS NOT NULL)
      LIMIT 1`,
    [viewerGraduateId, viewerGraduateId, roomId],
  );

  if (!rows.length) return null;
  const room = rows[0];
  const [participants] = await pool.query(
    `SELECT g.id AS graduate_id,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', profile.first_name, profile.middle_name, profile.last_name)), ''), TRIM(CONCAT_WS(' ', g.first_name, g.middle_name, g.last_name))) AS full_name,
            p.code AS program_code,
            COALESCE(profile.graduation_year, g.year_graduated) AS year_graduated,
            gpi.file_path AS profile_image_path,
            presence.last_active_at
       FROM forum_chat_members fcm
       JOIN graduates g ON g.id = fcm.graduate_id
       LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
       LEFT JOIN graduate_profiles profile ON profile.graduate_account_id = ga.id
       LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
       LEFT JOIN programs p ON p.id = g.program_id
       LEFT JOIN graduate_presence presence ON presence.graduate_id = g.id
      WHERE fcm.room_id = ?
      ORDER BY g.first_name ASC, g.last_name ASC`,
    [roomId],
  );

  return {
    id: Number(room.id),
    created_by: Number(room.created_by),
    name: room.name,
    is_group: Number(room.is_group) === 1,
    created_at: room.created_at,
    updated_at: room.updated_at,
    last_message: previewText(room.last_message, room.last_message_type),
    last_message_type: room.last_message_type || null,
    last_message_at: room.last_message_at || room.updated_at,
    last_message_sender_id: room.last_message_sender_id ? Number(room.last_message_sender_id) : null,
    unread_count: Number(room.unread_count || 0),
    participants: participants.map((participant) => ({
      graduate_id: Number(participant.graduate_id),
      full_name: participant.full_name || 'Graduate',
      program_code: participant.program_code || null,
      year_graduated: participant.year_graduated === null ? null : Number(participant.year_graduated),
      profile_image_path: mediaAccessReference(participant.profile_image_path),
      last_active_at: participant.last_active_at || null,
      is_online: isGraduateOnline(participant.graduate_id),
      role: Number(room.created_by) === Number(participant.graduate_id) ? 'admin' : 'member',
    })),
    participant_count: participants.length,
    group_image_url: Number(room.is_group) === 1 && room.group_image_path
      ? `api/forum/conversation-info.php?room_id=${Number(room.id)}&avatar=1&v=${encodeURIComponent(String(room.group_image_updated_at || ''))}`
      : null,
    group_image_updated_at: room.group_image_updated_at || null,
  };
}

async function getUnreadSummary(graduateId) {
  const [rows] = await pool.query(
    `SELECT fcm.room_id, COUNT(msg.id) AS unread_count
       FROM forum_chat_members fcm
       LEFT JOIN forum_chat_messages msg
         ON msg.room_id = fcm.room_id
        AND msg.graduate_id <> fcm.graduate_id
         AND msg.deleted_at IS NULL
         AND msg.id > GREATEST(
           COALESCE(fcm.last_read_message_id, 0),
           COALESCE(fcm.hidden_before_message_id, 0)
         )
      WHERE fcm.graduate_id = ?
      GROUP BY fcm.room_id`,
    [graduateId],
  );

  const rooms = {};
  let total = 0;
  for (const row of rows) {
    const count = Number(row.unread_count || 0);
    rooms[Number(row.room_id)] = count;
    total += count;
  }

  return { total, rooms };
}

async function emitConversationUpdated(roomId) {
  const participants = await getRoomParticipants(roomId);
  await Promise.all(participants.map(async (participantId) => {
    const conversation = await getConversationForViewer(roomId, participantId);
    const unread = await getUnreadSummary(participantId);
    io.to(userRoom(participantId)).emit('conversation:updated', { conversation });
    io.to(userRoom(participantId)).emit('unread-count:updated', unread);
  }));
}

async function emitUserStatus(graduateId, isOnline) {
  const [presenceRows] = await pool.query(
    'SELECT last_active_at FROM graduate_presence WHERE graduate_id = ? LIMIT 1',
    [graduateId],
  );
  const status = {
    graduate_id: Number(graduateId),
    is_online: isOnline,
    last_active_at: isOnline ? null : (presenceRows[0]?.last_active_at || null),
  };

  const [participantRows] = await pool.query(
    `SELECT DISTINCT other_members.graduate_id
       FROM forum_chat_members mine
       JOIN forum_chat_members other_members ON other_members.room_id = mine.room_id
      WHERE mine.graduate_id = ?`,
    [graduateId],
  );

  io.to([
    presenceRoom(graduateId),
    ...participantRows.map((participant) => userRoom(participant.graduate_id)),
  ]).emit('user:status', status);
}

function normalizePresenceTargetIds(rawIds) {
  if (!Array.isArray(rawIds)) return [];
  return Array.from(new Set(rawIds
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)))
    .slice(0, 500);
}

async function getPresenceSnapshot(graduateId, requestedIds = []) {
  const [rows] = await pool.query(
    `SELECT DISTINCT visible_members.graduate_id, gp.last_active_at
       FROM forum_chat_members mine
       JOIN forum_chat_members visible_members ON visible_members.room_id = mine.room_id
       LEFT JOIN graduate_presence gp ON gp.graduate_id = visible_members.graduate_id
      WHERE mine.graduate_id = ?`,
    [graduateId],
  );

  const byGraduateId = new Map(rows.map((row) => [Number(row.graduate_id), row]));
  const targetIds = normalizePresenceTargetIds(requestedIds);
  if (targetIds.length > 0) {
    const [requestedRows] = await pool.query(
      `SELECT g.id AS graduate_id, presence.last_active_at
         FROM graduates g
         JOIN graduate_accounts account
           ON account.graduate_id = g.id
          AND account.status = 'active'
          AND account.alumni_verification_status = 'approved'
         LEFT JOIN graduate_presence presence ON presence.graduate_id = g.id
        WHERE g.status = 'active'
          AND g.id IN (?)`,
      [targetIds],
    );
    for (const row of requestedRows) {
      byGraduateId.set(Number(row.graduate_id), row);
    }
  }

  return Array.from(byGraduateId.values()).map((row) => ({
    graduate_id: Number(row.graduate_id),
    is_online: isGraduateOnline(row.graduate_id),
    last_active_at: row.last_active_at || null,
  }));
}

async function subscribeSocketToPresence(socket, users) {
  const targetIds = normalizePresenceTargetIds(users.map((user) => user.graduate_id));
  await Promise.all(targetIds.map((targetId) => socket.join(presenceRoom(targetId))));
}

function subscribeGraduateSocketsToPresence(graduateIds, targetIds) {
  const normalizedTargets = normalizePresenceTargetIds(targetIds);
  for (const graduateId of normalizePresenceTargetIds(graduateIds)) {
    for (const targetId of normalizedTargets) {
      io.in(userRoom(graduateId)).socketsJoin(presenceRoom(targetId));
    }
  }
}

function runInBackground(label, task) {
  void Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error(`${label}:`, error);
    });
}

function emitTypingStopped(socket, roomId, graduateId) {
  if (!roomId || Number(socket.data.typingConversationId || 0) !== Number(roomId)) return;
  const recipientIds = Array.isArray(socket.data.typingRecipientIds)
    ? socket.data.typingRecipientIds
    : [];
  socket.to([
    socketRoom(roomId),
    ...recipientIds.map((recipientId) => userRoom(recipientId)),
  ]).emit('typing:update', {
    room_id: roomId,
    graduate_id: graduateId,
    is_typing: false,
  });
  socket.data.typingConversationId = null;
  socket.data.typingRecipientIds = [];
  console.log(`[Realtime] Typing stopped: user=${graduateId} room=${roomId}`);
}

function emitSavedMessage(roomId, participantIds, message) {
  const targetRooms = [
    socketRoom(roomId),
    ...participantIds.map((participantId) => userRoom(participantId)),
  ];

  // Socket.IO treats multiple target rooms as a union, so a socket that is in
  // both its user room and the active conversation receives this event once.
  io.to(targetRooms).emit('message:new', { message });
}

async function publishPersistedMessage(roomId, messageId, graduateId) {
  await assertMessageAllowed(roomId, graduateId);
  let message = await fetchMessage(messageId);
  if (!message || Number(message.room_id) !== roomId || Number(message.graduate_id) !== graduateId) {
    throw new Error('Saved message not found');
  }

  const participantIds = await getRoomParticipants(roomId);
  const recipientIds = participantIds.filter((participantId) => participantId !== graduateId);
  if (!message.delivered_at && recipientIds.length > 0 && recipientIds.every((participantId) => isGraduateOnline(participantId))) {
    await pool.query(
      `UPDATE forum_chat_messages
          SET delivered_at = COALESCE(delivered_at, NOW())
        WHERE id = ?
          AND room_id = ?
          AND graduate_id = ?`,
      [messageId, roomId, graduateId],
    );
    message = await fetchMessage(messageId);
  }

  emitSavedMessage(roomId, participantIds, message);
  io.to(userRoom(graduateId)).emit('message:confirmed', { room_id: roomId, message });
  console.log(`[Realtime] Message emitted: ${message.id} room=${roomId}`);
  runInBackground('Unable to update conversation after published message', () => emitConversationUpdated(roomId));
  return message;
}

async function markDelivered(roomId, graduateId) {
  const connection = await pool.getConnection();
  let rows = [];
  try {
    await connection.beginTransaction();
    [rows] = await connection.query(
      `SELECT id, graduate_id
         FROM forum_chat_messages
        WHERE room_id = ?
          AND graduate_id <> ?
          AND delivered_at IS NULL
          AND deleted_at IS NULL
        ORDER BY id ASC
        FOR UPDATE`,
      [roomId, graduateId],
    );

    if (rows.length === 0) {
      await connection.commit();
      return;
    }

    const messageIds = rows.map((row) => Number(row.id));
    await connection.query(
      'UPDATE forum_chat_messages SET delivered_at = NOW() WHERE id IN (?)',
      [messageIds],
    );
    const [timestampRows] = await connection.query('SELECT NOW() AS delivered_at');
    const deliveredAt = timestampRows[0].delivered_at;
    rows = rows.map((row) => ({ ...row, delivered_at: deliveredAt }));
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  io.to(socketRoom(roomId)).emit('message:delivered', {
    room_id: roomId,
    delivered_by: graduateId,
    messages: rows.map((row) => ({
      id: Number(row.id),
      graduate_id: Number(row.graduate_id),
      delivered_at: row.delivered_at,
    })),
  });
}

async function markRead(roomId, graduateId, upToMessageId) {
  if (!upToMessageId || upToMessageId <= 0) {
    throw new Error('up_to_message_id is required');
  }

  const connection = await pool.getConnection();
  let rows = [];
  try {
    await connection.beginTransaction();
    const [boundaryRows] = await connection.query(
      `SELECT created_at
         FROM forum_chat_messages
        WHERE id = ?
          AND room_id = ?
        LIMIT 1`,
      [upToMessageId, roomId],
    );
    if (!boundaryRows.length) {
      throw new Error('Message is not part of this conversation');
    }

    await connection.query(
      `UPDATE forum_chat_members
          SET last_read_at = CASE
            WHEN last_read_at IS NULL OR last_read_at < ? THEN ?
            ELSE last_read_at
          END,
              last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?)
        WHERE room_id = ?
          AND graduate_id = ?`,
      [boundaryRows[0].created_at, boundaryRows[0].created_at, upToMessageId, roomId, graduateId],
    );

    [rows] = await connection.query(
      `SELECT id, graduate_id
         FROM forum_chat_messages
        WHERE room_id = ?
          AND graduate_id <> ?
          AND id <= ?
          AND read_at IS NULL
          AND deleted_at IS NULL
        ORDER BY id ASC
        FOR UPDATE`,
      [roomId, graduateId, upToMessageId],
    );

    if (rows.length > 0) {
      const messageIds = rows.map((row) => Number(row.id));
      await connection.query(
        `UPDATE forum_chat_messages
            SET read_at = NOW(),
                delivered_at = COALESCE(delivered_at, NOW())
          WHERE id IN (?)`,
        [messageIds],
      );
      const [timestampRows] = await connection.query('SELECT NOW() AS read_at');
      const readAt = timestampRows[0].read_at;
      rows = rows.map((row) => ({ ...row, read_at: readAt }));
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return rows.map((row) => ({
    id: Number(row.id),
    graduate_id: Number(row.graduate_id),
    read_at: row.read_at,
  }));
}

function normalizeForumPost(row, media = []) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    graduate_id: Number(row.graduate_id),
    author_year_graduated: row.author_year_graduated === null ? null : Number(row.author_year_graduated),
    image_file_size_bytes: row.image_file_size_bytes === null ? null : Number(row.image_file_size_bytes),
    comment_count: Number(row.comment_count || 0),
    like_count: Number(row.like_count || 0),
    report_count: 0,
    is_liked: false,
    author_profile_image_path: mediaAccessReference(row.author_profile_image_path),
    media,
    media_count: media.length,
  };
}

async function loadPublishedForumPost(postId) {
  const [rows] = await pool.query(
    `SELECT fp.id, fp.graduate_id, fp.title, fp.content, fp.category, fp.status,
            fp.image_path, fp.image_original_name, fp.image_mime_type, fp.image_file_size_bytes,
            fp.created_at, fp.updated_at,
            COALESCE(NULLIF(profile.first_name, ''), g.first_name) AS first_name,
            COALESCE(NULLIF(profile.last_name, ''), g.last_name) AS last_name,
            COALESCE(profile.graduation_year, g.year_graduated) AS author_year_graduated,
            COALESCE(NULLIF(profile.program_course, ''), p.name) AS author_program_name,
            p.code AS author_program_code,
            gpi.file_path AS author_profile_image_path,
            (SELECT COUNT(*) FROM forum_comments fc WHERE fc.post_id = fp.id AND fc.status = 'approved') AS comment_count,
            (SELECT COUNT(*) FROM forum_post_likes fpl WHERE fpl.post_id = fp.id) AS like_count
       FROM forum_posts fp
       JOIN graduates g ON g.id = fp.graduate_id
       LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
       LEFT JOIN graduate_profiles profile ON profile.graduate_account_id = ga.id
       LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
       LEFT JOIN programs p ON p.id = g.program_id
      WHERE fp.id = ? AND fp.status = 'approved'
      LIMIT 1`,
    [postId],
  );
  if (!rows.length) return null;

  const [mediaRows] = await pool.query(
    `SELECT id, post_id, media_type, file_path, original_name, mime_type, file_size_bytes, sort_order, created_at
       FROM forum_post_media
      WHERE post_id = ?
      ORDER BY sort_order ASC, id ASC`,
    [postId],
  );
  const media = mediaRows.map((row) => ({
    ...row,
    id: Number(row.id),
    post_id: Number(row.post_id),
    file_size_bytes: row.file_size_bytes === null ? null : Number(row.file_size_bytes),
    sort_order: Number(row.sort_order || 0),
    file_path: mediaAccessReference(row.file_path),
  }));
  const post = normalizeForumPost(rows[0], media);
  post.author_name = `${String(post.first_name || '').trim()} ${String(post.last_name || '').trim()}`.trim() || 'Graduate';
  return post;
}

async function loadApprovedComment(commentId) {
  const [rows] = await pool.query(
    `SELECT fc.id, fc.post_id, fc.graduate_id, fc.comment, fc.created_at,
            COALESCE(NULLIF(profile.first_name, ''), g.first_name) AS first_name,
            COALESCE(NULLIF(profile.last_name, ''), g.last_name) AS last_name,
            COALESCE(NULLIF(profile.program_course, ''), p.name) AS commenter_program_name,
            p.code AS commenter_program_code,
            gpi.file_path AS commenter_profile_image_path
       FROM forum_comments fc
       JOIN forum_posts fp ON fp.id = fc.post_id AND fp.status = 'approved'
       JOIN graduates g ON g.id = fc.graduate_id
       LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
       LEFT JOIN graduate_profiles profile ON profile.graduate_account_id = ga.id
       LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
       LEFT JOIN programs p ON p.id = g.program_id
      WHERE fc.id = ? AND fc.status = 'approved'
      LIMIT 1`,
    [commentId],
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    ...row,
    id: Number(row.id),
    post_id: Number(row.post_id),
    graduate_id: Number(row.graduate_id),
    commenter_name: `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim() || 'Graduate',
    commenter_profile_image_path: mediaAccessReference(row.commenter_profile_image_path),
  };
}

async function loadForumCommentCount(postId) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM forum_comments WHERE post_id = ? AND status = 'approved'",
    [postId],
  );
  return Number(rows[0]?.total || 0);
}

function normalizeAnnouncement(row, images = []) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    cover_image_path: mediaAccessReference(row.cover_image_path),
    author_profile_image_path: mediaAccessReference(row.author_profile_image_path),
    author_type: row.graduate_id ? 'graduate' : 'admin',
    images,
  };
}

const announcementSelectSql = `SELECT a.id, a.graduate_id, a.title, a.summary, a.content, a.category, a.event_date,
       a.cover_image_path, a.status, a.published_at, a.created_at, a.updated_at,
       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', profile.first_name, profile.middle_name, profile.last_name)), ''),
                NULLIF(TRIM(CONCAT_WS(' ', g.first_name, g.middle_name, g.last_name)), ''),
                NULLIF(TRIM(au.full_name), ''), NULLIF(TRIM(au.username), ''), 'GradTrack') AS author_name,
       COALESCE(NULLIF(profile.program_course, ''), p.name) AS author_program_name,
       p.code AS author_program_code, gpi.file_path AS author_profile_image_path
  FROM announcements a
  LEFT JOIN graduates g ON g.id = a.graduate_id
  LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
  LEFT JOIN graduate_profiles profile ON profile.graduate_account_id = ga.id
  LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
  LEFT JOIN programs p ON p.id = g.program_id
  LEFT JOIN admin_users au ON au.id = a.created_by_admin_id`;

async function loadPublishedAnnouncement(announcementId) {
  const [rows] = await pool.query(
    `${announcementSelectSql} WHERE a.id = ? AND a.status = 'published' LIMIT 1`,
    [announcementId],
  );
  if (!rows.length) return null;
  const [imageRows] = await pool.query(
    `SELECT id, announcement_id, file_path, original_name, mime_type, file_size_bytes, sort_order, created_at
       FROM announcement_images WHERE announcement_id = ? ORDER BY sort_order ASC, id ASC`,
    [announcementId],
  );
  const images = imageRows.map((row) => ({
    ...row,
    id: Number(row.id),
    announcement_id: Number(row.announcement_id),
    file_size_bytes: Number(row.file_size_bytes || 0),
    sort_order: Number(row.sort_order || 0),
    file_path: mediaAccessReference(row.file_path),
  }));
  return normalizeAnnouncement(rows[0], images);
}

async function loadAnnouncementSnapshot() {
  const [countRows] = await pool.query(
    "SELECT category, COUNT(*) AS total FROM announcements WHERE status = 'published' GROUP BY category ORDER BY total DESC, category ASC",
  );
  const [totalRows] = await pool.query("SELECT COUNT(*) AS total FROM announcements WHERE status = 'published'");
  const [recentRows] = await pool.query(
    `${announcementSelectSql} WHERE a.status = 'published' ORDER BY COALESCE(a.published_at, a.created_at) DESC, a.id DESC LIMIT 5`,
  );
  return {
    category_counts: countRows.map((row) => ({ category: String(row.category), count: Number(row.total || 0) })),
    total: Number(totalRows[0]?.total || 0),
    recent: recentRows.map((row) => normalizeAnnouncement(row)),
  };
}

async function loadVisibleJob(jobId) {
  const [rows] = await pool.query(
    `SELECT jp.id, jp.posted_by_account_id, jp.created_by_admin_id, jp.title, jp.company, jp.location,
            jp.salary_range, jp.job_type, jp.industry, jp.description, jp.qualifications, jp.required_skills,
            jp.course_program_fit, jp.application_deadline, jp.contact_email, jp.application_link,
            jp.application_method, jp.requirements_file_path, jp.requirements_file_name,
            jp.requirements_mime_type, jp.requirements_file_size_bytes, jp.is_active, jp.approval_status,
            jp.approval_reviewed_at, jp.approval_notes, jp.created_at, jp.updated_at,
            ga.id AS poster_account_id, ga.email AS poster_email, g.id AS poster_graduate_id,
            COALESCE(NULLIF(profile.first_name, ''), g.first_name) AS first_name,
            COALESCE(NULLIF(profile.middle_name, ''), g.middle_name) AS middle_name,
            COALESCE(NULLIF(profile.last_name, ''), g.last_name) AS last_name,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', profile.first_name, profile.middle_name, profile.last_name)), ''),
                     NULLIF(TRIM(CONCAT_WS(' ', g.first_name, g.middle_name, g.last_name)), ''),
                     NULLIF(TRIM(admin.full_name), ''), 'GradTrack Personnel') AS poster_full_name,
            COALESCE(NULLIF(profile.program_course, ''), p.name) AS poster_program_name,
            p.code AS poster_program_code, gpi.file_path AS poster_profile_image_path
       FROM job_posts jp
       LEFT JOIN graduate_accounts ga ON jp.posted_by_account_id = ga.id
       LEFT JOIN graduates g ON ga.graduate_id = g.id
       LEFT JOIN graduate_profiles profile ON profile.graduate_account_id = ga.id
       LEFT JOIN programs p ON g.program_id = p.id
       LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
       LEFT JOIN admin_users admin ON admin.id = jp.created_by_admin_id
      WHERE jp.id = ? AND jp.is_active = 1 AND jp.approval_status = 'approved'
      LIMIT 1`,
    [jobId],
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    ...row,
    id: Number(row.id),
    posted_by_account_id: row.posted_by_account_id === null ? undefined : Number(row.posted_by_account_id),
    created_by_admin_id: row.created_by_admin_id === null ? undefined : Number(row.created_by_admin_id),
    poster_account_id: row.poster_account_id === null ? undefined : Number(row.poster_account_id),
    poster_graduate_id: row.poster_graduate_id === null ? undefined : Number(row.poster_graduate_id),
    is_active: Number(row.is_active || 0),
    requirements_file_size_bytes: row.requirements_file_size_bytes === null ? null : Number(row.requirements_file_size_bytes),
    requirements_file_path: mediaAccessReference(row.requirements_file_path),
    poster_profile_image_path: mediaAccessReference(row.poster_profile_image_path),
  };
}

async function loadPublicProfile(graduateId) {
  const [rows] = await pool.query(
    `SELECT g.id AS graduate_id,
            COALESCE(NULLIF(profile.first_name, ''), g.first_name) AS first_name,
            COALESCE(NULLIF(profile.middle_name, ''), g.middle_name) AS middle_name,
            COALESCE(NULLIF(profile.last_name, ''), g.last_name) AS last_name,
            COALESCE(NULLIF(profile.program_course, ''), p.name) AS program_name,
            p.code AS program_code,
            COALESCE(profile.graduation_year, g.year_graduated) AS year_graduated,
            profile.job_title, profile.company_name, profile.professional_status,
            gpi.file_path AS profile_image_path, gci.file_path AS cover_image_path,
            profile.updated_at
       FROM graduates g
       JOIN graduate_accounts ga ON ga.graduate_id = g.id AND ga.status = 'active'
       LEFT JOIN graduate_profiles profile ON profile.graduate_account_id = ga.id
       LEFT JOIN programs p ON p.id = g.program_id
       LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
       LEFT JOIN graduate_cover_images gci ON gci.graduate_account_id = ga.id
      WHERE g.id = ? AND g.status = 'active'
      LIMIT 1`,
    [graduateId],
  );
  if (!rows.length) return null;
  const row = rows[0];
  const fullName = [row.first_name, row.middle_name, row.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
  return {
    ...row,
    graduate_id: Number(row.graduate_id),
    year_graduated: row.year_graduated === null ? null : Number(row.year_graduated),
    full_name: fullName || 'Graduate',
    profile_image_path: mediaAccessReference(row.profile_image_path),
    cover_image_path: mediaAccessReference(row.cover_image_path),
  };
}

async function publishPersistedMutation(mutation) {
  const eventId = String(mutation.event_id || '');
  const entity = String(mutation.entity || '');
  const action = String(mutation.action || '');
  const entityId = Number(mutation.entity_id || 0);
  const context = mutation.context && typeof mutation.context === 'object' ? mutation.context : {};
  if (!eventId || !entity || !action || !entityId) throw new Error('Invalid realtime mutation payload');

  const common = { event_id: eventId, entity_id: entityId, occurred_at: mutation.occurred_at || new Date().toISOString() };
  if (entity === 'forum_post') {
    const post = action === 'deleted' ? null : await loadPublishedForumPost(entityId);
    if (!post) {
      io.to(graduatePortalRoom()).emit('community:post-deleted', { ...common, post_id: entityId });
      return;
    }
    io.to(graduatePortalRoom()).emit(action === 'created' ? 'community:post-created' : 'community:post-updated', { ...common, post });
    return;
  }

  if (entity === 'forum_comment') {
    const comment = action === 'deleted' ? null : await loadApprovedComment(entityId);
    const postId = Number(comment?.post_id || context.post_id || 0);
    if (!postId) throw new Error('Forum comment post is unavailable');
    const commentCount = await loadForumCommentCount(postId);
    io.to(graduatePortalRoom()).emit('community:comment-count', { ...common, post_id: postId, comment_count: commentCount });
    if (comment) {
      io.to(communityThreadRoom(postId)).emit('community:comment-created', { ...common, post_id: postId, comment, comment_count: commentCount });
    } else {
      io.to(communityThreadRoom(postId)).emit('community:comment-deleted', { ...common, post_id: postId, comment_id: entityId, comment_count: commentCount });
    }
    return;
  }

  if (entity === 'forum_reaction') {
    const actorGraduateId = Number(context.actor_graduate_id || 0);
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM forum_post_likes WHERE post_id = ?', [entityId]);
    const [actorRows] = actorGraduateId > 0
      ? await pool.query('SELECT id FROM forum_post_likes WHERE post_id = ? AND graduate_id = ? LIMIT 1', [entityId, actorGraduateId])
      : [[]];
    io.to(graduatePortalRoom()).emit('community:reaction-updated', {
      ...common,
      post_id: entityId,
      actor_graduate_id: actorGraduateId || null,
      actor_liked: actorGraduateId > 0 ? actorRows.length > 0 : null,
      like_count: Number(countRows[0]?.total || 0),
    });
    return;
  }

  if (entity === 'announcement') {
    const [announcement, snapshot] = await Promise.all([
      action === 'deleted' ? Promise.resolve(null) : loadPublishedAnnouncement(entityId),
      loadAnnouncementSnapshot(),
    ]);
    if (!announcement) {
      io.to(graduatePortalRoom()).emit('announcements:removed', { ...common, announcement_id: entityId, ...snapshot });
      return;
    }
    io.to(graduatePortalRoom()).emit(action === 'created' ? 'announcements:created' : 'announcements:updated', {
      ...common,
      announcement,
      ...snapshot,
    });
    return;
  }

  if (entity === 'job') {
    const job = action === 'deleted' ? null : await loadVisibleJob(entityId);
    if (!job) {
      io.to(graduatePortalRoom()).emit('jobs:removed', { ...common, job_id: entityId });
      return;
    }
    io.to(graduatePortalRoom()).emit(action === 'created' || action === 'published' ? 'jobs:created' : 'jobs:updated', { ...common, job });
    return;
  }

  if (entity === 'profile') {
    const profile = await loadPublicProfile(entityId);
    if (profile) io.to(graduatePortalRoom()).emit('profile:updated', { ...common, profile });
    return;
  }

  throw new Error('Unsupported realtime mutation entity');
}

function mutationPublicationKey(mutation) {
  const entity = String(mutation?.entity || 'unknown');
  const entityId = Number(mutation?.entity_id || 0);
  if (entity === 'forum_comment') {
    return `forum_comment:post:${Number(mutation?.context?.post_id || entityId)}`;
  }
  if (entity === 'announcement') return 'announcement:published-feed';
  return `${entity}:${entityId}`;
}

async function enqueuePersistedMutation(mutation) {
  const queueKey = mutationPublicationKey(mutation);
  const previous = mutationPublicationQueues.get(queueKey) || Promise.resolve();
  const current = previous.catch(() => undefined).then(() => publishPersistedMutation(mutation));
  mutationPublicationQueues.set(queueKey, current);
  try {
    await current;
  } finally {
    if (mutationPublicationQueues.get(queueKey) === current) {
      mutationPublicationQueues.delete(queueKey);
    }
  }
}

function validPublishSignature(timestamp, signature, rawBody) {
  const timestampNumber = Number(timestamp || 0);
  if (!Number.isInteger(timestampNumber) || Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > realtimePublishMaxAgeSeconds) {
    return false;
  }
  const expected = crypto.createHmac('sha256', realtimePublishSecret).update(`${timestamp}.${rawBody}`).digest('hex');
  const receivedBuffer = Buffer.from(String(signature || ''), 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

async function readPublishBody(request) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > 32768) throw new Error('Realtime publish payload is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true, service: 'gradtrack-realtime' }));
    return;
  }

  if (request.method === 'POST' && request.url === '/internal/publish') {
    try {
      const rawBody = await readPublishBody(request);
      if (!validPublishSignature(request.headers['x-gradtrack-timestamp'], request.headers['x-gradtrack-signature'], rawBody)) {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
        return;
      }
      const mutation = JSON.parse(rawBody);
      const eventId = String(mutation?.event_id || '');
      if (!eventId) throw new Error('event_id is required');
      if (!processedMutationEvents.has(eventId)) {
        processedMutationEvents.set(eventId, Date.now());
        try {
          await enqueuePersistedMutation(mutation);
        } catch (error) {
          processedMutationEvents.delete(eventId);
          throw error;
        }
      }
      const expiry = Date.now() - 10 * 60 * 1000;
      for (const [seenEventId, seenAt] of processedMutationEvents) {
        if (seenAt < expiry) processedMutationEvents.delete(seenEventId);
      }
      response.writeHead(202, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true, event_id: eventId }));
    } catch (error) {
      console.error('[Realtime] Persisted mutation publication failed:', error);
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'Unable to publish mutation' }));
    }
    return;
  }

  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ ok: false }));
});

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed'));
    },
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: false,
  },
  pingInterval,
  pingTimeout,
});

io.use(async (socket, next) => {
  try {
    socket.data.sessionId = cookieValue(socket.handshake.headers.cookie || '', sessionCookieName);
    socket.data.user = await authenticateSocket(socket);
    next();
  } catch (error) {
    console.warn(`[Realtime] Authentication failed for socket ${socket.id}: ${error.message || 'Unknown error'}`);
    next(error);
  }
});

io.on('connection', (socket) => {
  const graduateId = Number(socket.data.user.graduate_id);
  const resumedBeforeOffline = cancelPendingOffline(graduateId);
  nextPresenceVersion(graduateId);
  const existingSet = onlineSocketsByGraduate.get(graduateId) || new Set();
  const wasOffline = existingSet.size === 0 && !resumedBeforeOffline;
  existingSet.add(socket.id);
  onlineSocketsByGraduate.set(graduateId, existingSet);
  socket.data.activeConversationId = null;
  socket.data.typingConversationId = null;
  socket.data.typingRecipientIds = [];
  socket.data.joinRequestNumber = 0;
  socket.join(userRoom(graduateId));
  socket.join(graduatePortalRoom());
  console.log(`[Realtime] Connected: ${socket.id}`);
  console.log(`[Realtime] Authenticated user: ${graduateId}`);
  console.log(`[Realtime] Joined user room: ${userRoom(graduateId)}`);

  // Register all event handlers before non-critical presence/sidebar queries.
  // A freshly connected client can join and send without waiting for that work.
  socket.on('community:thread:join', async (payload, ack) => {
    try {
      const postId = Number(payload?.post_id || 0);
      if (!postId) throw new Error('post_id is required');
      const [rows] = await pool.query("SELECT id FROM forum_posts WHERE id = ? AND status = 'approved' LIMIT 1", [postId]);
      if (!rows.length) throw new Error('Forum post not found');
      await socket.join(communityThreadRoom(postId));
      ack?.({ success: true, post_id: postId });
    } catch (error) {
      ack?.({ success: false, error: error.message || 'Unable to join forum thread' });
    }
  });

  socket.on('community:thread:leave', async (payload, ack) => {
    const postId = Number(payload?.post_id || 0);
    if (postId) await socket.leave(communityThreadRoom(postId));
    ack?.({ success: true, post_id: postId || null });
  });

  socket.on('conversation:join', async (payload, ack) => {
    try {
      const roomId = Number(payload?.room_id || payload?.conversation_id || 0);
      const requestNumber = Number(socket.data.joinRequestNumber || 0) + 1;
      socket.data.joinRequestNumber = requestNumber;
      await requireRoomMember(roomId, graduateId);
      if (requestNumber !== socket.data.joinRequestNumber) {
        ack?.({ success: false, error: 'Conversation changed before join completed' });
        return;
      }

      const previousRoomId = Number(socket.data.activeConversationId || 0);
      if (previousRoomId && previousRoomId !== roomId) {
        emitTypingStopped(socket, previousRoomId, graduateId);
        await socket.leave(socketRoom(previousRoomId));
      }

      await socket.join(socketRoom(roomId));
      socket.data.activeConversationId = roomId;
      ack?.({ success: true, room_id: roomId });
      runInBackground('Unable to mark joined conversation delivered', () => markDelivered(roomId, graduateId));
    } catch (error) {
      ack?.({ success: false, error: error.message || 'Unable to join conversation' });
    }
  });

  socket.on('presence:sync', async (payload, ack) => {
    try {
      const users = await getPresenceSnapshot(graduateId, payload?.graduate_ids);
      await subscribeSocketToPresence(socket, users);
      ack?.({ success: true, users });
    } catch (error) {
      ack?.({ success: false, error: error.message || 'Unable to synchronize presence' });
    }
  });

  socket.on('session:logout', (_payload, ack) => {
    const sessionId = socket.data.sessionId;
    if (!sessionId) {
      ack?.({ success: false, error: 'Authenticated session is unavailable' });
      return;
    }

    const sessionSocketCount = Array.from(io.of('/').sockets.values()).filter(
      (connectedSocket) => connectedSocket.data.sessionId === sessionId,
    ).length;
    ack?.({ success: true, disconnected_connections: sessionSocketCount });
    setImmediate(() => {
      const disconnectedConnections = disconnectSessionSockets(sessionId);
      console.log(`[Realtime] Logged out session for user=${graduateId}; disconnected=${disconnectedConnections}`);
    });
  });

  socket.on('conversation:leave', async (payload, ack) => {
    socket.data.joinRequestNumber = Number(socket.data.joinRequestNumber || 0) + 1;
    const requestedRoomId = Number(payload?.room_id || payload?.conversation_id || 0);
    const activeRoomId = Number(socket.data.activeConversationId || 0);
    const roomId = requestedRoomId || activeRoomId;

    if (roomId > 0 && roomId === activeRoomId) {
      emitTypingStopped(socket, roomId, graduateId);
      await socket.leave(socketRoom(roomId));
      socket.data.activeConversationId = null;
    }
    ack?.({ success: true });
  });

  socket.on('message:send', (_payload, ack) => {
    ack?.({ success: false, error: 'Save messages through the authenticated REST API before publication' });
  });

  socket.on('message:read', async (payload, ack) => {
    try {
      const roomId = Number(payload?.room_id || payload?.conversation_id || 0);
      const upToMessageId = Number(payload?.up_to_message_id || payload?.message_id || 0);
      await requireRoomMember(roomId, graduateId);
      const messages = await markRead(roomId, graduateId, upToMessageId);
      const participants = await getRoomParticipants(roomId);
      const receipt = { room_id: roomId, read_by: graduateId, messages };

      io.to([socketRoom(roomId), ...participants.map((id) => userRoom(id))]).emit('message:read', receipt);
      ack?.({ success: true, messages });
      runInBackground('Unable to update conversations after read receipt', () => emitConversationUpdated(roomId));
    } catch (error) {
      ack?.({ success: false, error: error.message || 'Unable to mark messages as read' });
    }
  });

  socket.on('typing:start', async (payload, ack) => {
    try {
      const roomId = Number(payload?.room_id || payload?.conversation_id || 0);
      await assertMessageAllowed(roomId, graduateId);
      const participantIds = await getRoomParticipants(roomId);
      const recipientIds = participantIds.filter((participantId) => participantId !== graduateId);
      const previousTypingRoomId = Number(socket.data.typingConversationId || 0);
      if (previousTypingRoomId && previousTypingRoomId !== roomId) {
        emitTypingStopped(socket, previousTypingRoomId, graduateId);
      }
      socket.data.typingConversationId = roomId;
      socket.data.typingRecipientIds = recipientIds;
      socket.to([
        socketRoom(roomId),
        ...recipientIds.map((recipientId) => userRoom(recipientId)),
      ]).emit('typing:update', {
        room_id: roomId,
        graduate_id: graduateId,
        name: socket.data.user.full_name,
        is_typing: true,
      });
      console.log(`[Realtime] Typing started: user=${graduateId} room=${roomId}`);
      ack?.({ success: true });
    } catch (error) {
      ack?.({ success: false, error: error.message || 'Unable to send typing event' });
    }
  });

  socket.on('typing:stop', async (payload, ack) => {
    const roomId = Number(payload?.room_id || payload?.conversation_id || socket.data.typingConversationId || 0);
    if (roomId > 0) {
      emitTypingStopped(socket, roomId, graduateId);
    }
    ack?.({ success: true });
  });

  socket.on('disconnecting', () => {
    const typingRoomId = Number(socket.data.typingConversationId || 0);
    if (typingRoomId > 0) {
      emitTypingStopped(socket, typingRoomId, graduateId);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Realtime] Disconnected: ${socket.id} user=${graduateId} reason=${reason}`);
    const sockets = onlineSocketsByGraduate.get(graduateId);
    if (!sockets) return;
    sockets.delete(socket.id);
    if (sockets.size > 0) return;

    onlineSocketsByGraduate.delete(graduateId);
    const offlineVersion = nextPresenceVersion(graduateId);
    cancelPendingOffline(graduateId);
    const isCleanDisconnect = reason === 'client namespace disconnect' || reason === 'server namespace disconnect';
    const offlineGraceMs = socket.data.explicitLogout
      ? 0
      : isCleanDisconnect
        ? presenceOfflineGraceMs
        : presenceRecoveryGraceMs;
    const timeout = setTimeout(() => {
      pendingOfflineTimersByGraduate.delete(graduateId);
      runInBackground('Unable to update disconnected graduate presence', async () => {
        if (isGraduateOnline(graduateId) || presenceVersionByGraduate.get(graduateId) !== offlineVersion) return;
        await pool.query(
          `INSERT INTO graduate_presence (graduate_id, last_active_at)
           VALUES (?, NOW())
           ON DUPLICATE KEY UPDATE last_active_at = NOW(), updated_at = NOW()`,
          [graduateId],
        );
        if (isGraduateOnline(graduateId) || presenceVersionByGraduate.get(graduateId) !== offlineVersion) return;
        await emitUserStatus(graduateId, false);
        console.log(`[Realtime] User offline: ${graduateId}`);
      });
    }, offlineGraceMs);
    pendingOfflineTimersByGraduate.set(graduateId, timeout);
  });

  socket.on('conversation:refresh', async (payload, ack) => {
    try {
      const roomId = Number(payload?.room_id || payload?.conversation_id || 0);
      await requireRoomMember(roomId, graduateId);
      await emitConversationUpdated(roomId);
      ack?.({ success: true });
    } catch (error) {
      ack?.({ success: false, error: error.message || 'Unable to refresh conversation' });
    }
  });

  socket.on('conversation:members-added', async (payload, ack) => {
    try {
      const roomId = Number(payload?.room_id || payload?.conversation_id || 0);
      const systemMessageId = Number(payload?.system_message_id || 0);
      const addedMemberIds = normalizePresenceTargetIds(payload?.added_member_ids);
      const room = await requireRoomMember(roomId, graduateId);
      if (Number(room.is_group) !== 1 || Number(room.created_by) !== graduateId) {
        throw new Error('Only the group administrator can synchronize added members');
      }
      if (!systemMessageId || addedMemberIds.length === 0) {
        throw new Error('The saved membership event is required');
      }

      const message = await fetchMessage(systemMessageId);
      if (!message
        || Number(message.room_id) !== roomId
        || Number(message.graduate_id) !== graduateId
        || message.message_type !== 'system') {
        throw new Error('Saved membership event not found');
      }

      const participantIds = await getRoomParticipants(roomId);
      if (addedMemberIds.some((memberId) => !participantIds.includes(memberId))) {
        throw new Error('One or more added members are unavailable');
      }

      subscribeGraduateSocketsToPresence(participantIds, participantIds);
      emitSavedMessage(roomId, participantIds, message);
      io.to([socketRoom(roomId), ...participantIds.map((memberId) => userRoom(memberId))]).emit('conversation:members-updated', {
        room_id: roomId,
        member_ids: participantIds,
        added_member_ids: addedMemberIds,
      });
      await emitConversationUpdated(roomId);
      await Promise.all(addedMemberIds.map(async (memberId) => {
        const users = await getPresenceSnapshot(memberId, participantIds);
        io.to(userRoom(memberId)).emit('presence:snapshot', { users });
      }));
      ack?.({ success: true, message });
    } catch (error) {
      ack?.({ success: false, error: error.message || 'Unable to synchronize added members' });
    }
  });

  socket.on('conversation:policy-changed', async (payload, ack) => {
    try {
      const roomId = Number(payload?.room_id || payload?.conversation_id || 0);
      await requireRoomMember(roomId, graduateId);
      const participants = await getRoomParticipants(roomId);
      io.to(participants.map((id) => userRoom(id))).emit('conversation:policy-updated', { room_id: roomId });
      ack?.({ success: true });
    } catch (error) {
      ack?.({ success: false, error: error.message || 'Unable to refresh conversation policy' });
    }
  });

  socket.on('conversation:leave-prepare', async (payload, ack) => {
    try {
      const roomId = Number(payload?.room_id || payload?.conversation_id || 0);
      const room = await requireRoomMember(roomId, graduateId);
      if (Number(room.is_group) !== 1) throw new Error('Only group conversations can be left');
      const token = crypto.randomUUID();
      pendingMembershipChanges.set(token, {
        socketId: socket.id,
        graduateId,
        roomId,
        expiresAt: Date.now() + 30000,
      });
      setTimeout(() => pendingMembershipChanges.delete(token), 31000).unref();
      ack?.({ success: true, token });
    } catch (error) {
      ack?.({ success: false, error: error.message || 'Unable to prepare group departure' });
    }
  });

  socket.on('conversation:leave-confirm', async (payload, ack) => {
    const token = String(payload?.token || '');
    const prepared = pendingMembershipChanges.get(token);
    pendingMembershipChanges.delete(token);
    try {
      const roomId = Number(payload?.room_id || payload?.conversation_id || 0);
      const systemMessageId = Number(payload?.system_message_id || 0);
      if (!prepared
        || prepared.socketId !== socket.id
        || prepared.graduateId !== graduateId
        || prepared.roomId !== roomId
        || prepared.expiresAt < Date.now()) {
        throw new Error('Group departure confirmation expired');
      }
      const [rooms] = await pool.query(
        `SELECT r.id
           FROM forum_chat_rooms r
          WHERE r.id = ?
            AND r.is_group = 1
            AND NOT EXISTS (
              SELECT 1 FROM forum_chat_members member
               WHERE member.room_id = r.id AND member.graduate_id = ?
            )
          LIMIT 1`,
        [roomId, graduateId],
      );
      if (!rooms.length) throw new Error('Group membership has not been removed');

      const participantIds = await getRoomParticipants(roomId);
      if (systemMessageId > 0) {
        const message = await fetchMessage(systemMessageId);
        if (!message
          || Number(message.room_id) !== roomId
          || Number(message.graduate_id) !== graduateId
          || message.message_type !== 'system') {
          throw new Error('Saved group departure event not found');
        }
        emitSavedMessage(roomId, participantIds, message);
      }
      subscribeGraduateSocketsToPresence(participantIds, participantIds);
      io.to([socketRoom(roomId), ...participantIds.map((memberId) => userRoom(memberId))]).emit('conversation:members-updated', {
        room_id: roomId,
        member_ids: participantIds,
        removed_member_ids: [graduateId],
      });
      await emitConversationUpdated(roomId);
      io.to(userRoom(graduateId)).emit('conversation:removed', { room_id: roomId });
      ack?.({ success: true });
    } catch (error) {
      ack?.({ success: false, error: error.message || 'Unable to synchronize group departure' });
    }
  });

  socket.on('conversation:hidden-publish', async (payload, ack) => {
    try {
      const roomId = Number(payload?.room_id || payload?.conversation_id || 0);
      if (!roomId) throw new Error('room_id is required');
      await requireRoomMember(roomId, graduateId);
      const [memberships] = await pool.query(
        `SELECT hidden_at
           FROM forum_chat_members
          WHERE room_id = ? AND graduate_id = ?
          LIMIT 1`,
        [roomId, graduateId],
      );
      if (!memberships[0]?.hidden_at) throw new Error('Conversation has not been hidden');

      if (Number(socket.data.activeConversationId || 0) === roomId) {
        emitTypingStopped(socket, roomId, graduateId);
        await socket.leave(socketRoom(roomId));
        socket.data.activeConversationId = null;
      }
      io.to(userRoom(graduateId)).emit('conversation:removed', { room_id: roomId });
      io.to(userRoom(graduateId)).emit('unread-count:updated', await getUnreadSummary(graduateId));
      ack?.({ success: true });
    } catch (error) {
      ack?.({ success: false, error: error.message || 'Unable to synchronize hidden conversation' });
    }
  });

  socket.on('message:delete-publish', async (payload, ack) => {
    try {
      const roomId = Number(payload?.room_id || payload?.conversation_id || 0);
      const messageId = Number(payload?.message_id || payload?.id || 0);
      if (!roomId || !messageId) throw new Error('room_id and message_id are required');
      await requireRoomMember(roomId, graduateId);
      const [messages] = await pool.query(
        `SELECT room_id, graduate_id, message_type, deleted_at
           FROM forum_chat_messages
          WHERE id = ?
          LIMIT 1`,
        [messageId],
      );
      const message = messages[0];
      if (!message
        || Number(message.room_id) !== roomId
        || Number(message.graduate_id) !== graduateId
        || message.message_type === 'system'
        || !message.deleted_at) {
        throw new Error('Deleted message could not be verified');
      }

      const participantIds = await getRoomParticipants(roomId);
      io.to([socketRoom(roomId), ...participantIds.map((participantId) => userRoom(participantId))]).emit('message:deleted', {
        room_id: roomId,
        message_id: messageId,
      });
      await emitConversationUpdated(roomId);
      ack?.({ success: true });
    } catch (error) {
      ack?.({ success: false, error: error.message || 'Unable to synchronize deleted message' });
    }
  });

  socket.on('message:publish', async (payload, ack) => {
    const roomId = Number(payload?.room_id || payload?.conversation_id || 0);
    const messageId = Number(payload?.message_id || payload?.id || 0);
    try {
      if (!roomId || !messageId) throw new Error('room_id and message_id are required');
      if (Number(socket.data.typingConversationId || 0) === roomId) {
        emitTypingStopped(socket, roomId, graduateId);
      }
      const message = await publishPersistedMessage(roomId, messageId, graduateId);
      ack?.({ success: true, message });
    } catch (error) {
      const publicError = error?.code ? 'Unable to publish message' : (error.message || 'Unable to publish message');
      console.error('message:publish failed:', error);
      ack?.({ success: false, error: publicError });
    }
  });

  runInBackground('Unable to initialize connected graduate presence', async () => {
    await pool.query(
      `INSERT INTO graduate_presence (graduate_id, last_active_at)
       VALUES (?, NULL)
       ON DUPLICATE KEY UPDATE updated_at = NOW()`,
      [graduateId],
    );
    if (wasOffline) {
      await emitUserStatus(graduateId, true);
      console.log(`[Realtime] User online: ${graduateId}`);
    }
    const users = await getPresenceSnapshot(graduateId);
    await subscribeSocketToPresence(socket, users);
    socket.emit('presence:snapshot', { users });
    io.to(userRoom(graduateId)).emit('unread-count:updated', await getUnreadSummary(graduateId));
  });
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Stopping GradTrack realtime server (${signal})`);

  const connectedGraduateIds = Array.from(onlineSocketsByGraduate.keys());
  if (connectedGraduateIds.length > 0) {
    try {
      await Promise.all(connectedGraduateIds.map((graduateId) => pool.query(
        `INSERT INTO graduate_presence (graduate_id, last_active_at)
         VALUES (?, NOW())
         ON DUPLICATE KEY UPDATE last_active_at = NOW(), updated_at = NOW()`,
        [graduateId],
      )));
    } catch (error) {
      console.error('Unable to persist presence during realtime shutdown:', error);
    }
  }

  await new Promise((resolve) => io.close(resolve));
  pendingOfflineTimersByGraduate.forEach((timeout) => clearTimeout(timeout));
  pendingOfflineTimersByGraduate.clear();
  await pool.end();
  process.exit(0);
}

server.on('error', (error) => {
  console.error('GradTrack realtime server error:', error);
  void pool.end().finally(() => process.exit(1));
});

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

(autoMigrate ? ensureSchema() : verifySchema())
  .then(() => verifyDatabaseTimezone())
  .then(() => {
    server.listen(port, realtimeHost, () => {
      console.log(`[Realtime] Listening on ${realtimeHost}:${port}`);
      console.log(`[Realtime] Authentication endpoint: ${authCheckUrl}`);
      console.log(`[Realtime] Allowed origins: ${allowedOrigins.join(', ')}`);
    });
  })
  .catch((error) => {
    console.error('Unable to start GradTrack realtime server:', error);
    process.exit(1);
  });
