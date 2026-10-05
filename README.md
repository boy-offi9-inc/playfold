<p align="center">
  <a href="https://www.npmjs.com/package/@boy-offi9-inc/playfold"><img src="https://img.shields.io/npm/v/%40boy-offi9-inc%2Fplayfold?style=flat-square&label=npm" alt="npm version"></a>
  <a href="https://github.com/boy-offi9-inc/playfold/actions"><img src="https://img.shields.io/github/actions/workflow/status/boy-offi9-inc/playfold/ci.yml?style=flat-square&label=CI" alt="CI"></a>
  <img src="https://img.shields.io/badge/dependencies-0-44cc11?style=flat-square" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/TypeScript-ready-3178C6?style=flat-square" alt="TypeScript">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/boy-offi9-inc/playfold?style=flat-square" alt="MIT License"></a>
</p>

<h1 align="center">Playfold</h1>

<p align="center">
  <strong>Tiny media embeds. Simple control.</strong><br>
  A framework-agnostic SDK for embedding a media player in an iframe and controlling it through a typed, promise-based API.
</p>

---

## What is Playfold?

Playfold connects a page that embeds a player with the player page itself. A thin client and host layer sits on top of an iframe and `postMessage`, so your site gets a simple API for media served from another page.

```
 Your site                               Player page (iframe)
┌─────────────────────┐                 ┌──────────────────────┐
│  Playfold client    │  ── command ──▶ │  Playfold host       │
│  player.play()      │  ◀─ response ── │  <audio> / <video>   │
│  player.on('ended') │  ◀── event ──── │  or a custom player  │
└─────────────────────┘   postMessage   └──────────────────────┘
```

You provide the player page and the media. Playfold does not include a media backend, storage, transcoding or a hosted player.

## Features

- About 8 KB minified, no runtime dependencies
- Core client, host runtime, React wrapper and a script-tag build
- Works with `<audio>`, `<video>` or any custom player through an adapter
- Promise-based commands and typed events
- Origin-checked messaging over a small versioned protocol
- Unit tests and a cross-origin browser test

## Install

```bash
npm install @boy-offi9-inc/playfold
```

Or load the script-tag build (pin the version in production):

```html
<script src="https://cdn.jsdelivr.net/npm/@boy-offi9-inc/playfold@0.1.0/dist/playfold.global.js"></script>
```

The script exposes a global `Playfold` object (`createPlayer`, `configure`, `scan`, `connectHost`, `version`) and mounts `[data-playfold]` elements on page load.

## Quick start

### HTML

```html
<div
  data-playfold="/embed/track/42"
  data-base-url="https://player.example.com"
  data-param-theme="dark"
>
  <a href="https://player.example.com/embed/track/42">Listen</a>
</div>

<script src="https://cdn.jsdelivr.net/npm/@boy-offi9-inc/playfold@0.1.0/dist/playfold.global.js"></script>
```

With JavaScript, the element's content is replaced by the player. Without it, the link stays as a fallback.

### JavaScript / TypeScript

```ts
import { configure, createPlayer } from '@boy-offi9-inc/playfold';

configure({ baseUrl: 'https://player.example.com', height: 152 });

const player = createPlayer('#player', {
  path: '/embed/track/42',
  params: { theme: 'dark' },
});

player.on('timeupdate', ({ currentTime, duration }) => {
  console.log(currentTime, duration);
});

await player.ready;
await player.play();
await player.seek(30);
```

### React

React 17 or newer is an optional peer dependency.

```tsx
import { PlayfoldPlayer } from '@boy-offi9-inc/playfold/react';

export function Player() {
  return (
    <PlayfoldPlayer
      baseUrl="https://player.example.com"
      path="/embed/track/42"
      onEnded={() => next()}
    />
  );
}
```

Pass a `ref` to call `play()`, `pause()`, `seek()`, `setVolume()` and `getState()`. The component remounts when its options change.

## Player page (host)

Call `connectHost` on the page that is loaded inside the iframe.

```ts
import { connectHost } from '@boy-offi9-inc/playfold/host';

const connection = connectHost(document.querySelector('audio')!, {
  allowedOrigins: ['https://example.com'], // default: '*'
});

// later: connection.destroy();
```

For a media element, Playfold announces `ready`, forwards `play`, `pause`, `ended`, `timeupdate` (throttled to 250 ms), `durationchange`, `volumechange` and `error`, and handles all commands.

### Custom players

Anything that is not a media element can implement `HostAdapter`:

```ts
import { connectHost, type HostAdapter } from '@boy-offi9-inc/playfold/host';

const adapter: HostAdapter = {
  play: () => customPlayer.play(),
  pause: () => customPlayer.pause(),
  seek: (seconds) => customPlayer.seek(seconds),
  setVolume: (volume) => customPlayer.setVolume(volume),
  getState: () => customPlayer.getState(),
  subscribe: (emit) =>
    customPlayer.onChange((state) => emit(state.paused ? 'pause' : 'play', state)),
};

connectHost(adapter);
```

