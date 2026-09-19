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
  if (!value) throw new Error(`${name} is required for the realtime portal integration test`);
  return value;
}

function requiredEnvAny(names, label) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  throw new Error(`${label} is required for the realtime portal integration test`);
}

function normalizedDbHost() {
  const host = requiredEnv('DB_HOST').replace(/^["']|["']$/g, '');
  if (/^https?:\/\//i.test(host) || /:\d+$/.test(host) || /\s|\//.test(host)) {
    throw new Error('DB_HOST must be a hostname only');
  }
  return host;
}

const testPort = Number(process.env.REALTIME_PORTAL_TEST_PORT || 3102);
const testPhpPort = Number(process.env.REALTIME_PORTAL_PHP_TEST_PORT || 8102);
const realtimeUrl = `http://127.0.0.1:${testPort}`;
const publishUrl = `${realtimeUrl}/internal/publish`;
const publishSecret = 'gradtrack-realtime-portal-test-secret';
const apiBaseUrl = `http://127.0.0.1:${testPhpPort}/backend`;
const csrfUrl = `${apiBaseUrl}/api/csrf.php`;
const jobsUrl = `${apiBaseUrl}/api/jobs/posts.php`;
const allowedOrigin = (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((value) => value.trim())
  .find((value) => value && value !== '*') || 'http://localhost:5173';
const sessionCookieName = String(process.env.SESSION_COOKIE_NAME || process.env.PHP_SESSION_COOKIE_NAME || 'GRADTRACKSESSID').trim() || 'GRADTRACKSESSID';

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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createGraduateSession(accountId) {
  return createSession('graduate_account_id', accountId, 'gradtrack-portal-test');
}

function createAdminSession(adminId) {
  return createSession('admin_user_id', adminId, 'gradtrack-admin-job-test');
}

function createSession(sessionKey, identityId, prefix) {
  const sessionId = `${prefix}-${crypto.randomBytes(18).toString('hex')}`;
  const php = [
    "require 'backend/api/config/session.php';",
    "ini_set('session.use_strict_mode', '0');",
    `session_id('${sessionId}');`,
    'session_start();',
    `$_SESSION['${sessionKey}'] = ${Number(identityId)};`,
    'session_write_close();',
  ].join(' ');
  const result = spawnSync('php', ['-r', php], { cwd: projectRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Unable to create PHP test session: ${result.stderr || result.stdout}`);
  return sessionId;
}

async function csrfTokenForSession(sessionId) {
  const response = await fetch(csrfUrl, {
    headers: {
      Accept: 'application/json',
      Cookie: `${sessionCookieName}=${sessionId}`,
      Origin: allowedOrigin,
    },
  });
  const payload = await response.json();
  const token = String(payload?.csrf_token || '');
  if (!response.ok || !token) throw new Error(payload?.error || 'Unable to establish a CSRF token');
  return token;
}

async function apiRequest(url, sessionId, method = 'GET', payload) {
  const headers = {
    Accept: 'application/json',
    Cookie: `${sessionCookieName}=${sessionId}`,
    Origin: allowedOrigin,
  };
  if (!['GET', 'HEAD'].includes(method)) {
    headers['Content-Type'] = 'application/json';
    headers['X-CSRF-Token'] = await csrfTokenForSession(sessionId);
  }
  const response = await fetch(url, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const result = await response.json().catch(() => ({}));
  return { response, result };
}

function destroyGraduateSession(sessionId) {
  if (!sessionId) return;
  const php = [
    "require 'backend/api/config/session.php';",
    "ini_set('session.use_strict_mode', '0');",
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
        Cookie: `${sessionCookieName}=${sessionId}`,
        Origin: allowedOrigin,
      },
    });
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Socket connection timed out'));
    }, 7000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      socket.close();
      reject(error);
    });
  });
}

function waitForEvent(socket, eventName, predicate = () => true, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      socket.off(eventName, handler);
      resolve(payload);
    };
    socket.on(eventName, handler);
  });
}

function emitWithAck(socket, eventName, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(eventName, payload, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

function mutation(entity, action, entityId, context = {}) {
  return {
    event_id: crypto.randomUUID(),
    entity,
    action,
    entity_id: Number(entityId),
    context,
    occurred_at: new Date().toISOString(),
  };
}

async function publishMutation(payload, validSignature = true) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = validSignature
    ? crypto.createHmac('sha256', publishSecret).update(`${timestamp}.${body}`).digest('hex')
    : 'invalid';
  return fetch(publishUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GradTrack-Timestamp': timestamp,
      'X-GradTrack-Signature': signature,
    },
    body,
  });
}

async function waitForServer(server) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) throw new Error('Realtime server exited before becoming ready');
    try {
      const response = await fetch(`${realtimeUrl}/health`);
      if (response.ok) return;
    } catch {
      // Server startup is still in progress.
    }
    await wait(200);
  }
  throw new Error('Realtime server did not become ready');
}

async function waitForPhpServer(server) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) throw new Error('PHP test server exited before becoming ready');
    try {
      const response = await fetch(`${apiBaseUrl}/api/graduate-auth/check.php`);
      if (response.ok) return;
    } catch {
      // Server startup is still in progress.
    }
    await wait(200);
  }
  throw new Error('PHP test server did not become ready');
}

async function main() {
  const sessions = [];
  const sockets = [];
  const fixtureIds = { post: 0, comment: 0, announcement: 0, job: 0, admin: 0 };
  let server;
  let phpServer;
  let serverOutput = '';
  let phpServerOutput = '';

  try {
    const [graduateRows] = await pool.query(
      `SELECT ga.id AS account_id, ga.graduate_id
         FROM graduate_accounts ga
         JOIN graduates g ON g.id = ga.graduate_id
        WHERE ga.status = 'active'
          AND ga.alumni_verification_status = 'approved'
          AND g.status = 'active'
        ORDER BY ga.id
        LIMIT 2`,
    );
    if (graduateRows.length < 2) throw new Error('Two active approved graduate accounts are required');
    const [actor, viewer] = graduateRows;

    const actorSession = createGraduateSession(actor.account_id);
    const viewerSession = createGraduateSession(viewer.account_id);
    sessions.push(actorSession, viewerSession);

    phpServer = spawn('php', ['-S', `127.0.0.1:${testPhpPort}`, '-t', projectRoot], {
      cwd: projectRoot,
      env: {
        ...process.env,
        REALTIME_PORT: String(testPort),
        REALTIME_PUBLISH_URL: publishUrl,
        REALTIME_PUBLISH_SECRET: publishSecret,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    phpServer.stdout.on('data', (chunk) => { phpServerOutput += chunk.toString(); });
    phpServer.stderr.on('data', (chunk) => { phpServerOutput += chunk.toString(); });
    await waitForPhpServer(phpServer);

    server = spawn(process.execPath, ['backend/realtime/socket-server.js'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        REALTIME_PORT: String(testPort),
        REALTIME_AUTO_MIGRATE: 'false',
        REALTIME_PUBLISH_SECRET: publishSecret,
        GRADTRACK_API_BASE_URL: apiBaseUrl,
        REALTIME_AUTH_CHECK_URL: `${apiBaseUrl}/api/graduate-auth/check.php`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
    server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });
    await waitForServer(server);

    const unauthorizedPublish = await publishMutation(mutation('profile', 'updated', actor.graduate_id), false);
    assert(unauthorizedPublish.status === 401, 'the internal publisher rejects an invalid HMAC signature');

    let unauthenticatedRejected = false;
    try {
      await connectSocket('missing-session');
    } catch {
      unauthenticatedRejected = true;
    }
    assert(unauthenticatedRejected, 'an unauthenticated socket cannot join the Graduate Portal audience');

    const actorSocket = await connectSocket(actorSession);
    const viewerSocket = await connectSocket(viewerSession);
    sockets.push(actorSocket, viewerSocket);

    const suffix = crypto.randomBytes(6).toString('hex');
    const [postInsert] = await pool.query(
      `INSERT INTO forum_posts (graduate_id, title, content, category, status)
       VALUES (?, ?, ?, 'General Discussion', 'approved')`,
      [actor.graduate_id, `Realtime Portal ${suffix}`, 'Persisted community post body'],
    );
    fixtureIds.post = Number(postInsert.insertId);
    const postMutation = mutation('forum_post', 'created', fixtureIds.post, { actor_graduate_id: actor.graduate_id });
    let viewerPostEvents = 0;
    viewerSocket.on('community:post-created', (payload) => {
      if (Number(payload?.post?.id) === fixtureIds.post) viewerPostEvents += 1;
    });
    const actorPostEvent = waitForEvent(actorSocket, 'community:post-created', (payload) => Number(payload?.post?.id) === fixtureIds.post);
    const viewerPostEvent = waitForEvent(viewerSocket, 'community:post-created', (payload) => Number(payload?.post?.id) === fixtureIds.post);
    const postPublishResponse = await publishMutation(postMutation);
    const [, viewerPost] = await Promise.all([actorPostEvent, viewerPostEvent]);
    assert(postPublishResponse.status === 202 && viewerPost.post.title === `Realtime Portal ${suffix}`, 'a persisted community post reaches connected graduates with canonical database data');
    await publishMutation(postMutation);
    await wait(250);
    assert(viewerPostEvents === 1, 'replaying the same mutation event does not duplicate a community post');

    const threadJoin = await emitWithAck(viewerSocket, 'community:thread:join', { post_id: fixtureIds.post });
    assert(threadJoin.success === true, 'an authenticated graduate viewing a published thread can subscribe to its comments');
    const [commentInsert] = await pool.query(
      'INSERT INTO forum_comments (post_id, graduate_id, comment, status) VALUES (?, ?, ?, \'approved\')',
      [fixtureIds.post, actor.graduate_id, 'Persisted realtime comment'],
    );
    fixtureIds.comment = Number(commentInsert.insertId);
    const commentMutation = mutation('forum_comment', 'created', fixtureIds.comment, { post_id: fixtureIds.post, actor_graduate_id: actor.graduate_id });
    let viewerCommentEvents = 0;
    viewerSocket.on('community:comment-created', (payload) => {
      if (Number(payload?.comment?.id) === fixtureIds.comment) viewerCommentEvents += 1;
    });
    const commentEvent = waitForEvent(viewerSocket, 'community:comment-created', (payload) => Number(payload?.comment?.id) === fixtureIds.comment);
    const countEvent = waitForEvent(actorSocket, 'community:comment-count', (payload) => Number(payload?.post_id) === fixtureIds.post && Number(payload?.comment_count) === 1);
    await publishMutation(commentMutation);
    const [commentPayload] = await Promise.all([commentEvent, countEvent]);
    assert(commentPayload.comment.comment === 'Persisted realtime comment' && Number(commentPayload.comment_count) === 1, 'a persisted comment and its authoritative count reach the active thread');
    await publishMutation(commentMutation);
    await wait(250);
    assert(viewerCommentEvents === 1, 'replaying the same mutation event does not duplicate a comment');

    await pool.query('INSERT INTO forum_post_likes (post_id, graduate_id) VALUES (?, ?)', [fixtureIds.post, actor.graduate_id]);
    const likedEvent = waitForEvent(viewerSocket, 'community:reaction-updated', (payload) => Number(payload?.post_id) === fixtureIds.post && Number(payload?.like_count) === 1);
    await publishMutation(mutation('forum_reaction', 'updated', fixtureIds.post, { actor_graduate_id: actor.graduate_id }));
    const likedPayload = await likedEvent;
    assert(likedPayload.actor_liked === true, 'reaction updates use the database count and actor state');
    await pool.query('DELETE FROM forum_post_likes WHERE post_id = ? AND graduate_id = ?', [fixtureIds.post, actor.graduate_id]);
    const unlikedEvent = waitForEvent(viewerSocket, 'community:reaction-updated', (payload) => Number(payload?.post_id) === fixtureIds.post && Number(payload?.like_count) === 0);
    await publishMutation(mutation('forum_reaction', 'updated', fixtureIds.post, { actor_graduate_id: actor.graduate_id }));
    const unlikedPayload = await unlikedEvent;
    assert(unlikedPayload.actor_liked === false, 'reaction removal broadcasts the authoritative zero count');

    await Promise.all([
      pool.query('INSERT INTO forum_post_likes (post_id, graduate_id) VALUES (?, ?)', [fixtureIds.post, actor.graduate_id]),
      pool.query('INSERT INTO forum_post_likes (post_id, graduate_id) VALUES (?, ?)', [fixtureIds.post, viewer.graduate_id]),
    ]);
    const concurrentReactionEvent = waitForEvent(
      viewerSocket,
      'community:reaction-updated',
      (payload) => Number(payload?.post_id) === fixtureIds.post && Number(payload?.like_count) === 2,
    );
    await Promise.all([
      publishMutation(mutation('forum_reaction', 'updated', fixtureIds.post, { actor_graduate_id: actor.graduate_id })),
      publishMutation(mutation('forum_reaction', 'updated', fixtureIds.post, { actor_graduate_id: viewer.graduate_id })),
    ]);
    await concurrentReactionEvent;
    assert(true, 'concurrent reactions converge on the exact database aggregate');
    await pool.query('DELETE FROM forum_post_likes WHERE post_id = ?', [fixtureIds.post]);

    const profileEvent = waitForEvent(viewerSocket, 'profile:updated', (payload) => Number(payload?.profile?.graduate_id) === Number(actor.graduate_id));
    await publishMutation(mutation('profile', 'updated', actor.graduate_id, { actor_graduate_id: actor.graduate_id }));
    const profilePayload = await profileEvent;
    assert(Boolean(profilePayload.profile.full_name), 'profile updates broadcast only a canonical public profile summary');

    const [adminInsert] = await pool.query(
      `INSERT INTO admin_users (username, email, password, full_name, role, is_active)
       VALUES (?, ?, ?, 'Realtime Test Alumni Admin', 'alumni_admin', 1)`,
      [`rt_admin_${suffix}`, `rt_admin_${suffix}@example.test`, crypto.randomBytes(24).toString('hex')],
    );
    fixtureIds.admin = Number(adminInsert.insertId);
    const adminSession = createAdminSession(fixtureIds.admin);
    sessions.push(adminSession);

    const [announcementInsert] = await pool.query(
      `INSERT INTO announcements (created_by_admin_id, title, summary, content, category, status, published_at)
       VALUES (?, ?, 'Realtime summary', 'Realtime announcement content', 'general', 'published', NOW())`,
      [fixtureIds.admin, `Realtime Announcement ${suffix}`],
    );
    fixtureIds.announcement = Number(announcementInsert.insertId);
    const announcementEvent = waitForEvent(viewerSocket, 'announcements:created', (payload) => Number(payload?.announcement?.id) === fixtureIds.announcement);
    await publishMutation(mutation('announcement', 'created', fixtureIds.announcement, { actor_type: 'admin', actor_id: fixtureIds.admin }));
    const announcementPayload = await announcementEvent;
    assert(announcementPayload.announcement.title === `Realtime Announcement ${suffix}` && Number(announcementPayload.total) > 0, 'a published Alumni Admin announcement reaches logged-in graduates with list counters');
    await pool.query("UPDATE announcements SET status = 'archived' WHERE id = ?", [fixtureIds.announcement]);
    const announcementRemoved = waitForEvent(viewerSocket, 'announcements:removed', (payload) => Number(payload?.announcement_id) === fixtureIds.announcement);
    await publishMutation(mutation('announcement', 'updated', fixtureIds.announcement, { actor_type: 'admin', actor_id: fixtureIds.admin }));
    await announcementRemoved;
    assert(true, 'archiving an announcement removes it from connected Graduate Portal clients');

    const jobPayload = {
      title: `Realtime Job ${suffix}`,
      company: 'GradTrack Test Company',
      location: 'Manila',
      salary_range: 'PHP 40,000 - 60,000',
      job_type: 'full_time',
      industry: 'Technology',
      description: 'Persisted realtime job description',
      qualifications: 'Degree required',
      required_skills: 'React, TypeScript, PHP',
      course_program_fit: 'All programs',
      application_deadline: null,
      contact_email: 'jobs@example.test',
      application_link: null,
      application_method: 'Email your resume',
      is_active: true,
    };
    const jobCreated = waitForEvent(viewerSocket, 'jobs:created', (payload) => payload?.job?.title === jobPayload.title);
    const createJobResponse = await apiRequest(jobsUrl, adminSession, 'POST', jobPayload);
    fixtureIds.job = Number(createJobResponse.result?.data?.id || 0);
    const createdJobPayload = await jobCreated;
    assert(
      createJobResponse.response.status === 200
        && createJobResponse.result?.success === true
        && fixtureIds.job > 0
        && createdJobPayload.job.title === `Realtime Job ${suffix}`
        && createdJobPayload.job.company === 'GradTrack Test Company'
        && createdJobPayload.job.required_skills === 'React, TypeScript, PHP',
      'the Alumni Admin API saves and publishes a job to connected Browse Jobs clients',
    );
    const jobUpdated = waitForEvent(viewerSocket, 'jobs:updated', (payload) => Number(payload?.job?.id) === fixtureIds.job);
    const updateJobResponse = await apiRequest(jobsUrl, adminSession, 'PUT', {
      ...jobPayload,
      id: fixtureIds.job,
      title: `Realtime Job Updated ${suffix}`,
    });
    const updatedJobPayload = await jobUpdated;
    assert(
      updateJobResponse.response.ok
        && Number(updateJobResponse.result?.data?.id) === fixtureIds.job
        && updatedJobPayload.job.title === `Realtime Job Updated ${suffix}`,
      'editing through the Alumni Admin API broadcasts an update for the existing job ID',
    );
    const jobRemoved = waitForEvent(viewerSocket, 'jobs:removed', (payload) => Number(payload?.job_id) === fixtureIds.job);
    const archiveJobResponse = await apiRequest(jobsUrl, adminSession, 'PUT', {
      ...jobPayload,
      id: fixtureIds.job,
      title: `Realtime Job Updated ${suffix}`,
      is_active: false,
    });
    await jobRemoved;
    assert(archiveJobResponse.response.ok && Number(archiveJobResponse.result?.data?.is_active) === 0, 'archiving through the Alumni Admin API removes the job from connected Browse Jobs clients');
    const deleteJobResponse = await apiRequest(jobsUrl, adminSession, 'DELETE', { id: fixtureIds.job });
    const [[deletedJob]] = await pool.query('SELECT COUNT(*) AS total FROM job_posts WHERE id = ?', [fixtureIds.job]);
    assert(deleteJobResponse.response.ok && Number(deletedJob.total) === 0, 'the Alumni Admin can permanently remove an owned job posting');
    fixtureIds.job = 0;

    await pool.query('DELETE FROM forum_comments WHERE id = ?', [fixtureIds.comment]);
    fixtureIds.comment = 0;
    await pool.query('DELETE FROM forum_posts WHERE id = ?', [fixtureIds.post]);
    const postRemoved = waitForEvent(viewerSocket, 'community:post-deleted', (payload) => Number(payload?.post_id) === fixtureIds.post);
    await publishMutation(mutation('forum_post', 'deleted', fixtureIds.post, { actor_graduate_id: actor.graduate_id }));
    await postRemoved;
    assert(true, 'deleting a community post removes it from connected feeds');
    fixtureIds.post = 0;

    console.log('Realtime Graduate Portal integration test passed.');
  } catch (error) {
    if (serverOutput.trim()) console.error(serverOutput.trim());
    if (phpServerOutput.trim()) console.error(phpServerOutput.trim());
    throw error;
  } finally {
    sockets.forEach((socket) => socket.close());
    sessions.forEach(destroyGraduateSession);
    if (fixtureIds.comment) await pool.query('DELETE FROM forum_comments WHERE id = ?', [fixtureIds.comment]).catch(() => undefined);
    if (fixtureIds.post) await pool.query('DELETE FROM forum_posts WHERE id = ?', [fixtureIds.post]).catch(() => undefined);
    if (fixtureIds.job) await pool.query('DELETE FROM job_posts WHERE id = ?', [fixtureIds.job]).catch(() => undefined);
    if (fixtureIds.announcement) await pool.query('DELETE FROM announcements WHERE id = ?', [fixtureIds.announcement]).catch(() => undefined);
    if (fixtureIds.admin) await pool.query('DELETE FROM admin_users WHERE id = ?', [fixtureIds.admin]).catch(() => undefined);
    if (server && server.exitCode === null) server.kill();
    if (phpServer && phpServer.exitCode === null) phpServer.kill();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Realtime Graduate Portal integration test failed: ${error.message}`);
  process.exitCode = 1;
});
