/**
 * The match authority (see RoomApi in contract.ts and "Room rules" in
 * docs/ARCHITECTURE.md). Requests from humans and decisions of bots are queued between
 * ticks; tick() turns them into one frame of commands in the order every client applies
 * them, steps the simulation, and books what happened (deaths, spawns) for the next one.
 *
 * Everything random here (bot names, personalities, decisions, map seeds) comes from the
 * room's own generator, seeded by RoomOptions.seed: the same seed and the same human
 * inputs replay the same match.
 */
import { createBrain, observe, Random, randomPersonality, type Brain } from '../ai';
import { NET, ROOM, SIM_CONFIG } from '../config';
import {
  ANGLES,
  checksum,
  createSim,
  serialize,
  step,
  type Command,
  type Heading,
  type Player,
  type PlayerProfile,
  type SimConfig,
  type SimEvent,
  type SimState,
  type Slot,
  type Snapshot,
} from '../core';
import type { RoomApi, RoomOptions, RoomTickResult } from './contract';
import { botProfile } from './roster';

/**
 * A room on the default simulation tuning. `config` swaps in other tuning (a smaller
 * map for tests and tools); the RoomOptions contract has no field for it.
 */
export function createRoom(options: RoomOptions, config: SimConfig = SIM_CONFIG): RoomApi {
  return new Room(options, config);
}

interface Seat {
  kind: 'human' | 'bot';
  profile: PlayerProfile;
}

class Room implements RoomApi {
  readonly sim: SimState;
  private readonly capacity: number;
  private readonly minPopulation: number;
  readonly roundEndTicks: number;
  private readonly checksums: boolean;
  private readonly random: Random;
  /**
   * Who holds each slot once the queued commands are applied (index = slot). It runs a
   * tick ahead of sim.players: a seat taken now joins on the next tick, and a seat given
   * up still has its player until the queued leave.
   */
  private readonly seats: (Seat | null)[];
  private readonly brains: (Brain | null)[];
  /** Commands waiting for the next tick, by slot. */
  private readonly joins: (PlayerProfile | null)[];
  private readonly leaves: boolean[];
  /** Players starting a new life next tick: humans who asked, bots whose wait is over. Held while a round is over. */
  private readonly respawns: boolean[];
  private readonly revives: boolean[];
  /** Each human's latest wanted heading, re-sent whenever their player's target differs. */
  private readonly steers: (Heading | null)[];
  /** Tick on which each dead bot comes back, -1 when none is due. */
  private readonly botReturns: number[];
  private botSerial = 0;

  constructor(options: RoomOptions, config: SimConfig) {
    this.sim = createSim(config, options.seed);
    this.capacity = Math.min(options.capacity ?? ROOM.capacity, config.maxSlots);
    this.minPopulation = Math.min(options.minPopulation ?? ROOM.minPopulation, this.capacity);
    this.roundEndTicks = options.roundEndTicks ?? ROOM.roundEndTicks;
    this.checksums = options.checksums ?? true;
    this.random = new Random(options.seed);
    const slots = this.capacity + 1;
    this.seats = new Array<Seat | null>(slots).fill(null);
    this.brains = new Array<Brain | null>(slots).fill(null);
    this.joins = new Array<PlayerProfile | null>(slots).fill(null);
    this.leaves = new Array<boolean>(slots).fill(false);
    this.respawns = new Array<boolean>(slots).fill(false);
    this.revives = new Array<boolean>(slots).fill(false);
    this.steers = new Array<Heading | null>(slots).fill(null);
    this.botReturns = new Array<number>(slots).fill(-1);
  }

  addHuman(profile: Omit<PlayerProfile, 'kind'>): Slot | null {
    const slot = this.freeSeat() || this.evictBot();
    if (slot === 0) return null;
    const human: PlayerProfile = { ...profile, kind: 'human', cosmetics: { ...profile.cosmetics } };
    this.seats[slot] = { kind: 'human', profile: human };
    this.joins[slot] = human;
    this.clearRequests(slot);
    // Joining is asking to play: someone arriving during a round over starts on the next map.
    if (this.sim.roundOver) this.respawns[slot] = true;
    return slot;
  }

