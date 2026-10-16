/**
 * Optional default player UI for the page you embed in an iframe.
 *
 * `mountPlayer` builds an accessible audio or video card and connects it to the Playfold host, so a
 * site using the Playfold client can control it. It is separate from the core SDK: import it only if
 * you want a ready-made player. Style it with CSS variables or replace it with your own markup.
 */
import { connectHost } from './host';
import type { HostConnection, HostOptions } from './host';

export interface PlayerLabels {
  play: string;
  pause: string;
  mute: string;
  unmute: string;
  seek: string;
  fullscreen: string;
  exitFullscreen: string;
  error: string;
  player: string;
}

export interface PlayerColors {
  /** Play button, and the base for the seek bar and label. */
  accent?: string;
  /** Icon on the play button. Default: black or white, whichever reads better on `accent`. */
  onAccent?: string;
  /** Color of the small label. Default: `accent`, nudged until it has 4.5:1 contrast on the card. */
  accentText?: string;
  /** Seek bar fill and thumb. Default: `accent`, nudged until it has 3:1 contrast on the card. */
  accentUi?: string;
  background?: string;
  text?: string;
  muted?: string;
  /** The unplayed part of the seek bar. */
  track?: string;
}

export interface PlayerUIOptions {
  /** Media file URL. Must be http(s), or relative to the page. */
  src: string;
  /** Guessed from the file extension when omitted. */
  type?: 'audio' | 'video';
  title?: string;
  /** Second line, usually the artist. */
  subtitle?: string;
  /** Small label above the title, for example your brand name. */
  eyebrow?: string;
  /** Cover art for audio, poster frame for video. */
  poster?: string;
  /** Try to start playback. Browsers usually block this until the person interacts. */
  autoplay?: boolean;
  loop?: boolean;
  /** Default `metadata`. */
  preload?: 'none' | 'metadata' | 'auto';
  /** Default `dark`. `auto` follows the system setting. */
  theme?: 'dark' | 'light' | 'auto';
  /** Shorthand for `colors.accent`. Any CSS color. */
  accent?: string;
  /**
   * Brand colors. Anything you leave out is derived or taken from the theme. `onAccent`,
   * `accentText` and `accentUi` are worked out from `accent` so that icons, labels and the seek
   * bar stay readable on any accent. Pass them only to pin an exact value. Values that are not
   * valid CSS colors are ignored.
   */
  colors?: PlayerColors;
  /** Refuse any `src` or `poster` outside these origins. Set this if you read them from the URL. */
  allowedSrcOrigins?: string[];
  /**
   * Connect to the Playfold host so a parent page can control this player. By default it connects
   * only when the page is inside an iframe. Pass options to always connect, or `false` to never.
   */
  host?: boolean | HostOptions;
  /** CSP nonce for the injected <style>. Or include `playerCss` in your own stylesheet. */
  nonce?: string;
  /** Replace any of the built-in English labels. */
  labels?: Partial<PlayerLabels>;
}

export interface PlayerUI {
  element: HTMLElement;
  media: HTMLMediaElement;
  destroy(): void;
}

const DEFAULT_LABELS: PlayerLabels = {
  play: 'Play',
  pause: 'Pause',
  mute: 'Mute',
  unmute: 'Unmute',
  seek: 'Seek',
  fullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  error: 'This media could not be played.',
  player: 'Media player',
};

