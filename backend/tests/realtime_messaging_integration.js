const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const { io } = require('../../frontend/node_modules/socket.io-client');

const projectRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true, override: false });

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`${name} is required for the AWS RDS test connection`);
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
  throw new Error(`${label} is required for the AWS RDS test connection`);
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

const testPort = Number(process.env.REALTIME_TEST_PORT || 3101);
const realtimeUrl = `http://127.0.0.1:${testPort}`;
const useExistingServer = String(process.env.REALTIME_TEST_USE_EXISTING || '').toLowerCase() === 'true';
const apiBaseUrl = (process.env.GRADTRACK_API_BASE_URL || 'http://localhost/GradTrack/backend').replace(/\/+$/, '');
const chatMessagesUrl = `${apiBaseUrl}/api/forum/chat-messages.php`;
const allowedOrigin = (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((value) => value.trim())
  .find((value) => value && value !== '*') || 'http://localhost:5173';
const storageDriver = String(process.env.STORAGE_DRIVER || process.env.APP_STORAGE_DRIVER || 'local').trim().toLowerCase();

function expectedMediaReference(reference) {
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

const pool = mysql.createPool({
  host: normalizedDbHost(),
  port: Number(process.env.DB_PORT || 3306),
  user: requiredEnvAny(['DB_USER', 'DB_USERNAME'], 'DB_USER/DB_USERNAME'),
  password: requiredEnv('DB_PASSWORD'),
  database: requiredEnvAny(['DB_NAME', 'DB_DATABASE'], 'DB_NAME/DB_DATABASE'),
  connectionLimit: 3,
  charset: 'utf8mb4',
  timezone: process.env.DB_TIMEZONE || '+08:00',
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

function isRecentServerTimestamp(value, maxAgeMs = 2 * 60 * 1000) {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) && Math.abs(Date.now() - timestamp) <= maxAgeMs;
}

function createGraduateSession(accountId) {
  const sessionId = `gradtrack-test-${crypto.randomBytes(18).toString('hex')}`;
  const php = [
    `session_id('${sessionId}');`,
    'session_start();',
    `$_SESSION['graduate_account_id'] = ${Number(accountId)};`,
    'session_write_close();',
  ].join(' ');
  const result = spawnSync('php', ['-r', php], { cwd: projectRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Unable to create PHP test session: ${result.stderr || result.stdout}`);
  }
  return sessionId;
}

function destroyGraduateSession(sessionId) {
  if (!sessionId) return;
  const php = [
    `session_id('${sessionId}');`,
    'session_start();',
    '$_SESSION = [];',
    'session_destroy();',
  ].join(' ');
  spawnSync('php', ['-r', php], { cwd: projectRoot, encoding: 'utf8' });
}

function connectSocket(sessionId, { reconnection = false } = {}) {
  return new Promise((resolve, reject) => {
    const socket = io(realtimeUrl, {
      transports: ['websocket'],
      reconnection,
      reconnectionAttempts: 5,
      reconnectionDelay: 100,
      timeout: 5000,
      extraHeaders: {
        Cookie: `PHPSESSID=${sessionId}`,
        Origin: allowedOrigin,
      },
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Socket connection timed out'));
    }, 7000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
  });
}

function emitWithAck(socket, eventName, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(eventName, payload, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}

async function saveMessageViaRest(sessionId, payload) {
  const response = await fetch(chatMessagesUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `PHPSESSID=${sessionId}`,
      Origin: allowedOrigin,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.success || !result.data?.message) {
    throw new Error(result.error || 'REST message persistence failed');
  }
  return result.data.message;
}

function waitForEvent(socket, eventName, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(eventName, handler);
      resolve(payload);
    };
    socket.on(eventName, handler);
  });
}

function wait(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function waitForServer(child) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child && child.exitCode !== null) {
      throw new Error(`Realtime server exited during startup (code ${child.exitCode})`);
    }
    try {
      const response = await fetch(`${realtimeUrl}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error('Realtime server did not become healthy');
}

async function loadFixture() {
  const [rows] = await pool.query(
    `SELECT msg.id AS message_id, msg.room_id, msg.graduate_id AS sender_id,
            msg.message, msg.client_message_id,
            sender_account.id AS sender_account_id,
            sender_profile.file_path AS sender_profile_image_path,
            recipient_member.graduate_id AS recipient_id,
            recipient_account.id AS recipient_account_id,
            recipient_profile.file_path AS recipient_profile_image_path
       FROM forum_chat_messages msg
       JOIN graduate_accounts sender_account
         ON sender_account.graduate_id = msg.graduate_id
        AND sender_account.status = 'active'
       JOIN forum_chat_members recipient_member
         ON recipient_member.room_id = msg.room_id
        AND recipient_member.graduate_id <> msg.graduate_id
       JOIN graduate_accounts recipient_account
         ON recipient_account.graduate_id = recipient_member.graduate_id
        AND recipient_account.status = 'active'
       LEFT JOIN graduate_profile_images sender_profile
         ON sender_profile.graduate_account_id = sender_account.id
       LEFT JOIN graduate_profile_images recipient_profile
         ON recipient_profile.graduate_account_id = recipient_account.id
       LEFT JOIN forum_chat_message_attachments attachment ON attachment.message_id = msg.id
      WHERE msg.client_message_id IS NOT NULL
        AND msg.client_message_id <> ''
        AND msg.message IS NOT NULL
        AND msg.message <> ''
        AND msg.deleted_at IS NULL
        AND attachment.id IS NULL
      ORDER BY msg.id DESC
      LIMIT 1`,
  );
  if (!rows.length) {
    throw new Error('No existing text message with client_message_id is available for a non-mutating replay test');
  }

  const fixture = rows[0];
  const [reverseRows] = await pool.query(
    `SELECT id AS message_id, message, client_message_id
       FROM forum_chat_messages
      WHERE room_id = ?
        AND graduate_id = ?
        AND client_message_id IS NOT NULL
        AND client_message_id <> ''
        AND message IS NOT NULL
        AND message <> ''
        AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT 1`,
    [fixture.room_id, fixture.recipient_id],
  );
  if (!reverseRows.length) {
    throw new Error('No reverse-direction text message is available for the bidirectional replay test');
  }
  const [outsiderRows] = await pool.query(
    `SELECT ga.id AS account_id, ga.graduate_id
       FROM graduate_accounts ga
      WHERE ga.status = 'active'
        AND NOT EXISTS (
          SELECT 1
            FROM forum_chat_members member
           WHERE member.room_id = ?
             AND member.graduate_id = ga.graduate_id
        )
      ORDER BY ga.id ASC
      LIMIT 1`,
    [fixture.room_id],
  );

  return { ...fixture, reverse: reverseRows[0], outsider: outsiderRows[0] || null };
}

async function main() {
  const fixture = await loadFixture();
  const sessions = [];
  const sockets = [];
  let server;
  let serverOutput = '';

  try {
    const senderSession = createGraduateSession(fixture.sender_account_id);
    const recipientSession = createGraduateSession(fixture.recipient_account_id);
    sessions.push(senderSession, recipientSession);
    const outsiderSession = fixture.outsider ? createGraduateSession(fixture.outsider.account_id) : null;
    if (outsiderSession) sessions.push(outsiderSession);

    if (!useExistingServer) {
      server = spawn(process.execPath, ['backend/realtime/socket-server.js'], {
        cwd: projectRoot,
        env: {
          ...process.env,
          REALTIME_PORT: String(testPort),
          REALTIME_AUTO_MIGRATE: 'false',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
      server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });
    }
    await waitForServer(server);

    const sender = await connectSocket(senderSession);
    const recipientOnline = waitForEvent(
      sender,
      'user:status',
      (payload) => Number(payload?.graduate_id) === Number(fixture.recipient_id)
        && payload?.is_online === true,
    );
    const recipient = await connectSocket(recipientSession);
    sockets.push(sender, recipient);
    await recipientOnline;
    assert(true, 'a participant receives the other participant online transition immediately');

    const presenceSnapshot = await emitWithAck(sender, 'presence:sync', {});
    const recipientPresence = presenceSnapshot.users?.find(
      (presence) => Number(presence.graduate_id) === Number(fixture.recipient_id),
    );
    assert(presenceSnapshot.success === true && recipientPresence?.is_online === true, 'presence synchronization reports already-connected participants as online');

    const recipientSecondTab = await connectSocket(recipientSession);
    sockets.push(recipientSecondTab);
    let prematureOfflineEvents = 0;
    const offlineCounter = (payload) => {
      if (Number(payload?.graduate_id) === Number(fixture.recipient_id) && payload?.is_online === false) {
        prematureOfflineEvents += 1;
      }
    };
    sender.on('user:status', offlineCounter);
    recipientSecondTab.close();
    await wait(Number(process.env.REALTIME_PRESENCE_OFFLINE_GRACE_MS || 1500) + 300);
    sender.off('user:status', offlineCounter);
    const presenceAfterOneTabClosed = await emitWithAck(sender, 'presence:sync', {});
    const stillOnline = presenceAfterOneTabClosed.users?.find(
      (presence) => Number(presence.graduate_id) === Number(fixture.recipient_id),
    );
    assert(prematureOfflineEvents === 0 && stillOnline?.is_online === true, 'closing one of multiple sockets does not mark the graduate offline');
    let outsider = null;

    const senderJoin = await emitWithAck(sender, 'conversation:join', { room_id: Number(fixture.room_id) });
    const recipientJoin = await emitWithAck(recipient, 'conversation:join', { room_id: Number(fixture.room_id) });
    assert(senderJoin.success === true && recipientJoin.success === true, 'two authenticated participants can join their conversation room');

    if (outsiderSession) {
      outsider = await connectSocket(outsiderSession);
      sockets.push(outsider);
      const outsiderJoin = await emitWithAck(outsider, 'conversation:join', { room_id: Number(fixture.room_id) });
      assert(outsiderJoin.success === false, 'an authenticated non-participant cannot join the conversation room');
      const outsiderSend = await emitWithAck(outsider, 'message:send', {
        room_id: Number(fixture.room_id),
        message: 'This must not be saved',
        client_message_id: `unauthorized-${crypto.randomUUID()}`,
        attachment_ids: [],
      });
      assert(outsiderSend.success === false, 'an authenticated non-participant cannot send to the conversation');
      const outsiderPublish = await emitWithAck(outsider, 'message:publish', {
        room_id: Number(fixture.room_id),
        message_id: Number(fixture.message_id),
      });
      assert(outsiderPublish.success === false, 'an authenticated non-participant cannot publish another conversation message');
    }

    const typingStarted = waitForEvent(
      recipient,
      'typing:update',
      (payload) => Number(payload?.room_id) === Number(fixture.room_id)
        && Number(payload?.graduate_id) === Number(fixture.sender_id)
        && payload?.is_typing === true,
    );
    const typingStartAck = await emitWithAck(sender, 'typing:start', { room_id: Number(fixture.room_id) });
    await typingStarted;
    assert(typingStartAck.success === true, 'typing:start reaches the other participant in real time');

    const typingStopped = waitForEvent(
      recipient,
      'typing:update',
      (payload) => Number(payload?.room_id) === Number(fixture.room_id)
        && Number(payload?.graduate_id) === Number(fixture.sender_id)
        && payload?.is_typing === false,
    );
    await emitWithAck(sender, 'typing:stop', { room_id: Number(fixture.room_id) });
    await typingStopped;
    assert(true, 'typing:stop clears the other participant indicator');

    const [[beforeCount]] = await pool.query(
      'SELECT COUNT(*) AS total FROM forum_chat_messages WHERE room_id = ?',
      [fixture.room_id],
    );
    let recipientEventCount = 0;
    let outsiderEventCount = 0;
    const countHandler = (payload) => {
      if (Number(payload?.message?.id) === Number(fixture.message_id)) recipientEventCount += 1;
    };
    recipient.on('message:new', countHandler);
    const outsiderCountHandler = (payload) => {
      if (Number(payload?.message?.id) === Number(fixture.message_id)) outsiderEventCount += 1;
    };
    outsider?.on('message:new', outsiderCountHandler);
    const receivedMessage = waitForEvent(
      recipient,
      'message:new',
      (payload) => Number(payload?.message?.id) === Number(fixture.message_id),
    );
    const conversationPreviewUpdated = waitForEvent(
      recipient,
      'conversation:updated',
      (payload) => Number(payload?.conversation?.id) === Number(fixture.room_id)
        && typeof payload?.conversation?.last_message === 'string'
        && Boolean(payload?.conversation?.last_message_at),
    );
    const savedMessage = await saveMessageViaRest(senderSession, {
      room_id: Number(fixture.room_id),
      message: fixture.message,
      client_message_id: fixture.client_message_id,
      attachment_ids: [],
    });
    const sendAck = await emitWithAck(sender, 'message:publish', {
      room_id: Number(fixture.room_id),
      message_id: Number(savedMessage.id),
    });
    const incoming = await receivedMessage;
    const conversationUpdate = await conversationPreviewUpdated;
    await wait(300);
    recipient.off('message:new', countHandler);
    outsider?.off('message:new', outsiderCountHandler);
    assert(Number(savedMessage.id) === Number(fixture.message_id), 'the REST API returns the canonical database message ID and timestamp');
    assert(sendAck.success === true && Number(sendAck.message?.id) === Number(fixture.message_id), 'Socket.IO publishes the REST-persisted message');
    assert(Number(incoming.message?.id) === Number(fixture.message_id), 'the recipient receives the saved message without polling');
    assert(true, 'the recipient conversation preview refreshes immediately after the saved message event');
    const realtimeSender = conversationUpdate.conversation?.participants?.find(
      (participant) => Number(participant.graduate_id) === Number(fixture.sender_id),
    );
    assert(
      (realtimeSender?.profile_image_path || null) === expectedMediaReference(fixture.sender_profile_image_path),
      'realtime conversation avatars use the same browser-safe profile image reference as the REST API',
    );
    assert(
      (incoming.message?.sender_profile_image_path || null) === expectedMediaReference(fixture.sender_profile_image_path),
      'realtime message senders use the current profile image source of truth',
    );
    assert(recipientEventCount === 1, 'a recipient in both user and conversation rooms receives no duplicate message event');
    assert(outsiderEventCount === 0, 'a non-participant receives no private message event');

    const [[afterCount]] = await pool.query(
      'SELECT COUNT(*) AS total FROM forum_chat_messages WHERE room_id = ?',
      [fixture.room_id],
    );
    assert(Number(afterCount.total) === Number(beforeCount.total), 'replaying clientMessageId is idempotent and does not insert a duplicate row');

    const senderReceivedReply = waitForEvent(
      sender,
      'message:new',
      (payload) => Number(payload?.message?.id) === Number(fixture.reverse.message_id),
    );
    const savedReply = await saveMessageViaRest(recipientSession, {
      room_id: Number(fixture.room_id),
      message: fixture.reverse.message,
      client_message_id: fixture.reverse.client_message_id,
      attachment_ids: [],
    });
    const replyAck = await emitWithAck(recipient, 'message:publish', {
      room_id: Number(fixture.room_id),
      message_id: Number(savedReply.id),
    });
    const receivedReply = await senderReceivedReply;
    assert(
      replyAck.success === true
        && Number(replyAck.message?.id) === Number(fixture.reverse.message_id)
        && Number(receivedReply.message?.id) === Number(fixture.reverse.message_id),
      'the second graduate reply reaches the first graduate immediately with the persisted message ID',
    );

    const [[afterReplyCount]] = await pool.query(
      'SELECT COUNT(*) AS total FROM forum_chat_messages WHERE room_id = ?',
      [fixture.room_id],
    );
    assert(Number(afterReplyCount.total) === Number(beforeCount.total), 'bidirectional replay remains idempotent and does not insert test data');

    const recipientOffline = waitForEvent(
      sender,
      'user:status',
      (payload) => Number(payload?.graduate_id) === Number(fixture.recipient_id)
        && payload?.is_online === false
        && Boolean(payload?.last_active_at),
      7000,
    );
    recipient.close();
    const offlinePayload = await recipientOffline;
    assert(Boolean(offlinePayload.last_active_at), 'closing the final socket broadcasts offline with a persisted last-active timestamp');
    assert(isRecentServerTimestamp(offlinePayload.last_active_at), 'last-active uses the configured database timezone without an eight-hour offset');

    const recipientBackOnline = waitForEvent(
      sender,
      'user:status',
      (payload) => Number(payload?.graduate_id) === Number(fixture.recipient_id)
        && payload?.is_online === true,
      12000,
    );
    const reconnectedRecipient = await connectSocket(recipientSession, { reconnection: true });
    sockets.push(reconnectedRecipient);
    await recipientBackOnline;
    assert(true, 'reconnecting broadcasts online without requiring the other participant to refresh');

    let falseOfflineDuringRecovery = 0;
    const recoveryPresenceCounter = (payload) => {
      if (Number(payload?.graduate_id) === Number(fixture.recipient_id) && payload?.is_online === false) {
        falseOfflineDuringRecovery += 1;
      }
    };
    sender.on('user:status', recoveryPresenceCounter);
    const transportDisconnected = waitForEvent(reconnectedRecipient, 'disconnect', () => true);
    const transportReconnected = waitForEvent(reconnectedRecipient, 'connect', () => true, 7000);
    reconnectedRecipient.io.engine.close();
    await transportDisconnected;
    await transportReconnected;
    await wait(Number(process.env.REALTIME_PRESENCE_OFFLINE_GRACE_MS || 1500) + 300);
    sender.off('user:status', recoveryPresenceCounter);
    assert(reconnectedRecipient.connected, 'temporary transport loss reconnects automatically');
    assert(falseOfflineDuringRecovery === 0, 'automatic transport recovery does not broadcast a false offline transition');

    const rejoinedAfterRecovery = await emitWithAck(reconnectedRecipient, 'conversation:join', { room_id: Number(fixture.room_id) });
    const typingAfterRecovery = waitForEvent(
      sender,
      'typing:update',
      (payload) => Number(payload?.room_id) === Number(fixture.room_id)
        && Number(payload?.graduate_id) === Number(fixture.recipient_id)
        && payload?.is_typing === true,
    );
    await emitWithAck(reconnectedRecipient, 'typing:start', { room_id: Number(fixture.room_id) });
    await typingAfterRecovery;
    const refreshedTypingAfterRecovery = waitForEvent(
      sender,
      'typing:update',
      (payload) => Number(payload?.room_id) === Number(fixture.room_id)
        && Number(payload?.graduate_id) === Number(fixture.recipient_id)
        && payload?.is_typing === true,
    );
    await wait(1100);
    await emitWithAck(reconnectedRecipient, 'typing:start', { room_id: Number(fixture.room_id) });
    await refreshedTypingAfterRecovery;
    await emitWithAck(reconnectedRecipient, 'typing:stop', { room_id: Number(fixture.room_id) });
    assert(rejoinedAfterRecovery.success === true, 'reconnected clients can rejoin the active conversation room');
    assert(true, 'typing resumes and refreshes after transport recovery without restarting either client');

    const recipientOtherDeviceSession = createGraduateSession(fixture.recipient_account_id);
    sessions.push(recipientOtherDeviceSession);
    const recipientOtherDevice = await connectSocket(recipientOtherDeviceSession);
    sockets.push(recipientOtherDevice);

    let falseOfflineDuringSessionLogout = 0;
    const sessionLogoutPresenceCounter = (payload) => {
      if (Number(payload?.graduate_id) === Number(fixture.recipient_id) && payload?.is_online === false) {
        falseOfflineDuringSessionLogout += 1;
      }
    };
    sender.on('user:status', sessionLogoutPresenceCounter);
    const loggedOutSocketDisconnected = waitForEvent(reconnectedRecipient, 'disconnect', () => true);
    const sessionLogoutAck = await emitWithAck(reconnectedRecipient, 'session:logout', {});
    await loggedOutSocketDisconnected;
    await wait(300);
    const presenceAfterOneSessionLoggedOut = await emitWithAck(sender, 'presence:sync', {});
    const onlineOnOtherDevice = presenceAfterOneSessionLoggedOut.users?.find(
      (presence) => Number(presence.graduate_id) === Number(fixture.recipient_id),
    );
    sender.off('user:status', sessionLogoutPresenceCounter);
    assert(sessionLogoutAck.success === true, 'logout tells the realtime backend to disconnect the authenticated PHP session');
    assert(falseOfflineDuringSessionLogout === 0 && onlineOnOtherDevice?.is_online === true, 'logging out one session keeps the graduate online while another device remains connected');

    const offlineAfterFinalDevice = waitForEvent(
      sender,
      'user:status',
      (payload) => Number(payload?.graduate_id) === Number(fixture.recipient_id)
        && payload?.is_online === false
        && Boolean(payload?.last_active_at),
      7000,
    );
    recipientOtherDevice.close();
    const finalOfflinePayload = await offlineAfterFinalDevice;
    assert(true, 'the final active session going away broadcasts offline with a new last-active timestamp');
    assert(isRecentServerTimestamp(finalOfflinePayload.last_active_at), 'session logout persists a current last-active value in the configured timezone');
  } catch (error) {
    if (serverOutput.trim()) console.error(serverOutput.trim());
    throw error;
  } finally {
    sockets.forEach((socket) => socket.close());
    if (server && server.exitCode === null) server.kill();
    sessions.forEach(destroyGraduateSession);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
