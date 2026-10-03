# Product decisions log

Decisions agreed with the owner while planning and building, including what was rejected and why.
`docs/ARCHITECTURE.md` is the technical spec; this file is the *why* behind it. Read both before
changing direction on anything.

## The product
- **Arcadium** (placeholder name) is a hub that bundles several games behind one menu, one wallet and
  one progression system. More games will be added; the hub must stay game-agnostic.
- **Landgrab** (placeholder name) is the first game: a Paper.io 2-style territory game.
- Sold once, **no ads**, **no in-game purchases**. Coins are earned only.
- Targets: Steam (Windows/Mac/Linux/Steam Deck via Electron) and the App Store / Google Play (via
  Capacitor). Stack: TypeScript, Vite, Preact + signals, canvas 2D, Node match server.
- Engineering priorities from the owner: good clean systems first; otherwise whatever is fastest.
  Tests: only the ones that prove the game works.

## Landgrab gameplay
- **Look and feel: Paper.io 2.** Smooth steering in any direction, smooth curved trails, smooth-edged
  territory with a raised 3D lip. The first build used 4-direction grid movement and the owner rejected
  it as blocky and low fidelity — nothing in this game may look blocky (including hub card art and shop
  previews).
- **Map:** a random blob, new every round.
- **Real multiplayer**, rooms of up to 16; bots fill empty seats. **Bots are drawn smaller and in muted
  colours** so real people stand out; plain names.
- **Death rules:** someone crosses your trail (they get the kill); you cross your own trail; head-on
  (both die); all your land is taken; **being enclosed** — if a capture swallows your head or any part of
  your trail, you die (owner proposed this; confirmed).
- **Edges don't kill**: you slide along them.
- **Score = percentage of the map owned, nothing else.** Reaching **98% wins** and ends the round for
  everyone; a new map starts. There is **no best score**.
- Online by default; offline practice against bots always works.

## Rewards and retention ("slot-machine" feel, owner's request)
- Risk vs. cash-out while outside your land: live counter of what the loop is worth + ghost preview.
- Loud payoffs: capture wave fill, coins flying to the counter, rolling counters, combos, treasure cells,
  milestones at 10/25/50/75%, punchy kills.
- **Randomness only follows something the player did.** The owner rejected purely random bonuses.
  Feats (trap, clutch cut, multi-kill, big haul, leader steal, revenge, close call) trigger a bonus whose
  *size* is rolled.
- End of life: earnings count up; **one reel spin per feat pulled off (max 3)**, best spin multiplies the
  life's earnings (1–10x). Reels use game icons and read as a reward spinner, not a casino machine
  (store age ratings ask about simulated gambling).
- Near-miss framing on the results screen; one-tap Play Again.
- Second chance: revive for coins within 5 s, keeping your land; price rises per use; capped per round.
- Hub meta: daily calendar with streak and streak freeze, daily/weekly missions with reroll, account
  level with always-visible XP bar, daily-rotating shop, mystery chests (odds shown), cosmetics other
  players can see (skins, trails, capture effects, kill effects), profile/locker, settings.
- **Removed by the owner:** social features (live global feed, win streaks, room-leader crown) — "no
  unnecessary networking at this point". Deferred: daily prize wheel, timed events, collections.
- The hub's main menu got deliberate extra polish (owner asked for real effort there).

## Costs and servers
- Owner's constraint: no recurring revenue, so servers must cost close to nothing without hurting match
  quality.
- Networking sends commands only (deterministic simulation on every device) → a few KB/s per player.
- Match server is stateless (no accounts, no database), rooms shut down when no humans are in them,
  bots keep rooms full, start with ~2 small regions (US + EU) and add regions only when sales justify.
- Offline play always works and the server is a single program that could be published, so the game
  survives servers being shut down.
- Player-hosted matches were rejected: host leaving, phones on cellular and host advantage hurt quality.

## Accounts and saves
- Saves live on the device, backed up by Steam Cloud (Auto-Cloud on the saves folder), iCloud/device
  backups and Android Auto Backup.
- **No account API for now.** The owner considered a REST account/save API (they can host one cheaply),
  then dropped it for this stage. The save layer (`StorageAdapter` in `src/shared/services.ts`) is where
  one would plug in later.
- **No anti-cheat at this stage** — explicitly too much work. An edited save only cheats its owner.

## Working with the owner
- Treat their examples and phrasing as illustrations: build from the idea underneath them. Don't reuse
  their wording in headlines or taglines unless asked.
- When they correct something, change only that part.
- Before building anything visual or new, name the reference game and describe the look and feel, and
  get agreement — the grid-vs-smooth mistake came from assuming instead of confirming.
- Send screenshots of visual progress as it becomes available.
- They declined a multiple-choice question pop-up once; asking in plain chat worked better.
- They want to start a **second game** soon (not specified yet). Plan it with them first (reference
  game, look and feel, single vs. multiplayer); if multiplayer, reuse Landgrab's networking stack.