/** The stylesheet, exported so strict-CSP pages can ship it as a normal file. */
export const playerCss = `
.pf-root{--pf-accent:#f97316;--pf-on-accent:#0b0f19;--pf-accent-text:var(--pf-accent);--pf-accent-ui:var(--pf-accent);--pf-bg:#0b1020;--pf-fg:#f8fafc;--pf-muted:#94a3b8;--pf-track:#334155;--pf-edge:rgba(255,255,255,.1);--pf-radius:16px;--pf-max-h:70vh;--pf-font:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-sizing:border-box;display:block;width:100%;padding:16px;border-radius:var(--pf-radius);background:var(--pf-bg);color:var(--pf-fg);box-shadow:inset 0 0 0 1px var(--pf-edge);font:15px/1.4 var(--pf-font);text-align:left}
.pf-root *{box-sizing:border-box}
.pf-root[data-theme=light]{--pf-bg:#fff;--pf-fg:#0f172a;--pf-muted:#64748b;--pf-track:#cbd5e1;--pf-edge:#e2e8f0}
@media (prefers-color-scheme:light){.pf-root[data-theme=auto]{--pf-bg:#fff;--pf-fg:#0f172a;--pf-muted:#64748b;--pf-track:#cbd5e1;--pf-edge:#e2e8f0}}
.pf-head{display:flex;align-items:center;gap:12px;min-width:0}
.pf-cover{flex:none;width:56px;height:56px;border-radius:10px;object-fit:cover;background:var(--pf-track)}
.pf-meta{min-width:0}
.pf-eyebrow{margin:0;color:var(--pf-accent-text);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.pf-title{margin:0;font-size:18px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-sub{margin:0;font-size:15px;color:var(--pf-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-screen{--pf-ratio:1.7778;position:relative;overflow:hidden;width:min(100%,calc(var(--pf-max-h)*var(--pf-ratio)));margin:0 auto 12px;border-radius:12px;background:#000;aspect-ratio:var(--pf-ratio)}
.pf-screen video{display:block;width:100%;height:100%;object-fit:contain}
.pf-controls{display:flex;align-items:center;gap:10px;margin-top:14px}
.pf-screen+.pf-head,.pf-screen+.pf-controls{margin-top:0}
.pf-root button.pf-btn{all:unset;box-sizing:border-box;flex:none;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;color:var(--pf-fg);cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.pf-root button.pf-btn:hover{background:color-mix(in srgb,var(--pf-fg) 12%,transparent)}
.pf-root button.pf-play{width:44px;height:44px;background:var(--pf-accent);color:var(--pf-on-accent)}
.pf-root button.pf-play:hover{background:var(--pf-accent);filter:brightness(1.08)}
.pf-root button.pf-btn:focus-visible,.pf-root input.pf-seek:focus-visible{outline:2px solid var(--pf-accent-ui);outline-offset:2px}
.pf-time{flex:none;min-width:38px;color:var(--pf-muted);font-size:13px;font-variant-numeric:tabular-nums}
.pf-time[data-end]{text-align:right}
.pf-root input.pf-seek{all:unset;box-sizing:border-box;flex:1;min-width:0;height:24px;cursor:pointer;-webkit-appearance:none;appearance:none;background:transparent}
.pf-root input.pf-seek:disabled{cursor:default;opacity:.5}
.pf-seek::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(to right,var(--pf-accent-ui) var(--pf-progress,0%),var(--pf-track) var(--pf-progress,0%))}
.pf-seek::-moz-range-track{height:6px;border-radius:3px;background:var(--pf-track)}
.pf-seek::-moz-range-progress{height:6px;border-radius:3px;background:var(--pf-accent-ui)}
.pf-seek::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;margin-top:-4px;border:0;border-radius:50%;background:var(--pf-accent-ui)}
.pf-seek::-moz-range-thumb{width:14px;height:14px;border:0;border-radius:50%;background:var(--pf-accent-ui)}
.pf-error{margin:10px 0 0;color:#f87171;font-size:13px}
.pf-root[data-loading] .pf-play svg{opacity:.55}
.pf-root:fullscreen{display:flex;flex-direction:column;justify-content:center;border-radius:0}
.pf-root:fullscreen .pf-screen{flex:1;width:100%;aspect-ratio:auto;margin:0 0 12px;border-radius:0}
@media (prefers-reduced-motion:no-preference){.pf-root button.pf-btn{transition:background-color .15s,filter .15s}}
`;

