# Status

Where the project stands at the hand-over from the first build session. Read
`docs/DECISIONS.md` and `docs/ARCHITECTURE.md` first; this file only says what is done, what was
verified, and what is known to be open.

## Done
- **Hub**: home with live bot match behind it and game cards (Landgrab + a coming-soon card),
  daily calendar with streak and freeze, missions with reroll, shop with daily rotation, chests
  with odds and opening sequence, locker (name, colour, loadout), settings, level-up celebration,
  coin fly-to-wallet, keyboard/gamepad navigation, four screen sizes.
- **Economy and saves** (`src/meta`): everything above, saved on the device with debounced writes
  and corruption tolerance.
- **Landgrab**: deterministic free-steering simulation on a 480x480 raster, bots with
  personalities, room authority, smooth renderer (contours, 3D lip, curved trails, skins, effects),
  mouse/touch joystick/keyboard/gamepad input, HUD, risk preview with pending coins, feats with
  rolled multipliers, combos, treasure, milestones, second chance, results with reels, round-win
  flow, pause (really pauses offline), card art and cosmetic previews drawn by the real renderer.
- **Online**: Node match server (rooms, matchmaking, validation, rate limits, seat takeover for a
  reconnecting player id, health/stats endpoints), WebSocket client with prediction, checksum
  desync detection and resync. Offline uses the same code through a loopback.
- **Packaging** (written, not yet run on real targets): Electron wrapper for Steam, Capacitor
  config, server Dockerfile, `docs/SHIPPING.md`.

## Verified (last run, all passing)
`npm run typecheck` (browser and DOM-free server configs), `npm test` (29 tests: rules, room,
networking), `npm run test:e2e` (offline match with a capture; two players meeting online),
`npm run build`, `npm run build:server` (`/healthz` answers). Visual checks were screenshots at
390x844, 844x390, 1280x800 and 1920x1080 in headless Chromium with software rendering.

## Not verified yet
- Real devices: frame rate on a mid-range phone, a Steam Deck, touch feel. Frame times were
  measured in a headless VM without a GPU.
- Electron (`desktop/`) has never been launched; `npx cap add ios|android` has not been run (needs
  a Mac with Xcode / Android Studio). App icons don't exist yet. `appId com.arcadium.app` is a
  placeholder.
- The match server has not been deployed anywhere.

## Known follow-ups (in priority order)
1. **Economy balance.** Coins come in far too fast for the prices: the best reel spin multiplies a
   whole life's earnings, so one good life with a ×10 spin paid 43,030 coins against a top shop
   price of 30,000. Tune `REWARDS` in `src/games/landgrab/config.ts` and/or prices in
   `src/meta/config.ts` — confirm the direction with the owner before changing what reels multiply.
2. **Shop at 1280x800 (Steam Deck)**: the chest price buttons sit under the tab bar until you scroll
   ~68 px.
3. **Seat taken over by another window** shows the generic "Connection lost" screen; it could say
   the game is open elsewhere (`SEAT_TAKEN_OVER` reason). The new window also starts a fresh reward
   tally for the life in progress, so milestones already reached can pay again.
4. The "Online" chip on the Landgrab card is static text, not a live server status.
5. Card art loop: captured treasure gems pop back in instead of fading when the scene restarts.

## Next
The owner wants to start a **second game**. Plan it with them first (reference game, look and
feel, single vs. multiplayer) — see "Working with the owner" in `docs/DECISIONS.md`. A new game is a
folder under `src/games/` exporting a `GameModule` (see `src/shared/game.ts`) plus one line in
`src/games/registry.ts`; it gets the wallet, missions, shop, chests and locker for free. If it is
multiplayer, reuse Landgrab's room/net/server pattern (deterministic sim + command frames).
