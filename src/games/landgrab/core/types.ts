/**
 * Landgrab simulation contract.
 *
 * CONTRACT FILE. The simulation is deterministic: the same starting state plus the
 * same command stream produces a bit-identical state on every JS engine (V8 on the
 * server and Electron, JavaScriptCore on iOS). That is what lets the server send
 * only commands over the network. Rules for code under core/:
 *   - integer math for anything that affects state; no Math.random, Date, sin/cos/pow/exp
 *     (+ - * / and Math.sqrt/floor/trunc/abs/min/max are fine; trig comes from the literal tables in trig.ts)
 *   - iterate players in slot order; never iterate a Map/Set/object whose order could differ
 *   - all randomness comes from state.rng (mulberry32)
 *
 * World model: players move freely in any direction (Paper.io 2 style). Territory and
 * trails live on a fine raster ("cells", size x size) that the renderer draws with smooth
 * contours; positions are fixed-point at SUB subunits per cell; headings are integers in
 * ANGLES steps.
 */

/** Fixed-point subunits per cell. */
export const SUB = 256;
/** Heading resolution: a full turn. 0 = up (north), clockwise: ANGLES/4 = right, ANGLES/2 = down, 3*ANGLES/4 = left. */
export const ANGLES = 1024;

/** Integer heading in [0, ANGLES). */
export type Heading = number;

/** 1..config.maxSlots. 0 means "nobody". */
export type Slot = number;

export interface Loadout {
  skin: string;
  trail: string;
  capture: string;
  kill: string;
}

export interface PlayerProfile {
  /** Stable identity across lives: install id for humans, room-assigned for bots. */
  id: string;
  name: string;
  kind: 'human' | 'bot';
  /** Palette index: HUMAN_COLORS for humans, BOT_COLORS for bots. */
  color: number;
  cosmetics: Loadout;
}

export interface Player {
  slot: Slot;
  profile: PlayerProfile;
  alive: boolean;
  /** Head centre in subunits (cell = floor(x / SUB), floor(y / SUB)). */
  x: number;
  y: number;
  /** Facing; turns toward targetHeading by at most config.turnRate per tick. */
  heading: Heading;
  /** Last steer input. */
  targetHeading: Heading;
  /** Direction actually travelled last tick (differs from heading while sliding along the map edge). */
  moveHeading: Heading;
  /** Which way the last edge slide deflected: -1 counter-clockwise, 1 clockwise, 0 not sliding. Kept so slides don't jitter. */
  slideSide: -1 | 0 | 1;
  /** Every cell currently holding this player's trail, in the order stamped. */
  trail: number[];
  /** Head centre (x, y pairs, subunits) at the start of the trail and after every tick spent outside: the smooth line the renderer draws. */
  trailPath: number[];
  /** Kills this life. */
  kills: number;
  /** Profile id of whoever last killed this player (for the revenge feat). */
  lastKilledBy: string | null;
  /** Ticks of this player's recent kills (for the multi-kill feat). */
  recentKillTicks: number[];
  lifeStartTick: number;
  /** Most cells owned at once during this life. */
  peakCells: number;
  /** -1 while alive. */
  diedAtTick: number;
  /** Last tick on which a revive is accepted; -1 when there is no open revive window. */
  reviveUntilTick: number;
  /** Revives used in the current round. */
  revivesUsed: number;
  /** Wants to (re)spawn but no free space was found yet; retried every tick. */
  spawnPending: boolean;
}

export interface SimConfig {
  /** Raster is size x size cells; the playable blob sits inside it. */
  size: number;
  /** 980 = a player wins at 98.0% of playable cells. */
  winPermille: number;
  ticksPerSecond: number;
  /** Distance travelled per tick, in subunits. */
  speed: number;
  /** Max heading change per tick, in heading units. */
  turnRate: number;
  /** Head radius in cells: two heads closer than 2 * headRadius collide head-on. */
  headRadius: number;
  /** Trail band radius in cells (the band is ~2 * trailRadius + 1 cells wide). */
  trailRadius: number;
  /** Your own trail stamped within this many ticks can't kill you (it is under your head). */
  selfGraceTicks: number;
  /** Start territory: disc of this radius in cells. */
  startRadius: number;
  /** Clutch feat: cut victim's head was within this many cells of their own land. */
  clutchRadius: number;
  /** Close-call feat: an enemy head was within this many cells of your trail when you closed the loop. */
  closeCallRadius: number;
  /** Multi-kill feat window. */
  multiKillTicks: number;
  /** Big-haul feat: one capture worth at least this share of the playable map (1000 = all of it). */
  bigHaulPermille: number;
  /** Leader-steal feat: one capture took at least this share of the playable map from the leader. */
  leaderStealPermille: number;
  treasureCount: number;
  treasureRespawnTicks: number;
  reviveWindowTicks: number;
  maxRevivesPerRound: number;
  maxSlots: number;
}