const ICONS = {
  play: '<path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/>',
  pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
  volume:
    '<path d="M3 9.5v5h4l5 4v-13l-5 4H3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  muted:
    '<path d="M3 9.5v5h4l5 4v-13l-5 4H3z"/><path d="M16 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  enter:
    '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  exit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
} as const;

type IconName = keyof typeof ICONS;

// Static, trusted markup only. Nothing from the caller is ever put through innerHTML.
function setIcon(button: HTMLElement, name: IconName): void {
  button.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}

/** `75` becomes `1:15`, and `3725` becomes `1:02:05`. Invalid input becomes `0:00`. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv)$/i;

function guessType(src: string): 'audio' | 'video' {
  try {
    return VIDEO_EXT.test(new URL(src, document.baseURI).pathname) ? 'video' : 'audio';
  } catch {
    return 'audio';
  }
}

function safeUrl(value: string, label: string, allowedOrigins?: string[]): string {
  let url: URL;
  try {
    url = new URL(value, document.baseURI);
  } catch {
    throw new TypeError(`Playfold UI: ${label} is not a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(`Playfold UI: ${label} must use http or https`);
  }
  if (allowedOrigins && !allowedOrigins.includes(url.origin)) {
    throw new TypeError(`Playfold UI: ${label} origin ${url.origin} is not allowed`);
  }
  return url.href;
}

/**
 * Read player options from a query string, for a generic player page such as
 * `/player?src=...&title=...`. Pair it with `allowedSrcOrigins` so the page cannot be
 * pointed at anyone's files.
 */
export function readParams(search: string = typeof location === 'undefined' ? '' : location.search): Partial<PlayerUIOptions> {
  const q = new URLSearchParams(search);
  const out: Partial<PlayerUIOptions> = {};
  for (const key of ['src', 'title', 'subtitle', 'eyebrow', 'poster'] as const) {
    const value = q.get(key);
    if (value) out[key] = value;
  }
  // Colors may be written without the leading #, which is awkward in a URL.
  const color = (name: string): string | undefined => {
    const value = q.get(name)?.trim();
    if (!value) return undefined;
    return /^[0-9a-f]{3,8}$/i.test(value) ? `#${value}` : value;
  };
  const accent = color('accent');
  if (accent) out.accent = accent;
  const background = color('bg');
  const text = color('fg');
  if (background || text) out.colors = { ...(background && { background }), ...(text && { text }) };
  const type = q.get('type');
  if (type === 'audio' || type === 'video') out.type = type;
  const theme = q.get('theme');
  if (theme === 'dark' || theme === 'light' || theme === 'auto') out.theme = theme;
  const flag = (name: string): boolean => q.get(name) === '1' || q.get(name) === 'true';
  if (flag('autoplay')) out.autoplay = true;
  if (flag('loop')) out.loop = true;
  return out;
}

type RGB = [number, number, number];

