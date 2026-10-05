import { Player, configure, createPlayer, scan } from './client';
import { connectHost } from './host';
import { VERSION } from './version';

const api = { Player, createPlayer, configure, scan, connectHost, version: VERSION };

(globalThis as unknown as { Playfold: typeof api }).Playfold = api;

if (typeof document !== 'undefined') {
  const run = (): void => {
    scan();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}
