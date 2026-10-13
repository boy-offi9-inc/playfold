import { describe, expect, it } from 'vitest';
import { analyze, checkUrl, parseMeta } from '../src/check';
import { renderMetaPage } from '../src/meta';

const track = {
  title: 'Song',
  url: 'https://music.example.com/track/1',
  description: 'd',
  image: 'https://cdn.example.com/c.jpg',
  audio: 'https://cdn.example.com/a.mp3',
  playerUrl: 'https://music.example.com/embed/1',
};

describe('parseMeta', () => {
  it('reads title, meta and link tags', () => {
    const p = parseMeta(
      `<head><title> Hi &amp; bye </title><meta property="og:title" content="A &quot;B&quot;"><meta name='description' content='x > y'/>` +
        `<link rel="alternate" type="application/json+oembed" href="https://a.test/o"></head><body><meta property="og:late" content="no"></body>`,
    );
    expect(p.title).toBe('Hi & bye');
    expect(p.meta['og:title']).toEqual(['A "B"']);
    expect(p.meta['description']).toEqual(['x > y']);
    expect(p.meta['og:late']).toBeUndefined();
    expect(p.links[0].href).toBe('https://a.test/o');
  });
  it('round-trips what renderMetaPage produces', () => {
    const p = parseMeta(renderMetaPage(track, { oembedUrl: 'https://music.example.com/oembed' }));
    expect(p.meta['og:audio']).toEqual(['https://cdn.example.com/a.mp3']);
    expect(p.meta['twitter:card']).toEqual(['player']);
    expect(p.links.some((l) => l.type === 'application/json+oembed')).toBe(true);
  });
});

describe('analyze', () => {
  const messages = (html: string): string => analyze(parseMeta(html)).map((f) => `${f.level}:${f.message}`).join('\n');

  it('reports an empty page as an error', () => {
    expect(messages('<head></head>')).toContain('error:Missing og:title');
  });
  it('accepts a complete page without errors', () => {
    const found = analyze(parseMeta(renderMetaPage(track, { oembedUrl: 'https://music.example.com/oembed' })));
    expect(found.filter((f) => f.level !== 'info')).toEqual([]);
  });
  it('flags relative images and http media', () => {
    const out = messages(
      '<head><meta property="og:title" content="t"><meta property="og:image" content="/c.jpg">' +
        '<meta property="og:audio" content="http://a.test/a.mp3"></head>',
    );
    expect(out).toContain('error:og:image is not an absolute');
    expect(out).toContain('warn:og:audio is not https');
    expect(out).toContain('warn:og:audio has no og:audio:type');
  });
  it('requires player size on twitter player cards', () => {
    const out = messages('<head><meta property="og:title" content="t"><meta name="twitter:card" content="player"></head>');
    expect(out).toContain('error:twitter:card is "player" but twitter:player is missing');
    expect(out).toContain('twitter:player:width');
  });
});

describe('checkUrl', () => {
  const page = renderMetaPage(track, { oembedUrl: 'https://music.example.com/oembed' });

  const fakeFetch = (overrides: Record<string, () => Response> = {}): typeof fetch =>
    (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (overrides[url]) return overrides[url]();
      if (url === 'https://music.example.com/track/1') return new Response(page, { headers: { 'content-type': 'text/html' } });
      if (url === 'https://cdn.example.com/c.jpg') return new Response('x', { headers: { 'content-type': 'image/jpeg', 'content-length': '1000' } });
      if (url === 'https://cdn.example.com/a.mp3') return new Response('x', { headers: { 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes' } });
      if (url === 'https://music.example.com/embed/1') return new Response('x', { headers: { 'content-type': 'text/html' } });
      return new Response('nope', { status: 404 });
    }) as typeof fetch;

  it('passes a healthy page', async () => {
    const report = await checkUrl('https://music.example.com/track/1', { fetch: fakeFetch() });
    expect(report.ok).toBe(true);
    expect(report.crawlers.map((c) => c.name)).toContain('Telegram');
    expect(report.crawlers.every((c) => c.title === 'Song')).toBe(true);
    expect(report.findings.filter((f) => f.level !== 'info')).toEqual([]);
  });
  it('catches a player page that blocks framing, a big image and missing ranges', async () => {
    const report = await checkUrl('https://music.example.com/track/1', {
      fetch: fakeFetch({
        'https://music.example.com/embed/1': () => new Response('x', { headers: { 'x-frame-options': 'DENY' } }),
        'https://cdn.example.com/c.jpg': () => new Response('x', { headers: { 'content-type': 'image/jpeg', 'content-length': String(900 * 1024) } }),
        'https://cdn.example.com/a.mp3': () => new Response('x', { headers: { 'content-type': 'audio/mpeg' } }),
      }),
    });
    const text = report.findings.map((f) => f.message).join('\n');
    expect(report.ok).toBe(false);
    expect(text).toContain('X-Frame-Options: deny');
    expect(text).toContain('WhatsApp may drop images');
    expect(text).toContain('range requests');
  });
  it('explains single-page apps that show no tags to crawlers', async () => {
    const report = await checkUrl('https://spa.example.com/', {
      fetch: (async () => new Response('<html><head></head><body><div id="root"></div></body></html>')) as typeof fetch,
    });
    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.message).join('\n')).toContain('Single-page apps');
  });
  it('rejects non-http urls', async () => {
    await expect(checkUrl('ftp://x')).rejects.toThrow(/absolute/);
  });
});
