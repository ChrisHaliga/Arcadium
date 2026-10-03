# Arcadium architecture

Arcadium (placeholder name) is a hub that bundles several small games behind one menu,
one wallet and one progression system. Landgrab (placeholder name) is the first game: a
real-time multiplayer territory game in the style of Paper.io.

Tech: TypeScript, Vite, Preact + @preact/signals for UI, HTML canvas 2D for game rendering,
Node + `ws` for the match server. Desktop (Steam) ships through Electron, mobile through Capacitor.

## Directory map

```
src/
  main.tsx                 hub bootstrap (creates services, mounts the hub)
  shared/                  CONTRACTS between hub and games (game.ts, services.ts), the player-name rule
                           (names.ts, also used by the match server), plus ui/nav: keyboard and gamepad focus
                           navigation, and ui/kit: icons, coin, 3D button, colour tokens and motion — both
                           used by the hub and by every game's UI
  hub/                     hub UI: home, game cards, shop, chests, missions, daily rewards, profile, settings
  meta/                    hub economy & progression logic: save data, wallet, XP/levels, missions,
                           daily calendar & streaks, chests, shop rotation, cosmetics ownership, settings
  platform/                storage adapters (web, Electron, Capacitor), haptics, app lifecycle
  audio/                   generated sound effects + music/tension layer (WebAudio, no asset files)
  games/
    registry.ts            list of GameModules shown in the hub, and the featured one (whose colours the hub shows)
    landgrab/
      index.ts             the GameModule: wires game/ and art/ into the hub contract
      config.ts            ALL tuning numbers (sim, room, net, rewards)
      palette.ts           player & map colours (vivid humans, muted bots)
      content.ts           cosmetics catalog + missions this game contributes
      core/                deterministic simulation (rules of the game). No DOM, no timers, no network.
      ai/                  bot brains (personalities). Run only on the match authority.
      room/                match authority: sim + bots + seats + rounds + revive/respawn rules
      net/                 host side: protocol, codec, validation, session, RoomHost, ticker (shared by the
                           server and the local host); client side: MatchClient (prediction), clock,
                           server picking, transports (WebSocket, loopback), local host
      render/              canvas renderer, camera, effects, cosmetics drawing, minimap
      input/               mouse, touch joystick, keyboard, gamepad -> target heading
      rewards/             turns confirmed sim events into coins, XP, feats, combos, milestones
      ui/                  in-match Preact overlays: HUD (leaderboard, minimap), revive, results & reels
      game/                a launched game: session (layers, connecting, pausing), match wiring (client to
                           renderer, input, rewards, sound, overlays), HUD sync, the hub's attract match
      art/                 hub art drawn by the match renderer: the card's live scene and the cosmetic
                           previews, both small scripted matches of the real simulation
server/                    Node match server: WebSocket endpoint, room manager, matchmaking, health
dev/                       renderer and input test bench (dev/landgrab.html, served by `npm run dev`)
desktop/                   Electron wrapper for Steam (own package.json)
e2e/                       Playwright tests: offline smoke match, two players meeting online
```

Dependency direction (arrows = "may import"). Inside `games/landgrab`, `config.ts`, `palette.ts` and
`content.ts` are data that any folder may import; they import nothing but `core/types`, `shared` and
each other.

```
main -> hub, meta, platform, audio, games/registry
hub -> meta, platform, shared, games/registry
meta, platform, audio -> shared
games/registry -> each game's index.ts, shared

games/landgrab/
  index   -> game, art, shared
  game    -> ui, input, render, rewards, net, core, shared
  art     -> render (World, colours), core, shared
  ui      -> rewards, shared
  rewards -> core, shared
  input   -> core, render/contract
  render  -> core, shared
  net     -> room, core
  room    -> ai, core
  ai      -> core
  core    -> nothing outside core

server -> games/landgrab/{room, core, config, net/session, net/roomHost, net/ticker}
dev    -> games/landgrab/{core, render, input, config, content}
```

