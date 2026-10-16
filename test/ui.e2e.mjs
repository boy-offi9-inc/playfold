// Real-browser test of the default player UI inside a cross-origin iframe, driven by the Playfold client.
// Needs dist/playfold.global.js and dist/playfold-ui.global.js, plus Playwright with Chromium.
// Run: npm run build && node test/ui.e2e.mjs      (set SHOTS=/some/dir to save screenshots)
import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const read = (name) => readFileSync(fileURLToPath(new URL(`../dist/${name}`, import.meta.url)));
const sdk = read('playfold.global.js');
const ui = read('playfold-ui.global.js');
const { chromium } = await import('playwright');

function wav(seconds = 6, rate = 8000) {
  const n = seconds * rate;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), 44 + i * 2);
  return b;
}
const audio = wav();

const exampleSource = readFileSync(fileURLToPath(new URL('../examples/player.html', import.meta.url)), 'utf8');
const example = exampleSource.replace(/https:\/\/cdn\.jsdelivr\.net\/[^"]*playfold-ui\.global\.js/, '/ui.js');
assert.notEqual(example, exampleSource, 'example page should load the UI from the CDN');

const PLAYER_PORT = 4202;
const HOST_PORT = 4201;
const PLAYER_ORIGIN = `http://127.0.0.1:${PLAYER_PORT}`;
const HOST_ORIGIN = `http://127.0.0.1:${HOST_PORT}`;
const TITLE = 'Night <img src=x onerror=window.__pwned=1> Drive';

// Chromium only allows seeking when the server honours Range requests.
function ranged(req, res, body, type) {
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (!m) return res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': body.length }).end(body);
  const start = Number(m[1] || 0);
  const end = m[2] ? Number(m[2]) : body.length - 1;
  return res
    .writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${body.length}`, 'content-length': end - start + 1 })
    .end(body.subarray(start, end + 1));
}
const portrait = readFileSync(fileURLToPath(new URL('./fixtures/portrait.webm', import.meta.url)));

const playerServer = http.createServer((req, res) => {
  const url = new URL(req.url, PLAYER_ORIGIN);
  if (url.pathname === '/ui.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(ui);
  if (url.pathname === '/a.wav') return ranged(req, res, audio, 'audio/wav');
  if (url.pathname === '/portrait.webm') return ranged(req, res, portrait, 'video/webm');
  if (url.pathname === '/example') return res.writeHead(200, { 'content-type': 'text/html' }).end(example);
  if (url.pathname === '/player') {
    const theme = url.searchParams.get('theme') || 'dark';
    const src = url.searchParams.get('src') || '/a.wav';
    return res.writeHead(200, { 'content-type': 'text/html' }).end(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<body style="margin:0;background:transparent"><div id="p"></div><script src="/ui.js"></script><script>` +
        `window.ui = PlayfoldUI.mountPlayer('#p', { src: ${JSON.stringify(src)}, title: ${JSON.stringify(TITLE)}, subtitle: 'C Bwoy', eyebrow: 'Fulani Sounds', theme: ${JSON.stringify(theme)}, preload: 'auto' });` +
        `</script>`,
    );
  }
  res.writeHead(404).end();
});

