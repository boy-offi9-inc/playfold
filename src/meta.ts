/**
 * Server-side helpers for link previews.
 *
 * Chat apps (WhatsApp, Telegram, Discord, Slack, X ...) never run your JavaScript. Their servers
 * fetch the shared URL and read the <meta> tags in the raw HTML. This module produces those tags,
 * an oEmbed response and a small request handler. It has no dependencies and no DOM access.
 *
 * Whether a platform then shows an inline player is the platform's own decision.
 */

export interface MediaFile {
  url: string;
  /** MIME type, for example `audio/mpeg`. Guessed from the file extension when omitted. */
  type?: string;
}

export interface ImageRef {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface TrackMeta {
  title: string;
  /** Canonical, absolute URL of the page people share. */
  url: string;
  description?: string;
  image?: string | ImageRef;
  /** Direct audio file. The best chance of native inline playback. */
  audio?: string | MediaFile;
  /** Direct video file. The best chance of native inline playback. */
  video?: string | MediaFile;
  /** Absolute URL of the embeddable iframe player page. Must allow framing. */
  playerUrl?: string;
  /** Player size in pixels. Defaults to 480x152 for audio and 480x270 for video. */
  width?: number;
  height?: number;
  author?: string;
  /** Length in seconds. */
  duration?: number;
}

export interface MetaOptions {
  siteName?: string;
  /** Twitter/X handle of the site, for example `@example`. */
  twitterSite?: string;
  themeColor?: string;
  locale?: string;
  /** Absolute URL of your oEmbed endpoint. Adds the discovery <link> tag. */
  oembedUrl?: string;
  /** Add `<meta name="robots" content="noindex">`. */
  noindex?: boolean;
}

export interface MetaTag {
  attr: 'property' | 'name';
  key: string;
  content: string;
}

const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
};
const VIDEO_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function absolute(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`playfold/meta: ${label} must be an absolute URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(`playfold/meta: ${label} must use http or https`);
  }
  return url.href;
}

const isHttps = (url: string): boolean => url.startsWith('https:');

function guessType(url: string, table: Record<string, string>): string | undefined {
  const match = /\.([a-z0-9]+)$/i.exec(new URL(url).pathname);
  return match ? table[match[1].toLowerCase()] : undefined;
}

function media(input: string | MediaFile | undefined, label: string, table: Record<string, string>): MediaFile | undefined {
  if (!input) return undefined;
  const file = typeof input === 'string' ? { url: input } : input;
  const url = absolute(file.url, label);
  return { url, type: file.type ?? guessType(url, table) };
}

function image(input: TrackMeta['image']): ImageRef | undefined {
  if (!input) return undefined;
  const ref = typeof input === 'string' ? { url: input } : input;
  return { ...ref, url: absolute(ref.url, 'image') };
}

/** The meta tags as data, for frameworks that want to render them themselves. */
export function getMetaTags(track: TrackMeta, options: MetaOptions = {}): MetaTag[] {
  if (!track || typeof track.title !== 'string' || !track.title.trim()) {
    throw new TypeError('playfold/meta: title is required');
  }
  const pageUrl = absolute(track.url, 'url');
  const picture = image(track.image);
  const audio = media(track.audio, 'audio', AUDIO_TYPES);
  const video = media(track.video, 'video', VIDEO_TYPES);
  const player = track.playerUrl ? absolute(track.playerUrl, 'playerUrl') : undefined;
  const width = track.width ?? 480;
  const height = track.height ?? (video ? 270 : 152);

  const tags: MetaTag[] = [];
  const add = (attr: MetaTag['attr'], key: string, content: string | number | undefined): void => {
    if (content === undefined || content === '') return;
    tags.push({ attr, key, content: String(content) });
  };
  const og = (key: string, content?: string | number): void => add('property', `og:${key}`, content);
  const tw = (key: string, content?: string | number): void => add('name', `twitter:${key}`, content);

  og('site_name', options.siteName);
  og('type', video ? 'video.other' : audio ? 'music.song' : 'website');
  og('title', track.title);
  og('description', track.description);
  og('url', pageUrl);
  og('locale', options.locale);

  if (picture) {
    og('image', picture.url);
    if (isHttps(picture.url)) og('image:secure_url', picture.url);
    og('image:width', picture.width);
    og('image:height', picture.height);
    og('image:alt', picture.alt);
  }

  if (audio) {
    og('audio', audio.url);
    if (isHttps(audio.url)) og('audio:secure_url', audio.url);
    og('audio:type', audio.type);
  }

  if (video) {
    og('video', video.url);
    if (isHttps(video.url)) og('video:secure_url', video.url);
    og('video:type', video.type);
    og('video:width', width);
    og('video:height', height);
  } else if (player) {
    // No direct file: offer the iframe player, the way YouTube does.
    og('video', player);
    if (isHttps(player)) og('video:secure_url', player);
    og('video:type', 'text/html');
    og('video:width', width);
    og('video:height', height);
  }

  if (track.duration !== undefined && Number.isFinite(track.duration)) {
    add('property', video ? 'video:duration' : 'music:duration', Math.round(track.duration));
  }

  add('name', 'description', track.description);
  tw('card', player ? 'player' : picture ? 'summary_large_image' : 'summary');
  tw('site', options.twitterSite);
  tw('title', track.title);
  tw('description', track.description);
  tw('image', picture?.url);
  tw('image:alt', picture?.alt);
  if (player) {
    tw('player', player);
    tw('player:width', width);
    tw('player:height', height);
    const stream = audio ?? video;
    if (stream) {
      tw('player:stream', stream.url);
      tw('player:stream:content_type', stream.type);
    }
  }
  add('name', 'theme-color', options.themeColor);
  if (options.noindex) add('name', 'robots', 'noindex');

  return tags;
}

/** HTML for the <head>: meta tags, canonical link and oEmbed discovery link. */
export function renderMetaTags(track: TrackMeta, options: MetaOptions = {}): string {
  const lines = getMetaTags(track, options).map(
    (tag) => `<meta ${tag.attr}="${escapeHtml(tag.key)}" content="${escapeHtml(tag.content)}">`,
  );
  const pageUrl = absolute(track.url, 'url');
  lines.push(`<link rel="canonical" href="${escapeHtml(pageUrl)}">`);
  if (options.oembedUrl) {
    const endpoint = absolute(options.oembedUrl, 'oembedUrl');
    const href = `${endpoint}${endpoint.includes('?') ? '&' : '?'}url=${encodeURIComponent(pageUrl)}&format=json`;
    lines.push(
      `<link rel="alternate" type="application/json+oembed" href="${escapeHtml(href)}" title="${escapeHtml(track.title)}">`,
    );
  }
  return lines.join('\n');
}

export interface PageOptions extends MetaOptions {
  /** Send people (not crawlers) to this URL with a script redirect. It must differ from the page itself. */
  redirectTo?: string;
}

/** A complete small HTML page that carries the tags. Crawlers read the head, people see a link. */
export function renderMetaPage(track: TrackMeta, options: PageOptions = {}): string {
  const pageUrl = absolute(track.url, 'url');
  const target = options.redirectTo ? absolute(options.redirectTo, 'redirectTo') : undefined;
  const redirect = target
    ? `\n<script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')})</script>`
    : '';
  return `<!doctype html>
<html lang="${escapeHtml(options.locale?.split('_')[0] ?? 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(track.title)}</title>
${renderMetaTags(track, options)}
</head>
<body>
<p><a href="${escapeHtml(target ?? pageUrl)}">${escapeHtml(track.title)}</a></p>${redirect}
</body>
</html>
`;
}