The match server runs everything it imports, so all of it must stay free of DOM and browser APIs:
`core`, `ai`, `room`, `config`, `palette`, `content`, the `shared` files they use (`services.ts` for
the data types, `names.ts`; not `game.ts`, which holds DOM types), and the host side of `net`:
`protocol`, `codec`, `validate`, `session`, `roomHost`, `ticker` (the local host passes the ticker the
page's visibility to pause on). `npm run typecheck` enforces this: besides the whole tree, it checks
`server/` and those folders again without the DOM library (`tsconfig.server.json`). The client side of
`net` (`client`, `clock`, `servers`, `wsTransport`, `loopback`, `localHost`) runs only in the app and in
tests.

## Hub and games (`src/shared`)

The hub knows games only through `GameModule` (`shared/game.ts`), listed in `games/registry.ts`:
- `id`, `title`, `tagline`, `accent`, `available` (false = "coming soon" card): the game's card.
- `missions`, `cosmetics`: what the game adds to the hub's mission pool, shop and chests.
- `defaultLoadout?`: what a new player wears, owned from the start and never sold or dropped; without
  one, the first cosmetic of each kind.
- `playerColors?`: the palette `ProfileService.color` indexes into (wrapped) in this game. The hub's
  avatar and colour picker show the featured game's, so the featured game must have one.
- `mountAttract?`, `mountCardArt?`, `renderCosmeticPreview?`: hub art the game draws in its own style.
- `launch(host, services, opts)`: starts the game with the hub's `GameServices` (`shared/services.ts`).

The data types games hand the hub (`CosmeticDef`, `MissionDef`, `Loadout`, `PlayerColor`) live in
`services.ts`, which has no DOM types, since the game data files the match server imports use them.
Player names follow one rule, `cleanName` in `shared/names.ts` (at most `NAME_MAX_LENGTH` code points,
whitespace runs become one space, control, format and private-use characters go): the hub applies it
when a name is saved and the match server to every hello, so the name in the profile is the name other
players see.

## Networking model

The simulation is deterministic, so the network carries commands, not state.

1. The **Room** (server, or in-process offline) collects human turns, bot decisions, joins, leaves,
   revives and round changes for the next tick, applies them with `step()`, and publishes a `Frame`
   `{tick, cmds, checksum?}`.
2. Every client applies the same frame to its own copy of the simulation and gets the same result.
3. Joining: the host answers the hello with a `welcome` (`slot`, a full `Snapshot`, `tickRate`, the
   room's `roundEndTicks` for the next-map countdown, `region`), then frames.
4. Online, every `NET.checksumEvery` ticks the frame carries a state checksum. A client that disagrees
   sends `resync` and receives a fresh snapshot. A local match goes without (`RoomOptions.checksums`):
   host and client share one tab and a loopback, so they can't drift apart.
5. Controls feel instant through prediction: MatchClient renders `confirmed + k predicted ticks`, where
   k ≈ round-trip time / tick length (0 offline), applying this player's latest unacknowledged steer and
   assuming everyone else keeps their current steering. Prediction copies state with `copyState` into
   reused buffers (no per-frame allocation). When a frame arrives the prediction is rebuilt from the
   confirmed state. Gameplay feedback (sound, coins, callouts, death screen) only reacts to
   **confirmed** events.
6. Server bandwidth is tiny (steer commands only, a few KB/s per player); the server holds no accounts and no database.
   Online rooms take players only (no spectators), and a room shuts down once nobody has been connected
   to it for `ROOM.emptyRoomTimeoutMs`. Bots fill rooms up to `ROOM.minPopulation`.
7. A player id holds one seat. A new connection with an id already seated (the game open twice, or a
   reconnect before the old socket timed out) takes that seat over as it is, and the old connection is
   closed with the reason `SEAT_TAKEN_OVER` (net/protocol.ts); the new client carries on with the life in
   progress, or asks for the next one.

Offline mode and the hub background match use `net/localHost.ts`: a Room driven by a timer, connected
through a loopback Transport to an ordinary MatchClient. One code path for online and offline.

## Simulation rules (core)

Players move freely in any direction, like Paper.io 2. Territory and trails live on a fine raster of
`size x size` cells (480 x 480 by default; a head is ~7 cells across) that the renderer draws with smooth
contours, so the game never looks blocky. `mask` marks the playable blob. Cells are indexed `y * size + x`.

Units: positions are fixed-point integers, `SUB` (256) subunits per cell; headings are integers in
`[0, ANGLES)` (1024 = full turn; 0 = up, clockwise). Movement vectors come from literal integer sine/cosine
tables in `core/trig.ts` (generated once, committed as numbers) so every engine gets identical results.
`vector(h) = (SIN[h], -COS[h])` scaled by `TRIG_ONE`; `headingTo(dx, dy)` finds the closest heading by
integer search (no atan2).

### Map generation (`generateMap(size, seed)`)
A random blob: threshold `(dx² + dy²)/R² + noise(x, y) * k < 1` around the centre, where noise is
integer-hashed value noise with smoothstep interpolation (only + - * /, no trig), at a low enough
frequency that the outline reads as smooth, lumpy curves at 480 x 480. Then smooth with a few
majority-filter passes, keep the largest 4-connected component, fill enclosed holes, and erode away
necks narrower than ~3 head widths. Fills ~65–80% of the grid. Same seed = same map everywhere.
Must stay fast (target < 25 ms) because every client generates it at the start of a round.

### Tick order (`step(state, cmds)`) — let t = state.tick + 1
1. Apply commands in array order (`steer`, `join`, `spawn`, `revive`, `leave`, `newRound`).
   `steer` sets `targetHeading` (ignored for dead players; any heading is allowed, turning is gradual).
2. Close expired revive windows (`t > reviveUntilTick`, or the dead player has 0 cells left): their land
   goes neutral → `landCleared`. All revive windows close when a round ends.
3. Retry pending spawns.
4. If `roundOver` is set: set tick and return (nothing moves until `newRound`).
5. **Steer and plan moves** for every living player against the pre-move state, with `planHeadMove`
   (core/movement.ts). Bots and the renderer call the same function, so what they predict is what
   happens. Angles below are heading units (1024 per turn).
   - **Edge field**: void and off-grid cells within 8 cells of a point add up to a smooth field
     (Σ (R² − r²)², exact integers) that rises toward the void. Its gradient is the edge's outward
     *normal*, steady even along the outline's stair steps. Slides keep to the field's level 1 cell
     inside a straight outline (the *standoff*).
   - **Turn** `heading` toward `targetHeading` by at most `turnRate`, the shortest way round. One
     exception near the edge: while sliding on one side of the normal (or just after, the heading more
     than 90° off it), a target more than 8 units across the normal on the other side turns the heading
     the long way, off the edge (a U-turn, not a run back over the trail), unless the heading is already
     32+ units across.
   - **Straight**: move `speed` along `heading` if the end cell is playable and the end isn't past the
     standoff (or at least no deeper than the head already is). A slide in progress skips this while
     the heading is within 90° + 8 of the normal, so the head doesn't jog on and off the edge.
   - **Slide** otherwise: travel along the edge's tangent, tilted in or out to close the gap to the
     standoff (by at most half a move); if that ends on void, turn further off the edge in steps of 8
     up to 64 (bumps, the outline's last step); if nothing works, stay put this tick (`moveHeading` and
     `slideSide` unchanged). Side: the one the heading leans to from the normal; dead on, the side whose
     next cell doesn't hold your own trail, then the side nearer the map centre. A slide keeps its side
     while the heading is within 8 of the normal (it wavers over the steps) and switches only when the
     player steers the heading 32+ units over; when instead the edge bends round past the heading (a
     corner, over a bulge), the player stops rather than reverse over their trail.
   - Sliding never changes `heading`: the player hugs the edge until they steer away or it curves away.
     `moveHeading` = the direction actually travelled; `slideSide` = ±1 while sliding (+1 = clockwise of
     the normal), 0 after a straight move.
6. **Resolve collisions against the pre-move state** (slot order for kill credit). Probe points are the
   segment midpoint and the end of each player's move (head centres):
   - two living players whose new head centres are closer than `2 * headRadius` cells → both die,
     cause `headon`, killer 0;
   - a probe point's cell holds another player's trail → that player dies, cause `cut`, killer = mover;
   - a probe point's cell holds your own trail stamped more than `selfGraceTicks` ago (wrap-aware compare
     on `trailTick`) → you die, cause `self`.
   Several deaths in one tick are all applied; the first killer in slot order gets the credit.
7. **Move** every surviving player and **stamp trail**: for each probe point, every playable cell within
   `trailRadius` that you don't own and that holds no trail becomes your trail (`trail`, `trailTick`, and
   appended to `player.trail`). Probe spacing ≤ 0.6 cells keeps the band watertight. Cells already holding
   someone else's trail are left alone. While outside your land, push the head position to `trailPath`
   (the first entry is the point where you left your land). A player who stayed put refreshes `trailTick`
   of their own trail under their head, so waiting at the edge can't age it into a self-kill.