  removeHuman(slot: Slot): void {
    if (this.seats[slot]?.kind !== 'human') return;
    this.vacate(slot);
  }

  setSteer(slot: Slot, heading: Heading): void {
    if (this.seats[slot]?.kind !== 'human') return;
    if (!Number.isInteger(heading) || heading < 0 || heading >= ANGLES) return;
    this.steers[slot] = heading;
  }

  requestRevive(slot: Slot): boolean {
    const p = this.seatedHuman(slot);
    if (!p || p.alive || this.sim.roundOver) return false;
    const { maxRevivesPerRound } = this.sim.config;
    if (p.reviveUntilTick < this.sim.tick + 1 || p.revivesUsed >= maxRevivesPerRound || this.sim.counts[slot] === 0) return false;
    this.revives[slot] = true;
    this.respawns[slot] = false;
    return true;
  }

  requestRespawn(slot: Slot): boolean {
    const p = this.seatedHuman(slot);
    // During a round over everyone will be dead on the new map, so the request waits for it.
    if (!p || (p.alive && !this.sim.roundOver)) return false;
    this.respawns[slot] = true;
    this.revives[slot] = false;
    return true;
  }

  humanCount(): number {
    return this.seats.filter((seat) => seat?.kind === 'human').length;
  }

  snapshot(): Snapshot {
    return serialize(this.sim);
  }

  tick(): RoomTickResult {
    const { sim } = this;
    const t = sim.tick + 1;
    const newRound = sim.roundOver !== null && t - sim.roundOver.tick >= this.roundEndTicks;
    const frozen = sim.roundOver !== null && !newRound;
    const cmds: Command[] = newRound ? [{ t: 'newRound', seed: this.random.u32() }] : [];
    if (!frozen) {
      this.returnBots(t, newRound);
      this.fillSeats();
    }
    cmds.push(...this.queuedCommands(frozen));
    // Nobody moves while a round is over, and a new round leaves everyone dead.
    if (!frozen && !newRound) cmds.push(...this.steerCommands());
    this.clearDelivered(frozen);
    const events = step(sim, cmds);
    this.book(events);
    const stamped = this.checksums && sim.tick % NET.checksumEvery === 0;
    return {
      frame: stamped ? { tick: sim.tick, cmds, checksum: checksum(sim) } : { tick: sim.tick, cmds },
      events,
    };
  }

  /** Leaves, joins, spawns and revives, in that order and slot order within each. */
  private queuedCommands(frozen: boolean): Command[] {
    const leaves: Command[] = [];
    const joins: Command[] = [];
    const spawns: Command[] = [];
    const revives: Command[] = [];
    for (let slot = 1; slot <= this.capacity; slot++) {
      if (this.leaves[slot]) leaves.push({ t: 'leave', slot });
      const profile = this.joins[slot];
      if (profile) joins.push({ t: 'join', slot, profile });
      if (this.respawns[slot] && !frozen) spawns.push({ t: 'spawn', slot });
      if (this.revives[slot]) revives.push({ t: 'revive', slot });
    }
    return leaves.concat(joins, spawns, revives);
  }

  /**
   * Humans' changed headings, then the bots' decisions, in slot order. Players starting
   * a life this tick are skipped: the spawn resets their heading, so it is compared next tick.
   */
  private steerCommands(): Command[] {
    const cmds: Command[] = [];
    const rivals = observe(this.sim);
    for (let slot = 1; slot <= this.capacity; slot++) {
      const p = this.sim.players[slot];
      if (!p?.alive || this.leaves[slot] || this.joins[slot] !== null || this.respawns[slot] || this.revives[slot]) continue;
      const brain = this.brains[slot];
      const wanted = brain ? brain.think(this.sim, rivals) : this.steers[slot];
      if (wanted !== null && wanted !== p.targetHeading) cmds.push({ t: 'steer', slot, heading: wanted });
    }
    return cmds;
  }

