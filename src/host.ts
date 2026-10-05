import { PROTOCOL_VERSION, isMessage } from './protocol';
import type { CommandMessage, EventMessage, EventName, PlayerState, ResponseMessage } from './protocol';

/** Anything the embedding page can control. Implement this for players that are not a media element. */
export interface HostAdapter {
  play(): void | Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  getState(): PlayerState;
  /** Call `emit` when playback changes. Return a function that stops listening. */
  subscribe?(emit: (name: EventName, data?: unknown) => void): () => void;
}

export interface HostOptions {
  /** Origins allowed to control this player. Default `'*'`, as for any public embed. */
  allowedOrigins?: string[] | '*';
  /** Window that embeds this page. Default `window.parent`. */
  parent?: Window;
}

export interface HostConnection {
  emit(name: EventName, data?: unknown): void;
  destroy(): void;
}

function isMediaElement(value: unknown): value is HTMLMediaElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    'currentTime' in value &&
    'paused' in value &&
    typeof (value as HTMLMediaElement).addEventListener === 'function'
  );
}

export function mediaAdapter(el: HTMLMediaElement): HostAdapter {
  const state = (): PlayerState => ({
    currentTime: el.currentTime || 0,
    duration: Number.isFinite(el.duration) ? el.duration : 0,
    paused: el.paused,
    ended: el.ended,
    volume: el.volume,
    muted: el.muted,
  });

  return {
    play: () => el.play(),
    pause: () => el.pause(),
    seek: (seconds) => {
      el.currentTime = seconds;
    },
    setVolume: (volume) => {
      el.volume = volume;
    },
    getState: state,
    subscribe(emit) {
      let last = 0;
      const listen = (type: string, handler: () => void) => {
        el.addEventListener(type, handler);
        return () => el.removeEventListener(type, handler);
      };
      const stops = [
        listen('play', () => emit('play', state())),
        listen('pause', () => emit('pause', state())),
        listen('ended', () => emit('ended', state())),
        listen('timeupdate', () => {
          const now = Date.now();
          if (now - last < 250) return;
          last = now;
          emit('timeupdate', { currentTime: el.currentTime || 0, duration: state().duration });
        }),
        listen('durationchange', () => emit('durationchange', { duration: state().duration })),
        listen('volumechange', () => emit('volumechange', { volume: el.volume, muted: el.muted })),
        listen('error', () => emit('error', { message: el.error?.message || 'Media error' })),
      ];
      return () => stops.forEach((stop) => stop());
    },
  };
}

/** Call this inside the embedded player page so a parent using Playfold can control it. */
export function connectHost(media: HTMLMediaElement | HostAdapter, options: HostOptions = {}): HostConnection {
  const adapter = isMediaElement(media) ? mediaAdapter(media) : media;
  const parent = options.parent ?? window.parent;
  const allowed = options.allowedOrigins ?? '*';
  const targets = allowed === '*' ? ['*'] : allowed;

  const post = (message: EventMessage | ResponseMessage): void => {
    for (const target of targets) {
      try {
        parent.postMessage(message, target);
      } catch {
        /* a target that cannot be reached is skipped */
      }
    }
  };

  const emit = (name: EventName, data?: unknown): void => {
    post({ playfold: PROTOCOL_VERSION, kind: 'event', name, data });
  };

  async function handle(command: CommandMessage): Promise<void> {
    try {
      switch (command.name) {
        case 'hello':
          emit('ready', adapter.getState());
          break;
        case 'play':
          await adapter.play();
          break;
        case 'pause':
          adapter.pause();
          break;
        case 'seek': {
          const seconds = Number(command.value);
          if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('seek expects a non-negative number of seconds');
          adapter.seek(seconds);
          break;
        }
        case 'setVolume': {
          const volume = Number(command.value);
          if (!Number.isFinite(volume)) throw new RangeError('setVolume expects a number between 0 and 1');
          adapter.setVolume(Math.min(1, Math.max(0, volume)));
          break;
        }
        case 'getState':
          break;
        default:
          throw new Error(`unknown command "${String(command.name)}"`);
      }
      post({ playfold: PROTOCOL_VERSION, kind: 'response', id: command.id, ok: true, data: adapter.getState() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      post({ playfold: PROTOCOL_VERSION, kind: 'response', id: command.id, ok: false, error: message });
    }
  }

  const onMessage = (event: MessageEvent): void => {
    if (event.source !== parent) return;
    if (allowed !== '*' && !allowed.includes(event.origin)) return;
    if (!isMessage(event.data) || event.data.kind !== 'command') return;
    void handle(event.data);
  };

  const unsubscribe = adapter.subscribe?.(emit);
  window.addEventListener('message', onMessage);
  emit('ready', adapter.getState());

  return {
    emit,
    destroy() {
      window.removeEventListener('message', onMessage);
      unsubscribe?.();
    },
  };
}
