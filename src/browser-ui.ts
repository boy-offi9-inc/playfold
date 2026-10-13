import { connectHost } from './host';
import { mountPlayer, playerCss, readParams } from './ui';
import { VERSION } from './version';

const api = { mountPlayer, readParams, playerCss, connectHost, version: VERSION };

(globalThis as unknown as { PlayfoldUI: typeof api }).PlayfoldUI = api;