  /** Forgets what this tick's frame delivers; respawns wait out a round over. */
  private clearDelivered(frozen: boolean): void {
    this.leaves.fill(false);
    this.joins.fill(null);
    this.revives.fill(false);
    if (!frozen) this.respawns.fill(false);
  }

  /** Dead bots whose wait is over come back, or retire if the room has more players than it needs. A new round brings every bot back. */
  private returnBots(t: number, newRound: boolean): void {
    for (let slot = 1; slot <= this.capacity; slot++) {
      if (this.seats[slot]?.kind !== 'bot' || this.joins[slot] !== null) continue;
      const due = newRound || (this.botReturns[slot] >= 0 && this.botReturns[slot] <= t);
      if (!due) continue;
      this.botReturns[slot] = -1;
      if (this.occupied() > this.minPopulation) this.vacate(slot);
      else this.respawns[slot] = true;
    }
  }

  /** Adds one bot per tick while the room is below its minimum population. */
  private fillSeats(): void {
    if (this.occupied() >= this.minPopulation) return;
    const slot = this.freeSeat();
    if (slot === 0) return;
    const seated = this.seats.flatMap((seat) => (seat ? [seat.profile] : []));
    const profile = botProfile(`bot-${++this.botSerial}`, this.random, seated);
    this.seats[slot] = { kind: 'bot', profile };
    this.joins[slot] = profile;
    this.brains[slot] = createBrain(slot, randomPersonality(this.random), this.random.fork());
  }

  /** Bookkeeping from the step's events: bots that died wait to come back (or retire); new lives start with a clear head. */
  private book(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.t === 'spawn') this.brains[e.slot]?.reset();
      if (e.t !== 'death' || this.seats[e.slot]?.kind !== 'bot') continue;
      if (this.occupied() > this.minPopulation) {
        this.vacate(e.slot);
        continue;
      }
      const wait = ROOM.botRespawnTicks * this.random.range(1 - ROOM.botRespawnSpread, 1 + ROOM.botRespawnSpread);
      this.botReturns[e.slot] = this.sim.tick + Math.round(wait);
    }
  }

  /** Frees a seat: whoever is in the slot leaves on the next tick, and a join not yet made is called off. */
  private vacate(slot: Slot): void {
    this.joins[slot] = null;
    if (this.sim.players[slot] !== null) this.leaves[slot] = true;
    this.seats[slot] = null;
    this.brains[slot] = null;
    this.botReturns[slot] = -1;
    this.clearRequests(slot);
  }

  private clearRequests(slot: Slot): void {
    this.respawns[slot] = false;
    this.revives[slot] = false;
    this.steers[slot] = null;
  }

  /** The bot easiest to do without: a dead one, else the one with the least land. 0 if every seat holds a human. */
  private evictBot(): Slot {
    let best = 0;
    let bestCells = Infinity;
    for (let slot = 1; slot <= this.capacity; slot++) {
      if (this.seats[slot]?.kind !== 'bot') continue;
      const cells = this.sim.players[slot]?.alive ? this.sim.counts[slot] : -1;
      if (cells < bestCells) {
        best = slot;
        bestCells = cells;
      }
    }
    if (best !== 0) this.vacate(best);
    return best;
  }

  /** The lowest empty seat, or 0. */
  private freeSeat(): Slot {
    for (let slot = 1; slot <= this.capacity; slot++) if (this.seats[slot] === null) return slot;
    return 0;
  }

  private occupied(): number {
    let n = 0;
    for (let slot = 1; slot <= this.capacity; slot++) if (this.seats[slot] !== null) n++;
    return n;
  }

  /** The seated human's player, once they have joined the simulation and aren't leaving. */
  private seatedHuman(slot: Slot): Player | null {
    if (this.seats[slot]?.kind !== 'human' || this.joins[slot] !== null || this.leaves[slot]) return null;
    return this.sim.players[slot] ?? null;
  }
}