const hostServer = http.createServer((req, res) => {
  const url = new URL(req.url, HOST_ORIGIN);
  if (url.pathname === '/sdk.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(sdk);
  res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><body><div id="one"></div><script src="/sdk.js"></script>');
});

await Promise.all([playerServer, hostServer].map((s, i) => new Promise((r) => s.listen(i ? HOST_PORT : PLAYER_PORT, '127.0.0.1', r))));

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});
let failed = false;
const shot = async (page, name) => {
  if (!process.env.SHOTS) return;
  mkdirSync(process.env.SHOTS, { recursive: true });
  await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 260 } });
  await page.goto(HOST_ORIGIN);
  await page.evaluate((origin) => {
    window.pf = Playfold.createPlayer(document.getElementById('one'), { baseUrl: origin, path: '/player', height: 150 });
    window.events = [];
    for (const n of ['play', 'pause']) window.pf.on(n, () => window.events.push(n));
    return window.pf.ready;
  }, PLAYER_ORIGIN);
  const frame = page.frameLocator('iframe.playfold-frame');
  await frame.locator('.pf-root').waitFor();

  // 1. renders text safely and shows the initial state
  assert.equal(await frame.locator('.pf-title').textContent(), TITLE);
  assert.equal(await frame.locator('.pf-title img').count(), 0);
  assert.equal(await frame.locator('.pf-eyebrow').textContent(), 'Fulani Sounds');
  assert.equal(await frame.locator('.pf-play').getAttribute('aria-label'), 'Play');
  await frame.locator('.pf-time[data-end]').filter({ hasText: '0:06' }).waitFor();
  console.log('ok  renders safely, shows title, eyebrow, duration 0:06');

  // 2. the client controls the UI, and the UI reflects it
  await page.evaluate(() => window.pf.play());
  await frame.locator('.pf-play[aria-label="Pause"]').waitFor();
  await page.waitForTimeout(1400);
  const timeText = await frame.locator('.pf-time').first().textContent();
  assert.notEqual(timeText, '0:00', 'elapsed time should advance');
  await shot(page, 'dark-playing');
  console.log('ok  client play() flips the button to Pause and the clock advances');

  // 3. clicking the UI controls the media, and the client sees it
  await frame.locator('.pf-play').click();
  await frame.locator('.pf-play[aria-label="Play"]').waitFor();
  const events = await page.evaluate(() => window.events);
  assert.ok(events.includes('play') && events.includes('pause'), `events: ${events}`);
  console.log('ok  clicking the UI pauses, and the client receives the pause event');

  // 4. keyboard seeking on the range input
  const seek = frame.locator('.pf-seek');
  await seek.focus();
  const before = (await page.evaluate(() => window.pf.getState())).currentTime;
  await seek.press('ArrowRight');
  await page.waitForTimeout(300);
  const after = (await page.evaluate(() => window.pf.getState())).currentTime;
  assert.ok(after >= before + 4, `ArrowRight should skip about 5s: ${before} -> ${after}`);
  console.log(`ok  ArrowRight seeks (${before.toFixed(1)}s -> ${after.toFixed(1)}s)`);

  // 5. mute toggles
  await frame.locator('button[aria-label="Mute"]').click();
  await frame.locator('button[aria-label="Unmute"]').waitFor();
  assert.equal((await page.evaluate(() => window.pf.getState())).muted, true);
  console.log('ok  mute button toggles and the client sees the muted state');

  // 6. a missing file shows an alert
  const bad = await browser.newPage({ viewport: { width: 390, height: 200 } });
  await bad.goto(`${PLAYER_ORIGIN}/player?src=/missing.mp3`);
  await bad.locator('.pf-error').waitFor({ state: 'visible' });
  assert.match(await bad.locator('.pf-error').textContent(), /could not be played/);
  console.log('ok  unplayable media shows an alert');

  // 7. sources outside the allowed origins, or with a bad scheme, are refused
  const refused = await bad.evaluate(() => {
    try { PlayfoldUI.mountPlayer('#p', { src: 'https://evil.test/x.mp3', allowedSrcOrigins: [location.origin] }); return 'mounted'; }
    catch (e) { return e.message; }
  });
  assert.match(refused, /not allowed/);
  const jsRefused = await bad.evaluate(() => {
    try { PlayfoldUI.mountPlayer('#p', { src: 'javascript:alert(1)' }); return 'mounted'; }
    catch (e) { return e.message; }
  });
  assert.match(jsRefused, /http or https/);
  console.log('ok  foreign and javascript: sources refused');

  // 8. destroy() removes the player
  const remaining = await bad.evaluate(() => {
    const p = PlayfoldUI.mountPlayer(document.body, { src: '/a.wav', host: false });
    p.destroy();
    return document.querySelectorAll('.pf-root').length;
  });
  assert.equal(remaining, 1, 'only the original player should remain');
  console.log('ok  destroy() removes the player');

  // 9. markup in the title never executed
  const injected = await page.frames()[1].evaluate(() => window.__pwned === undefined);
  assert.equal(injected, true);
  console.log('ok  markup in the title never executed');

  // 10. the shipped example page works, and only accepts media from its own origin
  const ex = await browser.newPage({ viewport: { width: 390, height: 200 } });
  await ex.goto(`${PLAYER_ORIGIN}/example?src=/a.wav&title=Example`);
  await ex.locator('.pf-title').waitFor();
  assert.equal(await ex.locator('.pf-title').textContent(), 'Example');
  const foreign = await browser.newPage({ viewport: { width: 390, height: 200 } });
  foreign.on('pageerror', () => undefined);
  await foreign.goto(`${PLAYER_ORIGIN}/example?src=${encodeURIComponent('https://evil.test/x.mp3')}`);
  await foreign.waitForTimeout(300);
  assert.equal(await foreign.locator('.pf-root').count(), 0);
  console.log('ok  examples/player.html mounts, and refuses media from other origins');

  // 11. a portrait video gets a portrait box, capped so the controls stay on screen
  const clip = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await clip.goto(`${PLAYER_ORIGIN}/player?src=/a.wav`);
  await clip.locator('.pf-root').waitFor();
  await clip.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'portrait';
    document.body.appendChild(host);
    PlayfoldUI.mountPlayer(host, { src: '/portrait.webm', title: 'Portrait', host: false, preload: 'auto' });
  });
  await clip.waitForFunction(() => document.querySelector('#portrait .pf-screen')?.style.getPropertyValue('--pf-ratio'));
  const box = await clip.locator('#portrait .pf-screen').boundingBox();
  assert.ok(Math.abs(box.width / box.height - 0.5625) < 0.02, `portrait box ${box.width}x${box.height}`);
  assert.ok(box.height <= 800 * 0.7 + 1, `box height ${box.height} should be capped at 70vh`);
  console.log(`ok  portrait video gets a ${Math.round(box.width)}x${Math.round(box.height)} box (9:16, capped at 70% of the screen)`);

  // 12. icon and label colors stay readable on any accent, in both themes
  const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const rgb = (css) => css.match(/[\d.]+/g).slice(0, 3).map(Number);
  for (const theme of ['dark', 'light']) {
    for (const accent of ['#1e3a8a', '#00ff00', '#f1f5f9', '#f97316', '#111111']) {
      const seen = await clip.evaluate(({ accent, theme }) => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const p = PlayfoldUI.mountPlayer(host, { src: '/a.wav', title: 't', eyebrow: 'Label', accent, theme, host: false });
        const cs = (el, prop) => getComputedStyle(el)[prop];
        const out = {
          label: cs(p.element.querySelector('.pf-eyebrow'), 'color'),
          card: cs(p.element, 'backgroundColor'),
          icon: cs(p.element.querySelector('.pf-play'), 'color'),
          button: cs(p.element.querySelector('.pf-play'), 'backgroundColor'),
        };
        p.destroy();
        host.remove();
        return out;
      }, { accent, theme });
      const label = ratio(rgb(seen.label), rgb(seen.card));
      const icon = ratio(rgb(seen.icon), rgb(seen.button));
      assert.ok(label >= 4.5, `${theme} ${accent}: label contrast ${label.toFixed(2)}`);
      assert.ok(icon >= 4.5, `${theme} ${accent}: play icon contrast ${icon.toFixed(2)}`);
    }
  }
  console.log('ok  label and play icon reach 4.5:1 contrast on 5 accents in dark and light');

  // 13. aggressive global CSS on the host page does not change the controls
  const hostile = await browser.newPage({ viewport: { width: 390, height: 500 } });
  await hostile.goto(`${PLAYER_ORIGIN}/player?src=/a.wav`);
  await hostile.locator('.pf-root').waitFor();
  const styled = await hostile.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = 'button{border:3px solid red;padding:20px;margin:10px;border-radius:0;background:blue}input{border:3px solid red;padding:20px;margin:10px;height:60px}p{font-size:30px;margin:30px}';
    document.head.appendChild(style);
    const get = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    return [get('.pf-play', 'borderTopWidth'), get('.pf-play', 'paddingTop'), get('.pf-play', 'width'), get('.pf-seek', 'borderTopWidth'), get('.pf-seek', 'paddingTop'), get('.pf-seek', 'height'), get('.pf-sub', 'fontSize')];
  });
  assert.deepEqual(styled, ['0px', '0px', '44px', '0px', '0px', '24px', '15px']);
  console.log('ok  global button, input and p styles on the host page do not leak into the player');

  // 14. colors that are not colors are ignored, so a link cannot make the player load anything
  const evil = await browser.newPage({ viewport: { width: 390, height: 300 } });
  const requested = [];
  evil.on('request', (r) => { if (r.url().includes('evil.test')) requested.push(r.url()); });
  await evil.goto(`${PLAYER_ORIGIN}/player?src=/a.wav`);
  await evil.locator('.pf-root').waitFor();
  const inline = await evil.evaluate(() => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = PlayfoldUI.mountPlayer(host, {
      src: '/a.wav',
      accent: 'url(https://evil.test/a.png)',
      colors: { background: 'url(https://evil.test/b.png)', text: 'red; background: url(https://evil.test/c.png)' },
      host: false,
    });
    return p.element.getAttribute('style') || '';
  });
  await evil.waitForTimeout(300);
  assert.ok(!inline.includes('url('), `inline style: ${inline}`);
  assert.deepEqual(requested, []);
  console.log('ok  invalid color values are ignored and trigger no network request');

  // screenshot in the light theme at a narrow width
  const light = await browser.newPage({ viewport: { width: 320, height: 170 } });
  await light.goto(`${PLAYER_ORIGIN}/player?theme=light`);
  await light.locator('.pf-root').waitFor();
  await shot(light, 'light');
} catch (error) {
  failed = true;
  console.error('FAIL', error);
} finally {
  await browser.close();
  playerServer.close();
  hostServer.close();
}
process.exit(failed ? 1 : 0);
