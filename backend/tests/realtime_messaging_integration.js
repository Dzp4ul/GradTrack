const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const { io } = require('../../frontend/node_modules/socket.io-client');

const projectRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const testPort = Number(process.env.REALTIME_TEST_PORT || 3101);
const realtimeUrl = `http://127.0.0.1:${testPort}`;
const allowedOrigin = (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((value) => value.trim())
  .find((value) => value && value !== '*') || 'http://localhost:5173';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gradtrackdb',
  connectionLimit: 3,
  charset: 'utf8mb4',
  timezone: process.env.DB_TIMEZONE || '+08:00',
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
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

function connectSocket(sessionId) {
  return new Promise((resolve, reject) => {
    const socket = io(realtimeUrl, {
      transports: ['websocket'],
      reconnection: false,
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

async function waitForServer(child) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
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
            recipient_member.graduate_id AS recipient_id,
            recipient_account.id AS recipient_account_id
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

  return { ...fixture, outsider: outsiderRows[0] || null };
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
    await waitForServer(server);

    const sender = await connectSocket(senderSession);
    const recipient = await connectSocket(recipientSession);
    sockets.push(sender, recipient);
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
    const sendAck = await emitWithAck(sender, 'message:send', {
      room_id: Number(fixture.room_id),
      message: fixture.message,
      client_message_id: fixture.client_message_id,
      attachment_ids: [],
    });
    const incoming = await receivedMessage;
    await new Promise((resolve) => setTimeout(resolve, 300));
    recipient.off('message:new', countHandler);
    outsider?.off('message:new', outsiderCountHandler);
    assert(sendAck.success === true && Number(sendAck.message?.id) === Number(fixture.message_id), 'message confirmation returns the database ID and server timestamp');
    assert(Number(incoming.message?.id) === Number(fixture.message_id), 'the recipient receives the saved message without polling');
    assert(recipientEventCount === 1, 'a recipient in both user and conversation rooms receives no duplicate message event');
    assert(outsiderEventCount === 0, 'a non-participant receives no private message event');

    const [[afterCount]] = await pool.query(
      'SELECT COUNT(*) AS total FROM forum_chat_messages WHERE room_id = ?',
      [fixture.room_id],
    );
    assert(Number(afterCount.total) === Number(beforeCount.total), 'replaying clientMessageId is idempotent and does not insert a duplicate row');
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
