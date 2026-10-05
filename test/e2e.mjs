// Cross-origin end-to-end test. Needs a built dist/playfold.global.js and Playwright with Chromium.
// Run: npm run build && node test/e2e.mjs
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const bundle = readFileSync(fileURLToPath(new URL('../dist/playfold.global.js', import.meta.url)));
const { chromium } = await import('playwright');

function wav(seconds = 3, rate = 8000) {
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

const PLAYER_PORT = 4102;
const HOST_PORT = 4101;
const PLAYER_ORIGIN = `http://127.0.0.1:${PLAYER_PORT}`;
const HOST_ORIGIN = `http://127.0.0.1:${HOST_PORT}`;

const playerServer = http.createServer((req, res) => {
  const url = new URL(req.url, PLAYER_ORIGIN);
  if (url.pathname === '/sdk.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(bundle);
  if (url.pathname === '/a.wav') {
    // Chromium only allows seeking when the server honours Range requests.
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (!m) return res.writeHead(200, { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-length': audio.length }).end(audio);
    const start = Number(m[1] || 0);
    const end = m[2] ? Number(m[2]) : audio.length - 1;
    return res
      .writeHead(206, { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${audio.length}`, 'content-length': end - start + 1 })
      .end(audio.subarray(start, end + 1));
  }
  if (url.pathname.startsWith('/embed/')) {
    const allowed = url.searchParams.get('allowed');
    const opts = allowed ? `{ allowedOrigins: [${JSON.stringify(allowed)}] }` : '{}';
    return res.writeHead(200, { 'content-type': 'text/html' }).end(
      `<!doctype html><audio id="a" src="/a.wav" preload="auto"></audio>` +
        `<script src="/sdk.js"></script><script>Playfold.connectHost(document.getElementById('a'), ${opts});</script>`,
    );
  }
  res.writeHead(404).end();
});

const hostServer = http.createServer((req, res) => {
  const url = new URL(req.url, HOST_ORIGIN);
  if (url.pathname === '/sdk.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(bundle);
  res.writeHead(200, { 'content-type': 'text/html' }).end(
    `<!doctype html><body><div id="one"></div>` +
      `<div id="auto" data-playfold="/embed/auto" data-base-url="${PLAYER_ORIGIN}" data-param-theme="dark"><a href="${PLAYER_ORIGIN}/embed/auto">fallback</a></div>` +
      `<script src="/sdk.js"></script>`,
  );
});

await Promise.all([playerServer, hostServer].map((s, i) => new Promise((r) => s.listen(i ? HOST_PORT : PLAYER_PORT, '127.0.0.1', r))));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let failed = false;
try {
  const page = await browser.newPage();
  await page.goto(HOST_ORIGIN);

  // 1. scan() mounted the data-playfold element and replaced the fallback link
  await page.waitForSelector('#auto iframe.playfold-frame');
  const src = await page.$eval('#auto iframe', (f) => f.src);
  assert.equal(src, `${PLAYER_ORIGIN}/embed/auto?theme=dark`);
  console.log('ok  scan() mounts data-playfold elements');

  // 2. commands + events across origins
  const result = await page.evaluate(async (origin) => {
    const events = [];
    const player = Playfold.createPlayer(document.getElementById('one'), { baseUrl: origin, path: '/embed/one' });
    for (const n of ['play', 'pause', 'ended']) player.on(n, () => events.push(n));
    await player.ready;
    const ready = await player.getState();
    await player.play();
    await new Promise((r) => setTimeout(r, 300));
    const playing = await player.getState();
    await player.pause();
    await player.setVolume(0.25);
    const afterVolume = await player.getState();
    await player.seek(2.5);
    const seeked = await player.getState();
    await player.play();
    await new Promise((r) => setTimeout(r, 1500));
    const rejected = await player.seek(-1).then(() => 'resolved', (e) => String(e.message));
    player.destroy();
    return { ready, playing, afterVolume, seeked, events, rejected };
  }, PLAYER_ORIGIN);
  assert.equal(result.ready.paused, true);
  assert.equal(result.playing.paused, false);
  assert.equal(result.afterVolume.volume, 0.25);
  assert.ok(result.seeked.currentTime >= 2.4, `seek landed at ${result.seeked.currentTime}`);
  assert.deepEqual([...new Set(result.events)].sort(), ['ended', 'pause', 'play']);
  assert.match(result.rejected, /seek/);
  console.log('ok  ready / play / pause / volume / seek / ended / rejected bad input');

  // 3. host restricted to another origin must ignore commands from this page
  const blocked = await page.evaluate(async (origin) => {
    const player = Playfold.createPlayer(document.getElementById('one'), {
      baseUrl: origin, path: '/embed/locked', params: { allowed: 'https://not-us.example' }, timeout: 800, readyTimeout: 1500,
    });
    const outcome = await player.play().then(() => 'resolved', (e) => String(e.message));
    player.destroy();
    return outcome;
  }, PLAYER_ORIGIN);
  assert.notEqual(blocked, 'resolved');
  console.log('ok  host with allowedOrigins ignores other origins (' + blocked + ')');

  // 4. path escaping the base origin is refused
  const escape = await page.evaluate((origin) => {
    try { Playfold.createPlayer(document.getElementById('one'), { baseUrl: origin, path: 'https://evil.test/x' }); return 'created'; }
    catch (e) { return e.message; }
  }, PLAYER_ORIGIN);
  assert.match(escape, /origin/);
  console.log('ok  cross-origin path refused');
} catch (error) {
  failed = true;
  console.error('FAIL', error);
} finally {
  await browser.close();
  playerServer.close();
  hostServer.close();
}
process.exit(failed ? 1 : 0);
