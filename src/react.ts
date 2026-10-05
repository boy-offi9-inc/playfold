import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { CSSProperties } from 'react';
import { createPlayer } from './client';
import type { Player } from './client';
import type { PlayerOptions } from './options';
import type { EventMap, PlayerState } from './protocol';

export interface PlayfoldPlayerProps extends PlayerOptions {
  className?: string;
  style?: CSSProperties;
  onReady?: (state: PlayerState) => void;
  onPlay?: (state: PlayerState) => void;
  onPause?: (state: PlayerState) => void;
  onEnded?: (state: PlayerState) => void;
  onTimeUpdate?: (data: EventMap['timeupdate']) => void;
  onError?: (data: EventMap['error']) => void;
}

export interface PlayfoldPlayerHandle {
  readonly player: Player | null;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  getState(): Promise<PlayerState>;
}

export const PlayfoldPlayer = forwardRef<PlayfoldPlayerHandle, PlayfoldPlayerProps>(function PlayfoldPlayer(
  props,
  ref,
) {
  const { className, style, onReady, onPlay, onPause, onEnded, onTimeUpdate, onError, ...options } = props;
  const container = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const handlers = useRef({ onReady, onPlay, onPause, onEnded, onTimeUpdate, onError });
  handlers.current = { onReady, onPlay, onPause, onEnded, onTimeUpdate, onError };

  const key = JSON.stringify(options);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const player = createPlayer(element, JSON.parse(key) as PlayerOptions);
    playerRef.current = player;
    const stops = [
      player.on('ready', (s) => handlers.current.onReady?.(s)),
      player.on('play', (s) => handlers.current.onPlay?.(s)),
      player.on('pause', (s) => handlers.current.onPause?.(s)),
      player.on('ended', (s) => handlers.current.onEnded?.(s)),
      player.on('timeupdate', (d) => handlers.current.onTimeUpdate?.(d)),
      player.on('error', (d) => handlers.current.onError?.(d)),
    ];
    return () => {
      stops.forEach((stop) => stop());
      player.destroy();
      playerRef.current = null;
    };
  }, [key]);

  useImperativeHandle(
    ref,
    () => {
      const call = <T,>(fn: (player: Player) => Promise<T>): Promise<T> =>
        playerRef.current ? fn(playerRef.current) : Promise.reject(new Error('Playfold: player is not mounted'));
      return {
        get player() {
          return playerRef.current;
        },
        play: () => call((p) => p.play()),
        pause: () => call((p) => p.pause()),
        seek: (seconds: number) => call((p) => p.seek(seconds)),
        setVolume: (volume: number) => call((p) => p.setVolume(volume)),
        getState: () => call((p) => p.getState()),
      };
    },
    [],
  );

  return createElement('div', { ref: container, className, style });
});
