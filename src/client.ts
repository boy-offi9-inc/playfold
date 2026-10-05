import { PROTOCOL_VERSION, isMessage } from './protocol';
import type { CommandMessage, CommandName, EventMap, EventName, PlayerState } from './protocol';
import { buildUrl, mergeOptions, readDataset } from './options';
import type { Defaults, PlayerOptions } from './options';

type AnyListener = (data: never) => void;

interface Inflight {
  id?: string;
  resolve(state: PlayerState): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

let defaults: Defaults = {};
let counter = 0;
const mounted = new WeakMap<Element, Player>();

/** Set site-wide defaults (baseUrl, height, params, ...). Later calls merge into earlier ones. */
export function configure(next: Defaults): void {
  defaults = { ...defaults, ...next, params: { ...defaults.params, ...next.params } };
}

export class Player {
  /** The iframe element. Style it freely; it has the class `playfold-frame`. */
  readonly iframe: HTMLIFrameElement;
  /** Resolves once the player page has announced `ready`. */
  readonly ready: Promise<void>;

  private readonly target: Element;
  private readonly origin: string;
  private readonly timeout: number;
  private readonly listeners = new Map<EventName, Set<AnyListener>>();
  private readonly inflight = new Set<Inflight>();
  private resolveReady!: () => void;
  private readyTimer?: ReturnType<typeof setTimeout>;
  private isReady = false;
  private destroyed = false;

  constructor(target: HTMLElement, options: PlayerOptions) {
    const o = mergeOptions(defaults, options);
    const url = buildUrl(o.baseUrl, o.path, o.params);

    this.target = target;
    this.origin = url.origin;
    this.timeout = o.timeout;
    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });

    const iframe = target.ownerDocument.createElement('iframe');
    iframe.className = 'playfold-frame';
    iframe.src = url.href;
    iframe.title = o.title;
    iframe.setAttribute('allow', o.allow);
    if (o.allowFullscreen) iframe.setAttribute('allowfullscreen', '');
    if (o.lazy) iframe.setAttribute('loading', 'lazy');

    const style = iframe.style;
    style.display = 'block';
    style.border = '0';
    style.width = o.width;
    if (o.maxWidth) style.maxWidth = o.maxWidth;
    if (o.aspectRatio) style.aspectRatio = o.aspectRatio;
    else style.height = o.height;

    iframe.addEventListener('load', () => {
      if (this.destroyed || this.isReady) return;
      this.post('hello').catch(() => {});
      this.readyTimer = setTimeout(() => {
        if (!this.isReady && !this.destroyed) {
          this.emit('error', { message: 'Playfold: the player page did not announce ready' });
        }
      }, o.readyTimeout);
    });

    window.addEventListener('message', this.onMessage);
    target.insertBefore(iframe, target.firstChild);
    this.iframe = iframe;
    mounted.set(target, this);
  }

  on<K extends EventName>(name: K, listener: (data: EventMap[K]) => void): () => void {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(listener as AnyListener);
    return () => this.off(name, listener);
  }

  once<K extends EventName>(name: K, listener: (data: EventMap[K]) => void): () => void {
    const off = this.on(name, (data) => {
      off();
      listener(data);
    });
    return off;
  }

  off<K extends EventName>(name: K, listener: (data: EventMap[K]) => void): void {
    this.listeners.get(name)?.delete(listener as AnyListener);
  }

  play(): Promise<void> {
    return this.command('play').then(() => undefined);
  }

  pause(): Promise<void> {
    return this.command('pause').then(() => undefined);
  }

  seek(seconds: number): Promise<void> {
    return this.command('seek', seconds).then(() => undefined);
  }

  setVolume(volume: number): Promise<void> {
    return this.command('setVolume', volume).then(() => undefined);
  }

  getState(): Promise<PlayerState> {
    return this.command('getState');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('message', this.onMessage);
    clearTimeout(this.readyTimer);
    for (const entry of [...this.inflight]) {
      this.settle(entry);
      entry.reject(new Error('Playfold: player was destroyed'));
    }
    this.listeners.clear();
    this.iframe.remove();
    if (mounted.get(this.target) === this) mounted.delete(this.target);
  }

  private onMessage = (event: MessageEvent): void => {
    if (event.source !== this.iframe.contentWindow || event.origin !== this.origin) return;
    const message = event.data;
    if (!isMessage(message)) return;

    if (message.kind === 'response') {
      for (const entry of this.inflight) {
        if (entry.id !== message.id) continue;
        this.settle(entry);
        if (message.ok && message.data) entry.resolve(message.data);
        else entry.reject(new Error(message.error ?? `Playfold: command failed`));
        return;
      }
    } else if (message.kind === 'event') {
      if (message.name === 'ready' && !this.isReady) {
        this.isReady = true;
        clearTimeout(this.readyTimer);
        this.resolveReady();
      }
      this.emit(message.name, message.data);
    }
  };

  private settle(entry: Inflight): void {
    clearTimeout(entry.timer);
    this.inflight.delete(entry);
  }

  private emit(name: EventName, data: unknown): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as (data: unknown) => void)(data);
      } catch (error) {
        console.error('[playfold] listener error', error);
      }
    }
  }

  private send(entry: Inflight, name: CommandName, value?: number): void {
    const win = this.iframe.contentWindow;
    if (!win || this.destroyed) {
      this.settle(entry);
      entry.reject(new Error('Playfold: player is not attached'));
      return;
    }
    entry.id = `pf${++counter}`;
    const message: CommandMessage = { playfold: PROTOCOL_VERSION, kind: 'command', id: entry.id, name, value };
    win.postMessage(message, this.origin);
  }

  private request(name: CommandName, value: number | undefined, waitForReady: boolean): Promise<PlayerState> {
    if (this.destroyed) return Promise.reject(new Error('Playfold: player was destroyed'));
    return new Promise<PlayerState>((resolve, reject) => {
      const entry: Inflight = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.inflight.delete(entry);
          reject(new Error(`Playfold: "${name}" timed out`));
        }, this.timeout),
      };
      this.inflight.add(entry);
      if (waitForReady) this.ready.then(() => this.inflight.has(entry) && this.send(entry, name, value));
      else this.send(entry, name, value);
    });
  }

  private post(name: CommandName): Promise<PlayerState> {
    return this.request(name, undefined, false);
  }

  private command(name: CommandName, value?: number): Promise<PlayerState> {
    return this.request(name, value, true);
  }
}

export function createPlayer(target: HTMLElement | string, options: PlayerOptions): Player {
  const element = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!element) throw new Error(`Playfold: target "${String(target)}" was not found`);
  if (mounted.has(element)) throw new Error('Playfold: this element already has a player');
  return new Player(element, options);
}

/** Mount a player into every element that has a `data-playfold` attribute. */
export function scan(root: ParentNode = document, selector = '[data-playfold]'): Player[] {
  const players: Player[] = [];
  root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    if (mounted.has(el)) return;
    const options = readDataset(el);
    if (!options) return;
    try {
      players.push(createPlayer(el, options));
    } catch (error) {
      console.warn('[playfold]', error);
    }
  });
  return players;
}