export interface OEmbedResponse {
  version: '1.0';
  type: 'rich' | 'link';
  title: string;
  author_name?: string;
  provider_name: string;
  provider_url: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  html?: string;
  width?: number;
  height?: number;
}

/** An oEmbed 1.0 response. `rich` with iframe HTML when a `playerUrl` exists, otherwise `link`. */
export function buildOEmbed(
  track: TrackMeta,
  options: MetaOptions = {},
  request: { maxwidth?: number; maxheight?: number } = {},
): OEmbedResponse {
  if (!track || typeof track.title !== 'string' || !track.title.trim()) {
    throw new TypeError('playfold/meta: title is required');
  }
  const pageUrl = new URL(absolute(track.url, 'url'));
  const picture = image(track.image);
  const out: OEmbedResponse = {
    version: '1.0',
    type: 'link',
    title: track.title,
    provider_name: options.siteName ?? pageUrl.hostname,
    provider_url: pageUrl.origin,
  };
  if (track.author) out.author_name = track.author;
  if (picture) {
    out.thumbnail_url = picture.url;
    if (picture.width) out.thumbnail_width = picture.width;
    if (picture.height) out.thumbnail_height = picture.height;
  }
  if (track.playerUrl) {
    const player = absolute(track.playerUrl, 'playerUrl');
    const clamp = (value: number, max?: number): number => (max && max > 0 ? Math.min(value, Math.floor(max)) : value);
    const width = clamp(track.width ?? 480, request.maxwidth);
    const height = clamp(track.height ?? (track.video ? 270 : 152), request.maxheight);
    out.type = 'rich';
    out.width = width;
    out.height = height;
    out.html =
      `<iframe src="${escapeHtml(player)}" width="${width}" height="${height}" ` +
      `style="border:0" allow="autoplay; encrypted-media" allowfullscreen ` +
      `title="${escapeHtml(track.title)}"></iframe>`;
  }
  return out;
}

const NAMED_CRAWLERS = [
  { name: 'Telegram', userAgent: 'TelegramBot (like TwitterBot)', pattern: /TelegramBot/i },
  { name: 'WhatsApp', userAgent: 'WhatsApp/2.23.20.0 A', pattern: /WhatsApp/i },
  {
    name: 'Discord',
    userAgent: 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    pattern: /Discordbot/i,
  },
  { name: 'X/Twitter', userAgent: 'Twitterbot/1.0', pattern: /Twitterbot/i },
  {
    name: 'Facebook',
    userAgent: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    pattern: /facebookexternalhit|Facebot/i,
  },
  {
    name: 'Slack',
    userAgent: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    pattern: /Slackbot/i,
  },
] as const;

