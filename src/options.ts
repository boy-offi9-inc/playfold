export type ParamValue = string | number | boolean;

export interface PlayerOptions {
  /** Origin of the site that serves the embeddable player page, e.g. `https://example.com`. */
  baseUrl?: string;
  /** Path of the player page, resolved against `baseUrl` and required to stay on its origin. */
  path: string;
  /** Extra query parameters passed to the player page (theme, start time, ...). */
  params?: Record<string, ParamValue>;
  /** Default `100%`. Numbers are pixels. */
  width?: number | string;
  /** Default `152`. Numbers are pixels. Ignored when `aspectRatio` is set. */
  height?: number | string;
  maxWidth?: number | string;
  /** For video-like players, e.g. `16 / 9`. */
  aspectRatio?: string;
  /** Accessible title for the iframe. */
  title?: string;
  /** Default `autoplay; encrypted-media; picture-in-picture`. */
  allow?: string;
  /** Default `true`. */
  allowFullscreen?: boolean;
  /** Default `true`. Uses native iframe lazy loading. */
  lazy?: boolean;
  /** Milliseconds before a command is rejected. Default `5000`. */
  timeout?: number;
  /** Milliseconds to wait for the player page to announce `ready`. Default `15000`. */
  readyTimeout?: number;
}

export type Defaults = Partial<Omit<PlayerOptions, 'path'>>;

export interface ResolvedOptions {
  baseUrl: string;
  path: string;
  params: Record<string, ParamValue>;
  width: string;
  height: string;
  maxWidth?: string;
  aspectRatio?: string;
  title: string;
  allow: string;
  allowFullscreen: boolean;
  lazy: boolean;
  timeout: number;
  readyTimeout: number;
}

export function cssSize(value: number | string | undefined, fallback?: string): string | undefined {
  if (value === undefined || value === '') return fallback;
  return typeof value === 'number' ? `${value}px` : value;
}

/** Resolve `path` against `baseUrl`, refusing anything that leaves the base origin. */
export function buildUrl(baseUrl: string, path: string, params: Record<string, ParamValue> = {}): URL {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' && base.protocol !== 'http:') {
    throw new TypeError(`Playfold: baseUrl must be http(s), got "${base.protocol}"`);
  }
  const url = new URL(path, base);
  if (url.origin !== base.origin) {
    throw new TypeError('Playfold: path must stay on the baseUrl origin');
  }
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

export function mergeOptions(defaults: Defaults, options: PlayerOptions): ResolvedOptions {
  const baseUrl = options.baseUrl ?? defaults.baseUrl;
  if (!baseUrl) {
    throw new TypeError('Playfold: baseUrl is required (pass it, or call configure({ baseUrl }))');
  }
  if (!options.path) {
    throw new TypeError('Playfold: path is required');
  }
  const pick = <K extends keyof Defaults>(key: K): Defaults[K] =>
    (options as Defaults)[key] !== undefined ? (options as Defaults)[key] : defaults[key];

  return {
    baseUrl,
    path: options.path,
    params: { ...defaults.params, ...options.params },
    width: cssSize(pick('width'), '100%') as string,
    height: cssSize(pick('height'), '152px') as string,
    maxWidth: cssSize(pick('maxWidth')),
    aspectRatio: pick('aspectRatio'),
    title: pick('title') ?? 'Embedded player',
    allow: pick('allow') ?? 'autoplay; encrypted-media; picture-in-picture',
    allowFullscreen: pick('allowFullscreen') ?? true,
    lazy: pick('lazy') ?? true,
    timeout: pick('timeout') ?? 5000,
    readyTimeout: pick('readyTimeout') ?? 15000,
  };
}

/** Read options from `data-*` attributes. Returns null when the element has no `data-playfold` path. */
export function readDataset(el: { dataset: Record<string, string | undefined> }): PlayerOptions | null {
  const d = el.dataset;
  const path = d.playfold;
  if (!path) return null;

  const options: PlayerOptions = { path };
  if (d.baseUrl) options.baseUrl = d.baseUrl;
  if (d.width) options.width = d.width;
  if (d.height) options.height = d.height;
  if (d.maxWidth) options.maxWidth = d.maxWidth;
  if (d.aspectRatio) options.aspectRatio = d.aspectRatio;
  if (d.title) options.title = d.title;

  const params: Record<string, ParamValue> = {};
  for (const [key, value] of Object.entries(d)) {
    if (value !== undefined && key.startsWith('param') && key.length > 5) {
      const name = key.charAt(5).toLowerCase() + key.slice(6);
      params[name] = value;
    }
  }
  if (Object.keys(params).length) options.params = params;
  return options;
}