8. **Captures** (slot order, skipping anyone who died earlier this tick): a player whose head cell is now
   their own land and whose trail is non-empty closes the loop:
   - trail cells become theirs;
   - enclosed area: flood fill from outside the bounding box of (their land ∪ trail) expanded by 1,
     through cells they don't own (void counts as outside). Every playable cell not reached becomes theirs;
   - any other player whose head cell or any trail cell is now inside the newly captured cells dies,
     cause `enclosed`, killer = capturer;
   - land taken from others is reported in `stolen`; treasure cells captured → `treasure` event.
9. **Land lost**: any living player left with 0 cells dies, cause `landlost`, killer = last player who
   captured from them this tick.
10. **Win** (decided before deaths are applied): if a living player owns ≥ `winPermille`/1000 of playable
    cells → `roundOver` (most cells wins; tie → lowest slot).
11. **Deaths**: trail removed from the grid. A human with `revivesUsed < maxRevivesPerRound`, cells > 0 and
    no round over keeps their land for `reviveWindowTicks` (`canRevive: true`); everyone else's land goes
    neutral immediately. The killer's `kills` increments; the victim's `lastKilledBy` = killer's profile id.
12. **Feats** (see `FeatId` in core/types.ts) are emitted for the capturing/killing player right where
    they happen.