/** The crawlers that Playfold's checker imitates, with a representative user agent each. */
export const CRAWLERS: ReadonlyArray<{ name: string; userAgent: string; pattern: RegExp }> = NAMED_CRAWLERS;

const OTHER_CRAWLERS =
  /LinkedInBot|Pinterest|redditbot|SkypeUriPreview|vkShare|Embedly|Iframely|Mastodon|Misskey|Bluesky|Applebot|Googlebot|bingbot|DuckDuckBot|Signal/i;

/** True for the user agents of link-preview fetchers and search crawlers. */
export function isCrawler(userAgent: string | undefined | null): boolean {
  if (!userAgent) return false;
  return NAMED_CRAWLERS.some((c) => c.pattern.test(userAgent)) || OTHER_CRAWLERS.test(userAgent);
}

export interface RequestLike {
  url?: string;
  originalUrl?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface ResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

export interface MetaHandlerOptions extends MetaOptions {
  /** Public origin of your site, for example `https://music.example.com`. */
  origin: string;
  /** Map a request URL to a track. Return null when the URL is not a shareable page. */
  resolve(url: URL, request: RequestLike): TrackMeta | null | undefined | Promise<TrackMeta | null | undefined>;
  /** Path that serves oEmbed JSON. Default `/oembed`. Use `false` to turn it off. */
  oembedPath?: string | false;
  /**
   * Only answer link-preview crawlers and call `next()` for everyone else. Use this when a
   * single-page app serves your real pages. Default `false`.
   */
  crawlersOnly?: boolean;
  /** Where people (not crawlers) should land when they open the generated page. */
  redirectTo?: string | ((track: TrackMeta) => string);
  /** Cache lifetime for responses in seconds. Default 300. */
  cacheSeconds?: number;
}

type Next = (error?: unknown) => void;

function reply(res: ResponseLike, status: number, type: string, body: string, headers: Record<string, string> = {}): void {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(body);
}

function header(req: RequestLike, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * A request handler for Node's `http` and for Express-style frameworks.
 *
 * ```ts
 * app.use(createMetaHandler({ origin, crawlersOnly: true, resolve: (url) => lookup(url.pathname) }));
 * ```
 */
export function createMetaHandler(options: MetaHandlerOptions) {
  const origin = new URL(absolute(options.origin, 'origin')).origin;
  const oembedPath = options.oembedPath === undefined ? '/oembed' : options.oembedPath;
  const oembedUrl = options.oembedUrl ?? (oembedPath === false ? undefined : origin + oembedPath);
  const maxAge = options.cacheSeconds ?? 300;
  const cache = `public, max-age=${maxAge}`;

  return async function metaHandler(req: RequestLike, res: ResponseLike, next?: Next): Promise<void> {
    const pass = (): void => {
      if (next) next();
      else reply(res, 404, 'text/plain; charset=utf-8', 'Not found');
    };

    try {
      const method = (req.method ?? 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') return pass();

      const raw = req.originalUrl ?? req.url ?? '/';
      // Only a path may come from the request. Never let it choose the origin.
      const requestUrl = new URL(raw.startsWith('/') && !raw.startsWith('//') ? raw : '/', origin);

      if (oembedPath !== false && requestUrl.pathname === oembedPath) {
        const wanted = requestUrl.searchParams.get('url') ?? '';
        let target: URL | undefined;
        try {
          target = new URL(wanted);
        } catch {
          target = undefined;
        }
        if (!target || target.origin !== origin) {
          return reply(res, 400, 'application/json; charset=utf-8', '{"error":"url must point at this site"}');
        }
        if ((requestUrl.searchParams.get('format') ?? 'json') !== 'json') {
          return reply(res, 501, 'application/json; charset=utf-8', '{"error":"only json is supported"}');
        }
        const found = await options.resolve(target, req);
        if (!found) return reply(res, 404, 'application/json; charset=utf-8', '{"error":"not found"}');
        const num = (name: string): number | undefined => {
          const value = Number(requestUrl.searchParams.get(name));
          return Number.isFinite(value) && value > 0 ? value : undefined;
        };
        const body = buildOEmbed(found, options, { maxwidth: num('maxwidth'), maxheight: num('maxheight') });
        return reply(res, 200, 'application/json; charset=utf-8', JSON.stringify(body), {
          'Cache-Control': cache,
          'Access-Control-Allow-Origin': '*',
        });
      }

      if (options.crawlersOnly && !isCrawler(header(req, 'user-agent'))) return pass();

      const track = await options.resolve(requestUrl, req);
      if (!track) return pass();

      const redirectTo = typeof options.redirectTo === 'function' ? options.redirectTo(track) : options.redirectTo;
      const html = renderMetaPage(track, { ...options, oembedUrl, redirectTo });
      return reply(res, 200, 'text/html; charset=utf-8', html, {
        'Cache-Control': cache,
        ...(options.crawlersOnly ? { Vary: 'User-Agent' } : {}),
      });
    } catch (error) {
      if (next) next(error);
      else reply(res, 500, 'text/plain; charset=utf-8', 'Internal error');
    }
  };
}