/** Accepts only real CSS colors. This also stops `url(...)` from being smuggled in as a "color". */
function cssColor(value: string | undefined): string | undefined {
  if (!value || typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return undefined;
  return CSS.supports('color', value) ? value : undefined;
}

// Browsers report resolved colors as rgb(), rgba() or color(srgb ...).
function parseColor(css: string): RGB | undefined {
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?/i.exec(css);
  const srgb = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?/i.exec(css);
  const m = rgb ?? srgb;
  if (!m) return undefined;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (!(alpha > 0)) return undefined;
  const scale = srgb ? 255 : 1;
  return [Number(m[1]) * scale, Number(m[2]) * scale, Number(m[3]) * scale];
}

function luminance([r, g, b]: RGB): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Move `color` toward white (on a dark card) or black (on a light one) until it reads at `ratio`. */
function readableOn(color: RGB, background: RGB, ratio: number): RGB {
  if (contrast(color, background) >= ratio) return color;
  const target: RGB = luminance(background) < 0.5 ? [255, 255, 255] : [0, 0, 0];
  for (let t = 0.1; t <= 1.001; t += 0.1) {
    const c = color.map((v, i) => v + (target[i] - v) * t) as RGB;
    if (contrast(c, background) >= ratio) return c;
  }
  return target;
}

const rgbCss = (c: RGB): string => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;

function ensureStyles(nonce?: string): void {
  if (document.querySelector('style[data-playfold-ui]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-playfold-ui', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = playerCss;
  document.head.appendChild(style);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

type FullscreenMedia = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

export function mountPlayer(target: HTMLElement | string, options: PlayerUIOptions): PlayerUI {
  const container = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!container) throw new Error(`Playfold UI: no element matches "${String(target)}"`);
  if (!options || typeof options.src !== 'string' || !options.src) throw new TypeError('Playfold UI: src is required');

  const labels = { ...DEFAULT_LABELS, ...options.labels };
  const src = safeUrl(options.src, 'src', options.allowedSrcOrigins);
  const poster = options.poster ? safeUrl(options.poster, 'poster', options.allowedSrcOrigins) : undefined;
  const type = options.type ?? guessType(src);
  const isVideo = type === 'video';

  ensureStyles(options.nonce);
  const ac = new AbortController();
  const { signal } = ac;
  const on = <T extends EventTarget>(node: T, name: string, handler: (event: Event) => void): void =>
    node.addEventListener(name, handler, { signal });

  const root = el('div', 'pf-root');
  root.dataset.theme = options.theme ?? 'dark';
  root.dataset.type = type;
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', options.title || labels.player);

  const colors: PlayerColors = { accent: options.accent, ...options.colors };
  const COLOR_VARS: Array<[keyof PlayerColors, string]> = [
    ['accent', '--pf-accent'],
    ['onAccent', '--pf-on-accent'],
    ['accentText', '--pf-accent-text'],
    ['accentUi', '--pf-accent-ui'],
    ['background', '--pf-bg'],
    ['text', '--pf-fg'],
    ['muted', '--pf-muted'],
    ['track', '--pf-track'],
  ];
  for (const [key, name] of COLOR_VARS) {
    const value = cssColor(colors[key]);
    if (value) root.style.setProperty(name, value);
  }

  const media = (isVideo ? el('video') : el('audio')) as HTMLMediaElement;
  media.preload = options.preload ?? 'metadata';
  media.loop = !!options.loop;
  media.setAttribute('playsinline', '');
  media.src = src;

  if (isVideo) {
    const screen = el('div', 'pf-screen');
    if (poster) (media as HTMLVideoElement).poster = poster;
    screen.appendChild(media);
    root.appendChild(screen);
    on(media, 'click', () => toggle());
  } else {
    media.hidden = true;
    root.appendChild(media);
  }

  if (options.title || options.subtitle || options.eyebrow || (poster && !isVideo)) {
    const head = el('div', 'pf-head');
    if (poster && !isVideo) {
      const cover = el('img', 'pf-cover');
      cover.alt = '';
      cover.decoding = 'async';
      cover.src = poster;
      on(cover, 'error', () => cover.remove());
      head.appendChild(cover);
    }
    const meta = el('div', 'pf-meta');
    if (options.eyebrow) meta.appendChild(el('p', 'pf-eyebrow', options.eyebrow));
    if (options.title) meta.appendChild(el('p', 'pf-title', options.title));
    if (options.subtitle) meta.appendChild(el('p', 'pf-sub', options.subtitle));
    head.appendChild(meta);
    root.appendChild(head);
  }

  const controls = el('div', 'pf-controls');
  const play = el('button', 'pf-btn pf-play');
  play.type = 'button';
  const current = el('span', 'pf-time', '0:00');
  const seek = el('input', 'pf-seek');
  seek.type = 'range';
  seek.min = '0';
  seek.max = '0';
  seek.step = 'any';
  seek.value = '0';
  seek.disabled = true;
  seek.setAttribute('aria-label', labels.seek);
  const length = el('span', 'pf-time', '0:00');
  length.dataset.end = '';
  const mute = el('button', 'pf-btn');
  mute.type = 'button';
  controls.append(play, current, seek, length, mute);

  let fullscreen: HTMLButtonElement | undefined;
  const nativeFullscreen = isVideo && typeof (media as FullscreenMedia).webkitEnterFullscreen === 'function';
  if (isVideo && (document.fullscreenEnabled || nativeFullscreen)) {
    fullscreen = el('button', 'pf-btn');
    fullscreen.type = 'button';
    controls.appendChild(fullscreen);
  }
  root.appendChild(controls);

  const errorLine = el('p', 'pf-error');
  errorLine.setAttribute('role', 'alert');
  errorLine.hidden = true;
  root.appendChild(errorLine);

  let scrubbing = false;
  const duration = (): number => (Number.isFinite(media.duration) ? media.duration : 0);

  const paintTime = (t: number, d: number): void => {
    const pct = d ? Math.min(100, Math.max(0, (t / d) * 100)) : 0;
    seek.style.setProperty('--pf-progress', `${pct}%`);
    current.textContent = formatTime(t);
    seek.setAttribute('aria-valuetext', `${formatTime(t)} of ${formatTime(d)}`);
  };

  const sync = (): void => {
    const d = duration();
    const t = media.currentTime || 0;
    seek.max = String(d);
    seek.disabled = !d;
    length.textContent = formatTime(d);
    if (!scrubbing) {
      seek.value = String(t);
      paintTime(t, d);
    }
  };

  const syncPlay = (): void => {
    const playing = !media.paused && !media.ended;
    setIcon(play, playing ? 'pause' : 'play');
    play.setAttribute('aria-label', playing ? labels.pause : labels.play);
  };

  const syncMute = (): void => {
    const silent = media.muted || media.volume === 0;
    setIcon(mute, silent ? 'muted' : 'volume');
    mute.setAttribute('aria-label', silent ? labels.unmute : labels.mute);
  };

  const syncFullscreen = (): void => {
    if (!fullscreen) return;
    const active = document.fullscreenElement === root;
    setIcon(fullscreen, active ? 'exit' : 'enter');
    fullscreen.setAttribute('aria-label', active ? labels.exitFullscreen : labels.fullscreen);
  };

  function toggle(): void {
    if (media.paused || media.ended) {
      // A refused play() (autoplay policy) is not an error worth showing: the person can press play.
      media.play().catch(() => undefined);
    } else {
      media.pause();
    }
  }

  on(play, 'click', toggle);
  on(mute, 'click', () => {
    media.muted = !(media.muted || media.volume === 0);
    if (!media.muted && media.volume === 0) media.volume = 1;
  });
  if (fullscreen) {
    on(fullscreen, 'click', () => {
      if (document.fullscreenElement === root) void document.exitFullscreen();
      else if (document.fullscreenEnabled) void root.requestFullscreen().catch(() => undefined);
      else (media as FullscreenMedia).webkitEnterFullscreen?.();
    });
    on(document, 'fullscreenchange', syncFullscreen);
  }

  on(seek, 'input', () => {
    scrubbing = true;
    paintTime(Number(seek.value), duration());
  });
  on(seek, 'change', () => {
    media.currentTime = Number(seek.value);
    scrubbing = false;
    sync();
  });
  on(seek, 'keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    const d = duration();
    const step = key === 'ArrowRight' || key === 'ArrowUp' ? 5 : key === 'ArrowLeft' || key === 'ArrowDown' ? -5 : 0;
    if (!d || (!step && key !== 'Home' && key !== 'End')) return;
    event.preventDefault();
    const next = key === 'Home' ? 0 : key === 'End' ? d : media.currentTime + step;
    media.currentTime = Math.min(d, Math.max(0, next));
  });
  on(seek, 'blur', () => {
    scrubbing = false;
    sync();
  });

  for (const name of ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked', 'emptied']) on(media, name, sync);
  for (const name of ['play', 'pause', 'ended']) on(media, name, syncPlay);
  on(media, 'volumechange', syncMute);
  for (const name of ['waiting', 'seeking']) on(media, name, () => (root.dataset.loading = ''));
  for (const name of ['playing', 'canplay', 'pause', 'seeked']) on(media, name, () => delete root.dataset.loading);
  on(media, 'error', () => {
    errorLine.textContent = labels.error;
    errorLine.hidden = false;
    delete root.dataset.loading;
  });
  on(media, 'loadstart', () => {
    errorLine.hidden = true;
  });

  // Lock-screen and headset controls.
  const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
  const sessionActions: MediaSessionAction[] = ['play', 'pause', 'seekto', 'seekbackward', 'seekforward'];
  if (session) {
    try {
      if (options.title && typeof MediaMetadata !== 'undefined') {
        session.metadata = new MediaMetadata({
          title: options.title,
          artist: options.subtitle ?? '',
          album: options.eyebrow ?? '',
          artwork: poster ? [{ src: poster }] : [],
        });
      }
      session.setActionHandler('play', () => void media.play().catch(() => undefined));
      session.setActionHandler('pause', () => media.pause());
      session.setActionHandler('seekto', (d) => {
        if (typeof d.seekTime === 'number') media.currentTime = d.seekTime;
      });
      session.setActionHandler('seekbackward', (d) => {
        media.currentTime = Math.max(0, media.currentTime - (d.seekOffset ?? 10));
      });
      session.setActionHandler('seekforward', (d) => {
        media.currentTime = Math.min(duration() || Infinity, media.currentTime + (d.seekOffset ?? 10));
      });
    } catch {
      /* an action this browser does not support is simply skipped */
    }
  }

  // Size the video box to the real picture, so a portrait clip is not squeezed into 16:9.
  const screenBox = root.querySelector<HTMLElement>('.pf-screen');
  if (screenBox) {
    const fit = (): void => {
      const { videoWidth: w, videoHeight: h } = media as HTMLVideoElement;
      if (w > 0 && h > 0) screenBox.style.setProperty('--pf-ratio', String(w / h));
    };
    on(media, 'loadedmetadata', fit);
    on(media, 'resize', fit);
  }

  // Work out text and icon colors that stay readable on whatever accent and card color are in use.
  const resolve = (name: string): RGB | undefined => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
    probe.style.backgroundColor = `var(${name})`;
    root.appendChild(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return parseColor(value);
  };
  const derive = (): void => {
    const accent = resolve('--pf-accent');
    if (!accent) return;
    if (!cssColor(colors.onAccent)) {
      const dark: RGB = [11, 15, 25];
      const light: RGB = [255, 255, 255];
      root.style.setProperty('--pf-on-accent', rgbCss(contrast(accent, dark) >= contrast(accent, light) ? dark : light));
    }
    const card = resolve('--pf-bg');
    if (!card) return;
    if (!cssColor(colors.accentText)) root.style.setProperty('--pf-accent-text', rgbCss(readableOn(accent, card, 4.5)));
    if (!cssColor(colors.accentUi)) root.style.setProperty('--pf-accent-ui', rgbCss(readableOn(accent, card, 3)));
  };

  syncPlay();
  syncMute();
  syncFullscreen();
  sync();
  container.appendChild(root);
  derive();
  if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: light)').addEventListener('change', derive, { signal });

  let connection: HostConnection | undefined;
  const hostOption = options.host ?? true;
  if (hostOption && (typeof hostOption === 'object' || window.parent !== window)) {
    connection = connectHost(media, typeof hostOption === 'object' ? hostOption : {});
  }

  if (options.autoplay) media.play().catch(() => undefined);

  return {
    element: root,
    media,
    destroy() {
      ac.abort();
      connection?.destroy();
      if (session) {
        for (const action of sessionActions) {
          try {
            session.setActionHandler(action, null);
          } catch {
            /* ignore */
          }
        }
        session.metadata = null;
      }
      media.pause();
      media.removeAttribute('src');
      media.load();
      root.remove();
    },
  };
}
