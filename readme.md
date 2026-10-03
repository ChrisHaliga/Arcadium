# Arcadium

Arcadium (placeholder name) is a game hub: one menu, one coin wallet and one progression
system (levels, daily rewards, missions, shop, chests, cosmetics) shared by several small
games. It is sold once, with no ads and no in-game purchases. The first game is **Landgrab**
(placeholder name), a Paper.io 2-style real-time territory game: steer freely, trail out of
your land and close the loop to claim everything inside it, with up to 16 players a room and
bots filling the empty seats. It is TypeScript, Preact and canvas 2D, plays online through a
small Node match server or offline against bots, and ships to Steam with Electron and to the
App Store and Google Play with Capacitor.

## Quick start

You need Node 22.

```sh
npm install
npx playwright install chromium   # once, for the e2e tests
npm run dev                       # the app: http://localhost:5173
npm run dev:server                # in a second terminal, the match server: ws://localhost:8787/play
```

Practice offline needs no server. To play online on your own machine, run both commands, open
http://localhost:5173 in two tabs and press **Play** in each: both players land in the same
room, with bots in the other seats. Tabs of one browser share a save and so a name; open the
second tab in a private window to play as a different player.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | App dev server with hot reload, http://localhost:5173 |
| `npm run dev:server` | Match server from source, restarting on changes, ws://localhost:8787/play |
| `npm run build` | Typecheck, then build the web app into `dist/` (every platform starts from it) |
| `npm run preview` | Serve `dist/` at http://localhost:4173 |
| `npm run build:server` | Bundle the match server into `dist-server/index.mjs` |
| `npm run start:server` | Run the bundled match server |
| `npm run typecheck` | Typecheck everything, then the match server's part again without the DOM (`tsconfig.server.json`) |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright, Chromium) |

Desktop and mobile builds are covered in [docs/SHIPPING.md](docs/SHIPPING.md).

## Environment variables

| Variable | Read by | Default | Meaning |
| --- | --- | --- | --- |
| `VITE_GAME_SERVERS` | the app, at build or dev-server start | `ws://localhost:8787/play` | Comma-separated match server URLs. The game pings them all and joins the fastest. Store builds need `wss://`. |
| `PORT` | match server | `8787` | Port to listen on. |
| `REGION` | match server | `local` | Region name reported to players and in `/stats`. |

For example: `VITE_GAME_SERVERS=wss://us.example.com/play,wss://eu.example.com/play npm run build`.
Besides the `/play` WebSocket, the server answers `GET /healthz` and `GET /stats`.

## Project map

```
src/main.tsx            entry: builds the services, mounts the hub
src/shared/             contracts between the hub and the games (GameModule, services)
src/hub/                hub UI: home, shop, missions, locker, overlays
src/meta/               economy and progression: save, wallet, XP, missions, daily rewards, chests, shop
src/platform/           saves (web, Electron, Capacitor), haptics, app lifecycle
src/audio/              generated sound effects and music
src/games/registry.ts   the games the hub lists
src/games/landgrab/     Landgrab: core (deterministic rules), ai, room, net, render, input, rewards, ui
server/                 Node match server
desktop/                Electron wrapper for Steam (its own package.json)
dev/landgrab.html       renderer and input test bench (http://localhost:5173/dev/landgrab.html)
e2e/                    Playwright tests
docs/                   architecture, decisions, shipping
```

Landgrab's tuning numbers live in `src/games/landgrab/config.ts`, its colours in `palette.ts`
and its cosmetics and missions in `content.ts`.

## Testing

- `npm test`: the game rules (captures, every death rule, edge sliding, the 98% win,
  determinism), a long bots-only room, and a real match server keeping two WebSocket clients in
  lockstep.
- `npm run test:e2e`: `e2e/smoke.spec.ts` boots to the hub, starts an offline practice match,
  steers a loop with the keyboard and checks that the map share goes up and the canvas draws;
  `e2e/online.spec.ts` has two players press Play against a real match server and meet in one
  room. The config starts its own app and match server on ports 5391 and 8891, so those must
  be free. A failed test keeps a trace: `npx playwright show-trace test-results/<test>/trace.zip`.
- `npm run typecheck` and `npm run build` should pass too.

## Further reading

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the spec and module map, networking model and
  simulation rules.
- [docs/DECISIONS.md](docs/DECISIONS.md): what the owner decided and why. Read it before
  changing direction on anything.
- [docs/SHIPPING.md](docs/SHIPPING.md): match servers, Steam, the App Store and Google Play.
- [CLAUDE.md](CLAUDE.md): code conventions.