13. **Treasure**: keep `treasureCount` treasures on neutral, trail-free cells with a few cells of clearance,
    placing at most one per `treasureRespawnTicks`.
14. Update `peakCells`; set `state.tick = t`.

### Spawning
`join`/`spawn`: pick a random centre (state RNG, up to 200 attempts) where every cell within
`startRadius + 4` is playable, neutral, trail-free and treasure-free, preferring ≥ 60 cells from other
heads. Claim the disc of radius `startRadius`. Random starting heading. No space → `spawnPending`.
`revive`: respawn on your own remaining land at the owned cell nearest your death point, heading toward
the middle of your land; `revivesUsed++`. `newRound`: new map from the seed, everyone present becomes
dead with no land and no revive window, revive counts reset, treasures placed.

### Core public API (`core/index.ts`)
```
createSim(config: SimConfig, seed: number): SimState      // round 1, no players
createSimFromMask(config, mask, seed): SimState            // hand-made maps for tests/tools
step(state, cmds): SimEvent[]                              // mutates state
planHeadMove(state, head, out): out                        // one tick of turning + moving + edge sliding for any
                                                           // head (a Player fits), exactly as step() moves players;
                                                           // out may be head (roll forward); allocation-free
cloneState(state): SimState                                // deep copy (mask may be shared)
copyState(dst, src): void                                  // allocation-free copy into a same-size state (prediction)
checksum(state): number                                    // uint32 FNV-1a of grids, players, tick, rng, round
serialize(state): Snapshot / deserialize(snapshot): SimState
generateMap(size, seed): { mask: Uint8Array; playable: number }
previewCapture(state, slot): number[]   // cells you'd gain if you closed the loop now with a straight line
                                        // from your head back to where your trail started (risk preview)
leaderboard(state): { slot: Slot; cells: number }[]        // living players, most cells first
permille(state, slot): number                              // share of playable cells, 0..1000
vector(heading) / headingTo(dx, dy) / TRIG_ONE              // integer trig helpers (bots, input, rendering)
idx(size, x, y) / cx(size, i) / cy(size, i)                 // cell helpers
```

### Performance budget (default config, 16 players)
`step` < 1 ms on average; a worst-case capture (huge territory) < 8 ms; `previewCapture` < 3 ms;
`copyState` < 1 ms; `newRound` < 25 ms. A full room tick with 15 bots (their look-aheads run
`planHeadMove` ~1,600 times a tick) < 1.5 ms on average, measured on a bundled build.

## Rendering (look and feel)
Nothing may look blocky. Territory is drawn from smooth contours of the owner raster (marching squares
plus smoothing, cached per region and rebuilt only where land changed), filled in the owner's colour with a
darker raised 3D lip underneath like Paper.io 2. Trails are smooth thick lines through `trailPath` with
round joins, in the owner's light colour. Heads are rounded shapes with faces/skins, rotated to
`moveHeading`, interpolated between ticks. The map blob has a smooth outline with a soft drop shadow over the
void. Bots are drawn smaller and muted. Camera follows smoothly and zooms out as your land grows.

