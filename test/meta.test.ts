import { describe, expect, it } from 'vitest';
import {
  buildOEmbed,
  createMetaHandler,
  escapeHtml,
  getMetaTags,
  isCrawler,
  renderMetaPage,
  renderMetaTags,
} from '../src/meta';
import type { ResponseLike, TrackMeta } from '../src/meta';

const track: TrackMeta = {
  title: 'Night "Drive" <live>',
  url: 'https://music.example.com/track/42',
  description: 'A & B',
  image: { url: 'https://cdn.example.com/c.jpg', width: 600, height: 600 },
  audio: 'https://cdn.example.com/a.mp3',
  playerUrl: 'https://music.example.com/embed/42',
  author: 'Artist',
  duration: 181.6,
};

const find = (key: string): string | undefined => getMetaTags(track, { siteName: 'Example' }).find((t) => t.key === key)?.content;

describe('getMetaTags', () => {
  it('builds open graph and twitter tags', () => {
    expect(find('og:title')).toBe('Night "Drive" <live>');
    expect(find('og:type')).toBe('music.song');
    expect(find('og:audio')).toBe('https://cdn.example.com/a.mp3');
    expect(find('og:audio:type')).toBe('audio/mpeg');
    expect(find('og:image:width')).toBe('600');
    expect(find('music:duration')).toBe('182');
    expect(find('twitter:card')).toBe('player');
    expect(find('twitter:player:width')).toBe('480');
    expect(find('twitter:player:height')).toBe('152');
    expect(find('twitter:player:stream')).toBe('https://cdn.example.com/a.mp3');
  });
  it('offers the iframe player as og:video when there is no video file', () => {
    expect(find('og:video')).toBe('https://music.example.com/embed/42');
    expect(find('og:video:type')).toBe('text/html');
  });
  it('prefers a direct video file over the iframe', () => {
    const tags = getMetaTags({ ...track, video: 'https://cdn.example.com/v.mp4' });
    expect(tags.find((t) => t.key === 'og:video')?.content).toBe('https://cdn.example.com/v.mp4');
    expect(tags.find((t) => t.key === 'og:video:type')?.content).toBe('video/mp4');
    expect(tags.find((t) => t.key === 'og:video:height')?.content).toBe('270');
    expect(tags.find((t) => t.key === 'og:type')?.content).toBe('video.other');
  });
  it('falls back to summary cards without a player', () => {
    const plain = getMetaTags({ title: 'T', url: 'https://a.test/x' });
    expect(plain.find((t) => t.key === 'twitter:card')?.content).toBe('summary');
    const pic = getMetaTags({ title: 'T', url: 'https://a.test/x', image: 'https://a.test/i.png' });
    expect(pic.find((t) => t.key === 'twitter:card')?.content).toBe('summary_large_image');
  });
  it('validates input', () => {
    expect(() => getMetaTags({ title: '', url: 'https://a.test' })).toThrow(/title/);
    expect(() => getMetaTags({ title: 'T', url: '/relative' })).toThrow(/absolute/);
    expect(() => getMetaTags({ title: 'T', url: 'javascript:alert(1)' })).toThrow(/http/);
    expect(() => getMetaTags({ title: 'T', url: 'https://a.test', audio: 'ftp://a.test/x.mp3' })).toThrow(/http/);
  });
});

describe('renderMetaTags', () => {
  it('escapes values', () => {
    const html = renderMetaTags(track);
    expect(html).toContain('content="Night &quot;Drive&quot; &lt;live&gt;"');
    expect(html).toContain('content="A &amp; B"');
    expect(html).not.toContain('<live>');
  });
  it('adds canonical and oEmbed discovery links', () => {
    const html = renderMetaTags(track, { oembedUrl: 'https://music.example.com/oembed' });
    expect(html).toContain('<link rel="canonical" href="https://music.example.com/track/42">');
    expect(html).toContain('type="application/json+oembed"');
    expect(html).toContain('oembed?url=https%3A%2F%2Fmusic.example.com%2Ftrack%2F42&amp;format=json');
  });
});

describe('renderMetaPage', () => {
  it('returns a full document with the tags in the head', () => {
    const page = renderMetaPage(track);
    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect(page.indexOf('og:title')).toBeLessThan(page.indexOf('</head>'));
  });
  it('can redirect people without breaking out of the script', () => {
    const page = renderMetaPage(track, { redirectTo: 'https://app.example.com/t?x=</script>' });
    expect(page).toContain('location.replace(');
    expect(page.match(/<\/script>/g)).toHaveLength(1);
  });
});