export interface SimState {
  config: SimConfig;
  /** Seed of the current round's map. */
  seed: number;
  round: number;
  /** Number of completed steps. */
  tick: number;
  size: number;
  /** 1 = playable, 0 = void. Never mutated in place (newRound allocates a new one), so clones may share it. */
  mask: Uint8Array;
  playable: number;
  /** Owning slot per cell, 0 = neutral. */
  owner: Uint8Array;
  /** Slot whose trail occupies the cell, 0 = none. At most one trail per cell. */
  trail: Uint8Array;
  /** Low 16 bits of the tick each trail cell was stamped (for selfGraceTicks; compare wrap-aware). */
  trailTick: Uint16Array;
  /** Owned cell count per slot (index = slot). */
  counts: Int32Array;
  /** Index = slot; length maxSlots + 1; [0] is always null. */
  players: (Player | null)[];
  /** Active treasure cells (centre cell of each treasure). */
  treasure: number[];
  /** Ticks until the next treasure may be placed. */
  treasureCooldown: number;
  /** mulberry32 state (uint32). */
  rng: number;
  roundOver: { winner: Slot; tick: number } | null;
}

/** Commands are the only way state changes. Applied in array order at the start of a step. */
export type Command =
  /** Steer toward a heading in [0, ANGLES). */
  | { t: 'steer'; slot: Slot; heading: Heading }
  /** Occupy an empty slot and spawn a new life. */
  | { t: 'join'; slot: Slot; profile: PlayerProfile }
  /** Start a new life for a dead player (clears any land kept for a revive). */
  | { t: 'spawn'; slot: Slot }
  /** Second chance: come back on your own remaining land. */
  | { t: 'revive'; slot: Slot }
  | { t: 'leave'; slot: Slot }
  /** New map; everyone present becomes dead-and-waiting (humans respawn on request). */
  | { t: 'newRound'; seed: number };

export type DeathCause =
  | 'cut' // another player's head crossed your trail (killer = them)
  | 'self' // you crossed your own trail
  | 'headon' // two heads met (both die, no killer)
  | 'enclosed' // a capture swallowed your head or any part of your trail (killer = capturer)
  | 'landlost'; // all your land was captured (killer = last capturer)

export type FeatId =
  | 'trap' // you killed someone by enclosing them
  | 'clutch' // you cut a trail whose owner was within clutchRadius cells of home
  | 'multikill' // 2+ kills within multiKillTicks (fires on each extra kill)
  | 'bighaul' // one capture worth >= bigHaulPermille of the map
  | 'leadersteal' // one capture took >= leaderStealPermille of the map from the leader
  | 'revenge' // you killed whoever last killed you
  | 'closecall'; // you closed a loop while an enemy head was within closeCallRadius cells of your trail

export type SimEvent =
  | { t: 'join'; slot: Slot }
  | { t: 'leave'; slot: Slot }
  | { t: 'spawn'; slot: Slot; x: number; y: number; revive: boolean }
  /** cells = every cell that became this player's (trail + enclosed), unordered. at = cell where the loop closed. */
  | { t: 'capture'; slot: Slot; cells: number[]; stolen: { slot: Slot; count: number }[]; trailLength: number; at: number }
  | { t: 'death'; slot: Slot; killer: Slot; cause: DeathCause; at: number; canRevive: boolean }
  | { t: 'feat'; slot: Slot; feat: FeatId; victim: Slot }
  | { t: 'treasure'; slot: Slot; cell: number }
  /** Revive window closed; the dead player's land went neutral. */
  | { t: 'landCleared'; slot: Slot }
  | { t: 'roundOver'; winner: Slot }
  | { t: 'newRound'; seed: number; round: number };

/** JSON-safe full state, used for join-in-progress and desync recovery. */
export interface Snapshot {
  v: 2;
  config: SimConfig;
  seed: number;
  round: number;
  tick: number;
  rng: number;
  /** Run-length encoded grids: [value, runLength, value, runLength, ...]. */
  mask: number[];
  owner: number[];
  trail: number[];
  trailTick: number[];
  players: (Player | null)[];
  treasure: number[];
  treasureCooldown: number;
  roundOver: { winner: Slot; tick: number } | null;
}