## Room rules (authority)
- Slots 1..capacity. Humans take a free slot; if the room is full of bots, a bot leaves to make space.
- Bots are added (one per tick at most) until humans + bots ≥ `minPopulation`; extra bots retire when
  they next die. Bots get muted colours (`BOT_COLORS`), plain names, smaller drawing.
- Dead bots respawn after ~`botRespawnTicks` (randomised). Humans respawn only when they ask.
- Revive requests are validated (window open, revives left, land left); the client pays coins locally.
- Round over → after `roundEndTicks` the room issues `newRound` with a fresh seed; bots respawn,
  humans respawn when they press Play Again.
- Command order inside a frame: newRound, leave, join, spawn, revive, steer.
- Revive requests are refused while a round is over.

## Player-facing features (what the game must deliver)

**Match**: random blob arena; smooth free-direction steering (Paper.io 2 style) with smooth curved trails
and smooth-edged territory drawn with a raised 3D lip; captures including stealing; deaths
(cut, self, head-on, enclosed, land lost); sliding along edges; score = % of the map; 98% wins the round
for everyone; live top-5 leaderboard; minimap; up to 16 per room with bots filling seats; bots drawn
smaller and in muted colours.

**Controls** (all produce a target heading): mouse/trackpad points the way (heading from your head on
screen to the cursor); touch uses a floating joystick (drag from wherever you put your finger down);
arrow keys / WASD give 8 directions; gamepad left stick (analog) and d-pad (Steam Deck). Clients send
`steer` only when the target changes, at most once per tick.

**Moment-to-moment rewards**
- Risk vs. cash-out: while outside your land, a live counter shows coins your loop is worth right now
  (`previewCapture`) and a faint ghost of the area you'd capture; trail glows hotter and the tension
  music rises with trail length.
- Captures: fill sweeps out from the closing point as a wave; coins burst from captured cells and fly into
  the coin counter; sound pitch and screen shake scale with size.
- Feats (trap, clutch cut, multi-kill, big haul, leader steal, revenge, close call) trigger a named callout
  and a random multiplier roll on the feat bonus. Randomness only ever follows something the player did.
- Combos: captures in quick succession stack a multiplier with rising pitch.
- Treasure cells on the map pay a bonus when captured.
- Coin counter rolls up like a reel, never jumps.
- Milestones at 10/25/50/75% with fanfare and bonus.
- Kills: punchy flash + coin burst.

**End of life / round**
- Earnings count up; then one reel spin per feat pulled off this life (max 3); the best spin multiplies
  the life's earnings 1–10×. Reels use game icons, not casino symbols.
- Near-miss framing ("4% away from 3rd place").
- Big pulsing Play Again → straight back into the room. Round over shows the winner and a countdown to
  the next map.
- Second chance: on death, a 5-second countdown offers a revive for coins keeping your land; price rises
  each use in a round; server caps revives per round.

**Hub (meta, shared by all future games)**: coins wallet; account level with an always-visible XP bar;
daily reward calendar with streak (day 7 = chest) and a coin-bought streak freeze; 3 daily + 3 weekly
missions with one free reroll a day; shop with a daily rotation and refresh countdown; mystery chests
(shake → rarity glow → burst; duplicates turn into coins; odds shown); cosmetics visible to other players
(skins, trail effects, capture effects, kill effects); profile (name, colour, loadout); settings (volume,
music, haptics, screen shake). Home screen plays a live bot match in the background, with big game cards
(Landgrab playable, others "coming soon").

**Economy storage**: coins and unlocks live on the device (save file through `StorageAdapter`), backed up
by platform cloud saves. No accounts, no server-side economy.

## Testing (only what proves the game works)
- core: capture/enclosure incl. stealing; every death rule; edge sliding; 98% win; determinism.
- room: long bots-only match keeps every invariant (counts match the grid, trails consistent, nobody
  on void) and completes rounds.
- net: a real server with two WebSocket clients — both clients' states match the server's checksum; a
  player who connects again gets their own seat back, not a second one.
- e2e: the app boots to the hub, an offline match starts, the canvas draws, and a scripted player
  captures territory; two players who press Play meet in the same room on a real match server.