describe('buildOEmbed', () => {
  it('returns a rich response with iframe html', () => {
    const o = buildOEmbed(track, { siteName: 'Example' });
    expect(o.type).toBe('rich');
    expect(o.version).toBe('1.0');
    expect(o.provider_name).toBe('Example');
    expect(o.html).toContain('<iframe src="https://music.example.com/embed/42"');
    expect(o.html).toContain('title="Night &quot;Drive&quot; &lt;live&gt;"');
    expect(o.width).toBe(480);
  });
  it('honours maxwidth and maxheight', () => {
    const o = buildOEmbed(track, {}, { maxwidth: 300, maxheight: 100 });
    expect([o.width, o.height]).toEqual([300, 100]);
  });
  it('is a link response without a player', () => {
    const o = buildOEmbed({ title: 'T', url: 'https://a.test/x' });
    expect(o.type).toBe('link');
    expect(o.html).toBeUndefined();
  });
});

describe('isCrawler', () => {
  it('recognises preview bots', () => {
    expect(isCrawler('TelegramBot (like TwitterBot)')).toBe(true);
    expect(isCrawler('Mozilla/5.0 (compatible; Discordbot/2.0)')).toBe(true);
    expect(isCrawler('WhatsApp/2.23 A')).toBe(true);
    expect(isCrawler('facebookexternalhit/1.1')).toBe(true);
  });
  it('ignores browsers', () => {
    expect(isCrawler('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36')).toBe(false);
    expect(isCrawler(undefined)).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('escapes the five special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

function fakeRes(): ResponseLike & { body?: string; headers: Record<string, string> } {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as string | undefined,
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
    },
    end(body?: string) {
      res.body = body;
    },
  };
  return res;
}

describe('createMetaHandler', () => {
  const handler = createMetaHandler({
    origin: 'https://music.example.com',
    siteName: 'Example',
    crawlersOnly: true,
    resolve: (url) => (url.pathname === '/track/42' ? track : null),
  });
  const bot = { 'user-agent': 'TelegramBot (like TwitterBot)' };

  it('serves tags to crawlers', async () => {
    const res = fakeRes();
    await handler({ url: '/track/42', headers: bot }, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['vary']).toBe('User-Agent');
    expect(res.body).toContain('property="og:audio"');
    expect(res.body).toContain('application/json+oembed');
  });
  it('passes browsers through to next()', async () => {
    const res = fakeRes();
    let called = 0;
    await handler({ url: '/track/42', headers: { 'user-agent': 'Mozilla/5.0 Chrome/120' } }, res, () => {
      called++;
    });
    expect(called).toBe(1);
    expect(res.body).toBeUndefined();
  });
  it('passes unknown pages through', async () => {
    const res = fakeRes();
    let called = 0;
    await handler({ url: '/nope', headers: bot }, res, () => {
      called++;
    });
    expect(called).toBe(1);
  });
  it('answers 404 without next()', async () => {
    const res = fakeRes();
    await handler({ url: '/nope', headers: bot }, res);
    expect(res.statusCode).toBe(404);
  });
  it('serves oEmbed JSON for pages on this site', async () => {
    const res = fakeRes();
    const url = '/oembed?url=' + encodeURIComponent('https://music.example.com/track/42') + '&maxwidth=300';
    await handler({ url, headers: { 'user-agent': 'Mozilla/5.0' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    const body = JSON.parse(res.body ?? '{}') as { type: string; width: number };
    expect(body.type).toBe('rich');
    expect(body.width).toBe(300);
  });
  it('rejects oEmbed requests for other sites and formats', async () => {
    const other = fakeRes();
    await handler({ url: '/oembed?url=' + encodeURIComponent('https://evil.test/x'), headers: bot }, other);
    expect(other.statusCode).toBe(400);
    const xml = fakeRes();
    await handler({ url: '/oembed?format=xml&url=' + encodeURIComponent('https://music.example.com/track/42'), headers: bot }, xml);
    expect(xml.statusCode).toBe(501);
  });
  it('never lets the request choose the origin', async () => {
    const seen: string[] = [];
    const h = createMetaHandler({
      origin: 'https://music.example.com',
      resolve: (url) => {
        seen.push(url.origin);
        return null;
      },
    });
    await h({ url: '//evil.test/track/42', headers: bot }, fakeRes());
    await h({ url: 'https://evil.test/track/42', headers: bot }, fakeRes());
    expect(seen).toEqual(['https://music.example.com', 'https://music.example.com']);
  });
  it('ignores non-GET methods', async () => {
    const res = fakeRes();
    let called = 0;
    await handler({ url: '/track/42', method: 'POST', headers: bot }, res, () => {
      called++;
    });
    expect(called).toBe(1);
  });
});