`subscribe` receives `emit(name, data)` and returns a function that stops listening.

## Client API

| Member | Description |
| --- | --- |
| `configure(defaults)` | Defaults shared by every player (`baseUrl`, `height`, `params`, and so on). |
| `createPlayer(target, options)` | Mount an iframe into an element or selector and return a `Player`. |
| `scan(root?, selector?)` | Mount every `[data-playfold]` element. Runs automatically in the script-tag build. |
| `player.ready` | Promise that resolves when the player page announces `ready`. |
| `player.play()` `pause()` `seek(seconds)` `setVolume(0..1)` `getState()` | Commands. Each resolves with the current `PlayerState` and rejects on timeout or invalid input. |
| `player.on(event, fn)` | Subscribe and get back an unsubscribe function. `once` and `off` are also available. |
| `player.destroy()` | Remove the iframe and all listeners. |

### Events

| Event | Payload |
| --- | --- |
| `ready`, `play`, `pause`, `ended` | `PlayerState` |
| `timeupdate` | `{ currentTime, duration }` |
| `durationchange` | `{ duration }` |
| `volumechange` | `{ volume, muted }` |
| `error` | `{ message }`, also emitted if the page never announces `ready` |

`PlayerState` is `{ currentTime, duration, paused, ended, volume, muted }`.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `baseUrl` | none | Origin of the player site. Required here or through `configure`. |
| `path` | none | Player page path. Must stay on the `baseUrl` origin. |
| `params` | `{}` | Query parameters added to the player URL. |
| `width` | `100%` | Number (px) or CSS size. |
| `height` | `152` | Number (px) or CSS size. Ignored when `aspectRatio` is set. |
| `maxWidth` | none | Number (px) or CSS size. |
| `aspectRatio` | none | For video, for example `16 / 9`. |
| `title` | `Embedded player` | Accessible iframe title. |
| `allow` | `autoplay; encrypted-media; picture-in-picture` | iframe `allow` attribute. |
| `allowFullscreen` | `true` | Allow fullscreen. |
| `lazy` | `true` | Native lazy loading. |
| `timeout` | `5000` | Milliseconds before a command is rejected. |
| `readyTimeout` | `15000` | Milliseconds to wait for `ready` after the iframe loads. |

For declarative use, options map to `data-base-url`, `data-width`, `data-height`, `data-max-width`, `data-aspect-ratio`, `data-title` and `data-param-*`.

## Protocol

Playfold speaks a small versioned `postMessage` protocol, so any page that implements it can be controlled, with or without this SDK.

```jsonc
// client → player page
{ "playfold": 1, "kind": "command", "id": "42", "name": "seek", "value": 30 }

// player page → client
{ "playfold": 1, "kind": "response", "id": "42", "ok": true,
  "data": { "currentTime": 30, "duration": 180, "paused": false, "ended": false, "volume": 1, "muted": false } }

// player page → client
{ "playfold": 1, "kind": "event", "name": "timeupdate", "data": { "currentTime": 30, "duration": 180 } }
```

Commands: `hello`, `play`, `pause`, `seek`, `setVolume`, `getState`. The client sends `hello` when the iframe loads and the page replies with a `ready` event. Failed responses carry `"ok": false` and an `"error"` string.

## Security

The client:

- accepts messages only from its own iframe, and only from the player origin
- requires an `http` or `https` `baseUrl`
- rejects any `path` that resolves outside the `baseUrl` origin

The host:

- can restrict who may control it with `allowedOrigins`
- validates commands: `seek` must be a non-negative number, and volume is clamped to `0..1`

Your player page must be embeddable. Do not send `X-Frame-Options: DENY`. To choose who may embed it, use a CSP header such as:

```
Content-Security-Policy: frame-ancestors https://example.com
```

`allowedOrigins` limits who can control the player, and `frame-ancestors` limits who can embed it. Use both when you need both.

## Entry points

| Import | Purpose |
| --- | --- |
| `@boy-offi9-inc/playfold` | Client |
| `@boy-offi9-inc/playfold/host` | Player page host |
| `@boy-offi9-inc/playfold/react` | React component |
| `@boy-offi9-inc/playfold/browser` | Script-tag build |

## Scope

Playfold stays small on purpose. It is not a hosting service, transcoder, CDN, analytics tool or player UI framework.

It was inspired by the public APIs of the Vimeo Player API, the YouTube IFrame API, the SoundCloud Widget API and the Spotify iFrame API. The implementation, protocol and naming are original.

## Development

```bash
git clone https://github.com/boy-offi9-inc/playfold.git
cd playfold
npm install
npm run typecheck
npm test
npx playwright install chromium   # once, for the browser test
npm run test:e2e
npm run build
```

## License

[MIT](LICENSE) © Boy Offi9 Inc.
