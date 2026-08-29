const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true, override: false });

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

const port = Number(process.env.REALTIME_PORT || 3001);
const apiBaseUrl = (process.env.GRADTRACK_API_BASE_URL || 'http://localhost/GradTrack/backend').replace(/\/+$/, '');
const authCheckUrl = process.env.REALTIME_AUTH_CHECK_URL || `${apiBaseUrl}/api/graduate-auth/check.php`;
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const pool = mysql.createPool({
  host: normalizedDbHost(),
  port: normalizedDbPort(),
  user: requiredEnvAny(['DB_USER', 'DB_USERNAME'], 'DB_USER/DB_USERNAME'),
  password: requiredEnv('DB_PASSWORD'),
  database: requiredEnvAny(['DB_NAME', 'DB_DATABASE'], 'DB_NAME/DB_DATABASE'),
  waitForConnections: true,
  connectionLimit: Number(process.env.REALTIME_DB_CONNECTION_LIMIT || 10),
  charset: 'utf8mb4',
  timezone: process.env.DB_TIMEZONE || '+08:00',
});

const onlineSocketsByGraduate = new Map();
const pendingOfflineTimersByGraduate = new Map();
const presenceVersionByGraduate = new Map();
const autoMigrate = String(process.env.REALTIME_AUTO_MIGRATE || '').toLowerCase() === 'true';
const presenceOfflineGraceMs = Math.max(0, Number(process.env.REALTIME_PRESENCE_OFFLINE_GRACE_MS || 1500));
const presenceRecoveryGraceMs = Math.max(presenceOfflineGraceMs, Number(process.env.REALTIME_PRESENCE_RECOVERY_GRACE_MS || 5000));
const pingInterval = Math.max(5000, Number(process.env.REALTIME_PING_INTERVAL_MS || 25000));
const pingTimeout = Math.max(5000, Number(process.env.REALTIME_PING_TIMEOUT_MS || 20000));

function socketRoom(roomId) {
  return `conversation:${roomId}`;
}

