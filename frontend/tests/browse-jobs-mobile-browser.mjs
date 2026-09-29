import assert from 'node:assert/strict';

const debugOrigin = process.env.CHROME_DEBUG_ORIGIN || 'http://127.0.0.1:9222';
const portalUrl = process.env.GRADTRACK_PORTAL_URL || 'http://127.0.0.1:5173/graduate/portal?tab=jobs';
const sessionCookieName = process.env.GRADTRACK_SESSION_COOKIE_NAME;
const sessionCookieValue = process.env.GRADTRACK_SESSION_COOKIE_VALUE;

assert.ok(sessionCookieName, 'GRADTRACK_SESSION_COOKIE_NAME is required');
assert.ok(sessionCookieValue, 'GRADTRACK_SESSION_COOKIE_VALUE is required');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForTarget() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${debugOrigin}/json/list`);
      const targets = await response.json();
      const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
      if (target) return target;
    } catch {
      // Chrome may still be starting.
    }
    await delay(200);
  }
  throw new Error('Unable to connect to the Chrome debugging endpoint');
}

const target = await waitForTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const consoleErrors = [];
let commandId = 0;

socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }

  if (message.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(message.params?.exceptionDetails?.text || 'Uncaught browser exception');
  }

  if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
    consoleErrors.push(
      (message.params.args || []).map((argument) => argument.value || argument.description || '').join(' ')
    );
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

function command(method, params = {}) {
  commandId += 1;
  return new Promise((resolve, reject) => {
    pending.set(commandId, { resolve, reject });
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  }
  return result.result?.value;
}

async function waitForJobCard() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('View Details'));
      return Boolean(button?.closest('article'));
    })()`);
    if (ready) return;
    await delay(250);
  }
  const diagnostic = await evaluate(`({
    href: location.href,
    text: document.body.innerText.slice(0, 1000),
  })`);
  throw new Error(`Browse Jobs did not render a job card: ${JSON.stringify(diagnostic)}`);
}

await command('Runtime.enable');
await command('Log.enable');
await command('Network.enable');
await command('Network.setCookie', {
  name: sessionCookieName,
  value: sessionCookieValue,
  url: 'http://127.0.0.1/GradTrack/backend/',
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
});
await command('Emulation.setDeviceMetricsOverride', {
  width: 360,
  height: 800,
  deviceScaleFactor: 1,
  mobile: true,
});
await command('Page.navigate', { url: portalUrl });
await waitForJobCard();

await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('View Details'));
  const card = button.closest('article');
  const title = card.querySelector('h3');
  if (title) title.textContent = 'Senior Full Stack Software Development and Enterprise Integration Specialist for International Platforms';
  const company = card.querySelector('svg + span');
  if (company) company.textContent = 'A Very Long International Aviation Technology and Digital Transformation Company Name';
  const chips = card.querySelectorAll('[class*="rounded-2xl"][class*="bg-[#f8fbff]"]');
  if (chips[0]?.lastElementChild) chips[0].lastElementChild.textContent = 'Taguig, National Capital Region, Philippines with an exceptionally long office location description';
  const applyHeading = [...card.querySelectorAll('p')].find((item) => item.textContent?.trim().toLowerCase() === 'how to apply');
  if (applyHeading?.parentElement) {
    const stressValue = document.createElement('p');
    stressValue.dataset.mobileStressValue = 'true';
    stressValue.className = 'w-full min-w-0 whitespace-pre-line break-words text-slate-600 [overflow-wrap:anywhere]';
    stressValue.textContent = 'https://careers.example.invalid/applications/this-is-an-intentionally-very-long-url-segment-without-natural-spaces-or-short-breakpoints';
    applyHeading.parentElement.append(stressValue);
  }
  return true;
})()`);

const widths = [320, 360, 375, 390, 412, 430];
for (const width of widths) {
  await command('Emulation.setDeviceMetricsOverride', {
    width,
    height: 800,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(100);

  const layout = await evaluate(`(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const buttons = [...document.querySelectorAll('button')].filter((item) => item.textContent?.includes('View Details'));
    const card = buttons.at(-1)?.closest('article');
    const button = buttons.at(-1);
    const badge = card ? [...card.querySelectorAll('span')].find((item) => /internship|employment|full.?time|part.?time/i.test(item.textContent || '')) : null;
    const nav = [...document.querySelectorAll('nav')].find((item) => getComputedStyle(item).position === 'fixed' && item.getBoundingClientRect().bottom >= innerHeight - 1);
    const stressValue = document.querySelector('[data-mobile-stress-value="true"]');
    const rect = (element) => element ? element.getBoundingClientRect().toJSON() : null;
    return {
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      card: rect(card),
      button: rect(button),
      badge: rect(badge),
      nav: rect(nav),
      stressValue: rect(stressValue),
      stressScrollWidth: stressValue?.scrollWidth || 0,
      stressClientWidth: stressValue?.clientWidth || 0,
    };
  })()`);

  assert.ok(layout.card, `${width}px: a job card is visible`);
  assert.equal(layout.documentWidth, layout.viewportWidth, `${width}px: document has no horizontal overflow`);
  assert.ok(layout.bodyWidth <= layout.viewportWidth, `${width}px: body has no horizontal overflow`);
  assert.ok(layout.card.left >= -0.5 && layout.card.right <= layout.viewportWidth + 0.5, `${width}px: card stays inside the viewport`);
  assert.ok(layout.button.left >= layout.card.left && layout.button.right <= layout.card.right + 0.5, `${width}px: View Details stays inside the card`);
  assert.ok(!layout.badge || layout.badge.right <= layout.card.right + 0.5, `${width}px: employment type badge stays inside the card`);
  assert.ok(!layout.stressValue || layout.stressValue.right <= layout.card.right + 0.5, `${width}px: long application URL stays inside the card`);
  assert.ok(layout.stressScrollWidth <= layout.stressClientWidth + 1, `${width}px: long application URL wraps safely`);
  assert.ok(
    !layout.nav || layout.button.bottom <= layout.nav.top + 0.5,
    `${width}px: bottom navigation does not cover the final View Details button (${JSON.stringify(layout)})`
  );
}

await delay(500);
assert.deepEqual(consoleErrors, [], `browser console errors: ${consoleErrors.join(' | ')}`);
socket.close();

console.log(`Browse Jobs mobile browser checks passed at ${widths.join(', ')}px with no console errors.`);
