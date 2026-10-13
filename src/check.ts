/**
 * Checks what link-preview crawlers see at a URL. Needs a global `fetch` (Node 18+).
 * It reports problems that commonly stop a rich preview. It cannot tell you whether a given
 * platform will actually play the media inline: that is the platform's own decision.
 */
import { CRAWLERS } from './meta';

export type Level = 'error' | 'warn' | 'info';

export interface Finding {
  level: Level;
  message: string;
}

export interface ParsedMeta {
  title?: string;
  /** `property` and `name` values of <meta> tags, keyed in lower case. */
  meta: Record<string, string[]>;
  links: Array<{ rel: string; type?: string; href: string }>;
}

export interface CrawlerResult {
  name: string;
  status?: number;
  title?: string;
  hasImage: boolean;
  error?: string;
}

export interface CheckReport {
  url: string;
  crawlers: CrawlerResult[];
  tags: ParsedMeta;
  findings: Finding[];
  ok: boolean;
}

export interface CheckOptions {
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. Default 10000. */
  timeoutMs?: number;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'" };
const decode = (value: string): string => value.replace(/&(#x?\d+|[a-z]+);/gi, (all, code: string) => ENTITIES[code.toLowerCase()] ?? all);

function attributes(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    out[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return out;
}

/** Read <title>, <meta> and <link> tags the way a crawler does: from raw HTML, with no scripts run. */
export function parseMeta(html: string): ParsedMeta {
  const end = html.search(/<\/head>/i);
  const head = end === -1 ? html : html.slice(0, end);
  const parsed: ParsedMeta = { meta: {}, links: [] };

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  if (title) parsed.title = decode(title[1]).trim();

  const pattern = /<(meta|link)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(head))) {
    const attrs = attributes(match[2]);
    if (match[1].toLowerCase() === 'meta') {
      const key = (attrs.property ?? attrs.name)?.toLowerCase();
      if (key && attrs.content !== undefined) (parsed.meta[key] ??= []).push(attrs.content);
    } else if (attrs.rel && attrs.href) {
      parsed.links.push({ rel: attrs.rel.toLowerCase(), type: attrs.type, href: attrs.href });
    }
  }
  return parsed;
}

const first = (parsed: ParsedMeta, key: string): string | undefined => parsed.meta[key]?.[0];

function isAbsolute(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Rules that need only the HTML. */
export function analyze(parsed: ParsedMeta): Finding[] {
  const out: Finding[] = [];
  const add = (level: Level, message: string): void => {
    out.push({ level, message });
  };

  if (!first(parsed, 'og:title') && !parsed.title) add('error', 'Missing og:title (and no <title>). Cards will be blank.');
  else if (!first(parsed, 'og:title')) add('warn', 'Missing og:title. Crawlers fall back to <title>.');
  if (!first(parsed, 'og:description') && !first(parsed, 'description')) add('warn', 'Missing og:description.');
  if (!first(parsed, 'og:url')) add('info', 'Missing og:url. Add the canonical page URL.');

  const image = first(parsed, 'og:image');
  if (!image) add('warn', 'Missing og:image. The card will have no thumbnail.');
  else if (!isAbsolute(image)) add('error', 'og:image is not an absolute http(s) URL. Crawlers will not resolve it.');

  const audio = first(parsed, 'og:audio');
  const video = first(parsed, 'og:video');
  const card = first(parsed, 'twitter:card');
  const twitterPlayer = first(parsed, 'twitter:player');

  if (audio) {
    if (!isAbsolute(audio)) add('error', 'og:audio is not an absolute http(s) URL.');
    else if (!audio.startsWith('https:')) add('warn', 'og:audio is not https. Most platforms ignore plain http media.');
    if (!first(parsed, 'og:audio:type')) add('warn', 'og:audio has no og:audio:type (for example audio/mpeg).');
  }

  if (video) {
    if (!isAbsolute(video)) add('error', 'og:video is not an absolute http(s) URL.');
    else if (!video.startsWith('https:')) add('warn', 'og:video is not https. Most platforms ignore plain http media.');
    const type = first(parsed, 'og:video:type');
    if (!type) add('warn', 'og:video has no og:video:type (video/mp4 or text/html).');
    if (type === 'text/html' && (!first(parsed, 'og:video:width') || !first(parsed, 'og:video:height'))) {
      add('warn', 'An og:video iframe player needs og:video:width and og:video:height.');
    }
  }

  if (card === 'player') {
    if (!twitterPlayer) add('error', 'twitter:card is "player" but twitter:player is missing.');
    else if (!twitterPlayer.startsWith('https:')) add('error', 'twitter:player must be an https URL.');
    if (!first(parsed, 'twitter:player:width') || !first(parsed, 'twitter:player:height')) {
      add('error', 'twitter:card "player" requires twitter:player:width and twitter:player:height.');
    }
  }

  if (!audio && !video && !twitterPlayer) {
    add('info', 'No playable media is offered, so platforms will show a static card.');
  }
  if (!parsed.links.some((l) => l.rel.split(/\s+/).includes('alternate') && l.type?.includes('oembed'))) {
    add('info', 'No oEmbed discovery <link>. Slack, Notion and some CMSs use it.');
  }
  return out;
}

async function probe(
  f: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<{ status: number; headers: Headers } | { error: string }> {
  const attempt = async (init: RequestInit): Promise<{ status: number; headers: Headers }> => {
    const res = await f(url, { ...init, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    await res.body?.cancel().catch(() => undefined);
    return { status: res.status, headers: res.headers };
  };
  try {
    const head = await attempt({ method: 'HEAD' });
    if (head.status < 400) return head;
  } catch {
    /* fall through to a ranged GET: some servers reject HEAD */
  }
  try {
    return await attempt({ method: 'GET', headers: { Range: 'bytes=0-0' } });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkAssets(f: typeof fetch, parsed: ParsedMeta, timeoutMs: number): Promise<Finding[]> {
  const out: Finding[] = [];
  const add = (level: Level, message: string): void => {
    out.push({ level, message });
  };

  const image = first(parsed, 'og:image');
  if (image && isAbsolute(image)) {
    const r = await probe(f, image, timeoutMs);
    if ('error' in r) add('error', `og:image could not be fetched: ${r.error}`);
    else if (r.status >= 400) add('error', `og:image returned HTTP ${r.status}.`);
    else {
      const type = r.headers.get('content-type') ?? '';
      if (!type.startsWith('image/')) add('warn', `og:image content-type is "${type || 'missing'}", expected image/*.`);
      const size = Number(r.headers.get('content-length'));
      if (size > 300 * 1024) add('warn', `og:image is ${Math.round(size / 1024)} KB. WhatsApp may drop images over about 300 KB.`);
    }
  }

  const files = [
    ['og:audio', first(parsed, 'og:audio')],
    ['og:video', first(parsed, 'og:video:type') === 'text/html' ? undefined : first(parsed, 'og:video')],
  ] as const;
  for (const [label, url] of files) {
    if (!url || !isAbsolute(url)) continue;
    const r = await probe(f, url, timeoutMs);
    if ('error' in r) add('error', `${label} could not be fetched: ${r.error}`);
    else if (r.status >= 400) add('error', `${label} returned HTTP ${r.status}.`);
    else {
      const type = r.headers.get('content-type') ?? '';
      if (!/^(audio|video)\//.test(type) && type !== 'application/octet-stream') {
        add('warn', `${label} content-type is "${type || 'missing'}", expected audio/* or video/*.`);
      }
      if (r.status !== 206 && r.headers.get('accept-ranges') !== 'bytes') {
        add('warn', `${label} server does not advertise range requests. Seeking and some inline players need them.`);
      }
    }
  }

  const players = [
    first(parsed, 'twitter:player'),
    first(parsed, 'og:video:type') === 'text/html' ? first(parsed, 'og:video') : undefined,
  ].filter((v, i, all): v is string => !!v && isAbsolute(v) && all.indexOf(v) === i);
  for (const url of players) {
    const r = await probe(f, url, timeoutMs);
    if ('error' in r) add('error', `Player page could not be fetched: ${r.error}`);
    else if (r.status >= 400) add('error', `Player page returned HTTP ${r.status}.`);
    else {
      const frame = (r.headers.get('x-frame-options') ?? '').toLowerCase();
      if (frame === 'deny' || frame === 'sameorigin') add('error', `Player page sends X-Frame-Options: ${frame}, so it cannot be embedded.`);
      const csp = r.headers.get('content-security-policy') ?? '';
      if (/frame-ancestors/i.test(csp)) add('info', 'Player page sets CSP frame-ancestors. Make sure it allows the platforms that should embed it.');
    }
  }
  return out;
}

/** Fetch a URL as each crawler would and report what they see. */
export async function checkUrl(url: string, options: CheckOptions = {}): Promise<CheckReport> {
  const f = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10000;
  if (!isAbsolute(url)) throw new TypeError('playfold/check: url must be an absolute http(s) URL');

  const crawlers: CrawlerResult[] = [];
  const pages: Array<{ name: string; parsed: ParsedMeta }> = [];

  for (const crawler of CRAWLERS) {
    try {
      const res = await f(url, {
        headers: { 'User-Agent': crawler.userAgent, Accept: 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const parsed = parseMeta(await res.text());
      const title = first(parsed, 'og:title') ?? parsed.title;
      crawlers.push({ name: crawler.name, status: res.status, title, hasImage: !!first(parsed, 'og:image') });
      if (res.status < 400) pages.push({ name: crawler.name, parsed });
    } catch (error) {
      crawlers.push({ name: crawler.name, hasImage: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const findings: Finding[] = [];
  const tags = pages[0]?.parsed ?? { meta: {}, links: [] };

  if (!pages.length) {
    findings.push({ level: 'error', message: 'No crawler received a successful response from this URL.' });
  } else {
    findings.push(...analyze(tags));
    const titles = new Set(pages.map((p) => first(p.parsed, 'og:title') ?? ''));
    if (titles.size > 1) {
      findings.push({ level: 'warn', message: 'Crawlers received different og:title values. The server varies output by user agent.' });
    }
    if (!first(tags, 'og:title') && pages.every((p) => !first(p.parsed, 'og:title'))) {
      findings.push({
        level: 'info',
        message: 'Tags must be in the first HTML response. Single-page apps that add them with JavaScript show blank cards.',
      });
    }
    findings.push(...(await checkAssets(f, tags, timeoutMs)));
  }

  return { url, crawlers, tags, findings, ok: !findings.some((x) => x.level === 'error') };
}