function userRoom(graduateId) {
  return `graduate:${graduateId}`;
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

async function ensureSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS forum_chat_rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    created_by INT NOT NULL,
    name VARCHAR(150) NULL,
    is_group TINYINT(1) NOT NULL DEFAULT 0,
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
  await addColumnIfMissing('forum_chat_members', 'last_read_at', 'ALTER TABLE forum_chat_members ADD last_read_at DATETIME NULL AFTER joined_at');
  await addColumnIfMissing('forum_chat_members', 'created_at', 'ALTER TABLE forum_chat_members ADD created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER last_read_at');
  await addColumnIfMissing('forum_chat_members', 'updated_at', 'ALTER TABLE forum_chat_members ADD updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
  await pool.query('ALTER TABLE forum_chat_messages MODIFY message TEXT NULL');
  await addColumnIfMissing('forum_chat_messages', 'message_type', "ALTER TABLE forum_chat_messages ADD message_type ENUM('text', 'image', 'file', 'mixed') NOT NULL DEFAULT 'text' AFTER message");
  await addColumnIfMissing('forum_chat_messages', 'client_message_id', 'ALTER TABLE forum_chat_messages ADD client_message_id VARCHAR(80) NULL AFTER message_type');
  await addColumnIfMissing('forum_chat_messages', 'delivered_at', 'ALTER TABLE forum_chat_messages ADD delivered_at DATETIME NULL AFTER client_message_id');
  await addColumnIfMissing('forum_chat_messages', 'read_at', 'ALTER TABLE forum_chat_messages ADD read_at DATETIME NULL AFTER delivered_at');
  await addColumnIfMissing('forum_chat_messages', 'updated_at', 'ALTER TABLE forum_chat_messages ADD updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
  await addColumnIfMissing('forum_chat_messages', 'deleted_at', 'ALTER TABLE forum_chat_messages ADD deleted_at DATETIME NULL AFTER updated_at');

  await addIndexIfMissing('forum_chat_rooms', 'idx_forum_chat_rooms_last_message', ['last_message_at', 'updated_at', 'id'], false, 'ALTER TABLE forum_chat_rooms ADD INDEX idx_forum_chat_rooms_last_message (last_message_at, updated_at, id)');
  await addIndexIfMissing('forum_chat_members', 'idx_forum_chat_members_read', ['room_id', 'graduate_id', 'last_read_at'], false, 'ALTER TABLE forum_chat_members ADD INDEX idx_forum_chat_members_read (room_id, graduate_id, last_read_at)');
  await addIndexIfMissing('forum_chat_messages', 'idx_forum_chat_messages_room_id', ['room_id', 'id'], false, 'ALTER TABLE forum_chat_messages ADD INDEX idx_forum_chat_messages_room_id (room_id, id)');
  await addIndexIfMissing('forum_chat_messages', 'idx_forum_chat_messages_sender_created', ['graduate_id', 'created_at'], false, 'ALTER TABLE forum_chat_messages ADD INDEX idx_forum_chat_messages_sender_created (graduate_id, created_at)');
  await addIndexIfMissing('forum_chat_messages', 'idx_forum_chat_messages_created', ['created_at', 'id'], false, 'ALTER TABLE forum_chat_messages ADD INDEX idx_forum_chat_messages_created (created_at, id)');
  await addIndexIfMissing('forum_chat_messages', 'uniq_forum_chat_client_message', ['room_id', 'graduate_id', 'client_message_id'], true, 'ALTER TABLE forum_chat_messages ADD UNIQUE KEY uniq_forum_chat_client_message (room_id, graduate_id, client_message_id)');

  await pool.query(`CREATE TABLE IF NOT EXISTS forum_chat_message_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
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

  await pool.query(`UPDATE forum_chat_rooms r
    SET r.last_message_at = (
      SELECT MAX(fcm.created_at)
        FROM forum_chat_messages fcm
       WHERE fcm.room_id = r.id
         AND fcm.deleted_at IS NULL
    )
    WHERE r.last_message_at IS NULL`);
}

async function verifySchema() {
  await pool.query(`SELECT fcm.id, fcm.room_id, fcm.graduate_id, fcm.client_message_id,
                           fcm.created_at, fcm.deleted_at
                      FROM forum_chat_messages fcm
                      JOIN forum_chat_members members ON members.room_id = fcm.room_id
                     WHERE 1 = 0`);
  await pool.query('SELECT id, room_id, message_id, uploaded_by FROM forum_chat_message_attachments WHERE 1 = 0');
  await pool.query('SELECT graduate_id, last_active_at FROM graduate_presence WHERE 1 = 0');
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
    signal: AbortSignal.timeout(5000),
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
    `SELECT r.id, r.name, r.is_group
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
            g.first_name, g.last_name, p.code AS sender_program_code, gpi.file_path AS sender_profile_image_path
       FROM forum_chat_messages fcm
       JOIN graduates g ON g.id = fcm.graduate_id
       LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
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
    sender_profile_image_path: row.sender_profile_image_path || null,
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
    `SELECT r.id, r.created_by, r.name, r.is_group, r.created_at, r.updated_at,
            lm.message AS last_message, lm.message_type AS last_message_type, lm.created_at AS last_message_at,
            lm.graduate_id AS last_message_sender_id,
            (
              SELECT COUNT(*)
                FROM forum_chat_messages unread
               WHERE unread.room_id = r.id
                 AND unread.graduate_id <> ?
                 AND unread.deleted_at IS NULL
                 AND (mine.last_read_at IS NULL OR unread.created_at > mine.last_read_at)
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
            ORDER BY msg.created_at DESC, msg.id DESC
            LIMIT 1
         )
      WHERE r.id = ?
      LIMIT 1`,
    [viewerGraduateId, viewerGraduateId, roomId],
  );

  if (!rows.length) return null;
  const room = rows[0];
  const [participants] = await pool.query(
    `SELECT g.id AS graduate_id,
            TRIM(CONCAT(COALESCE(g.first_name, ''), ' ', COALESCE(g.last_name, ''))) AS full_name,
            p.code AS program_code,
            gpi.file_path AS profile_image_path,
            gp.last_active_at
       FROM forum_chat_members fcm
       JOIN graduates g ON g.id = fcm.graduate_id
       LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
       LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
       LEFT JOIN programs p ON p.id = g.program_id
       LEFT JOIN graduate_presence gp ON gp.graduate_id = g.id
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
      profile_image_path: participant.profile_image_path || null,
      last_active_at: participant.last_active_at || null,
      is_online: isGraduateOnline(participant.graduate_id),
    })),
    participant_count: participants.length,
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
        AND (fcm.last_read_at IS NULL OR msg.created_at > fcm.last_read_at)
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

  for (const participant of participantRows) {
    io.to(userRoom(participant.graduate_id)).emit('user:status', status);
  }
}

async function getPresenceSnapshot(graduateId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT visible_members.graduate_id, gp.last_active_at
       FROM forum_chat_members mine
       JOIN forum_chat_members visible_members ON visible_members.room_id = mine.room_id
       LEFT JOIN graduate_presence gp ON gp.graduate_id = visible_members.graduate_id
      WHERE mine.graduate_id = ?`,
    [graduateId],
  );

  return rows.map((row) => ({
    graduate_id: Number(row.graduate_id),
    is_online: isGraduateOnline(row.graduate_id),
    last_active_at: row.last_active_at || null,
  }));
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
  socket.to(socketRoom(roomId)).emit('typing:update', {
    room_id: roomId,
    graduate_id: graduateId,
    is_typing: false,
  });
  socket.data.typingConversationId = null;
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
  await requireRoomMember(roomId, graduateId);
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
          AND deleted_at IS NULL
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
          END
        WHERE room_id = ?
          AND graduate_id = ?`,
      [boundaryRows[0].created_at, boundaryRows[0].created_at, roomId, graduateId],
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

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true, service: 'gradtrack-realtime' }));
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
  socket.data.joinRequestNumber = 0;
  socket.join(userRoom(graduateId));
  console.log(`[Realtime] Connected: ${socket.id}`);
  console.log(`[Realtime] Authenticated user: ${graduateId}`);
  console.log(`[Realtime] Joined user room: ${userRoom(graduateId)}`);

  // Register all event handlers before non-critical presence/sidebar queries.
  // A freshly connected client can join and send without waiting for that work.
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

  socket.on('presence:sync', async (_payload, ack) => {
    try {
      ack?.({ success: true, users: await getPresenceSnapshot(graduateId) });
    } catch (error) {
      ack?.({ success: false, error: error.message || 'Unable to synchronize presence' });
    }
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
      if (Number(socket.data.activeConversationId || 0) !== roomId || !socket.rooms.has(socketRoom(roomId))) {
        throw new Error('Join the conversation before sending typing events');
      }
      await requireRoomMember(roomId, graduateId);
      socket.data.typingConversationId = roomId;
      socket.to(socketRoom(roomId)).emit('typing:update', {
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
    if (roomId > 0 && Number(socket.data.activeConversationId || 0) === roomId) {
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
    const offlineGraceMs = isCleanDisconnect ? presenceOfflineGraceMs : presenceRecoveryGraceMs;
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
    socket.emit('presence:snapshot', { users: await getPresenceSnapshot(graduateId) });
    io.to(userRoom(graduateId)).emit('unread-count:updated', await getUnreadSummary(graduateId));
  });
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Stopping GradTrack realtime server (${signal})`);
  await new Promise((resolve) => io.close(resolve));
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
  .then(() => {
    server.listen(port, () => {
      console.log(`[Realtime] Listening on http://localhost:${port}`);
      console.log(`[Realtime] Authentication endpoint: ${authCheckUrl}`);
      console.log(`[Realtime] Allowed origins: ${allowedOrigins.join(', ')}`);
    });
  })
  .catch((error) => {
    console.error('Unable to start GradTrack realtime server:', error);
    process.exit(1);
  });
