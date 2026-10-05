export const PROTOCOL_VERSION = 1;

export type CommandName = 'hello' | 'play' | 'pause' | 'seek' | 'setVolume' | 'getState';
export type EventName =
  | 'ready'
  | 'play'
  | 'pause'
  | 'ended'
  | 'timeupdate'
  | 'durationchange'
  | 'volumechange'
  | 'error';

export interface PlayerState {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  volume: number;
  muted: boolean;
}

export interface EventMap {
  ready: PlayerState;
  play: PlayerState;
  pause: PlayerState;
  ended: PlayerState;
  timeupdate: { currentTime: number; duration: number };
  durationchange: { duration: number };
  volumechange: { volume: number; muted: boolean };
  error: { message: string };
}

export interface CommandMessage {
  playfold: typeof PROTOCOL_VERSION;
  kind: 'command';
  id: string;
  name: CommandName;
  value?: number;
}

export interface ResponseMessage {
  playfold: typeof PROTOCOL_VERSION;
  kind: 'response';
  id: string;
  ok: boolean;
  data?: PlayerState;
  error?: string;
}

export interface EventMessage {
  playfold: typeof PROTOCOL_VERSION;
  kind: 'event';
  name: EventName;
  data?: unknown;
}

export type Message = CommandMessage | ResponseMessage | EventMessage;

const KINDS = ['command', 'response', 'event'];

export function isMessage(data: unknown): data is Message {
  if (typeof data !== 'object' || data === null) return false;
  const m = data as Record<string, unknown>;
  return m.playfold === PROTOCOL_VERSION && typeof m.kind === 'string' && KINDS.includes(m.kind);
}
