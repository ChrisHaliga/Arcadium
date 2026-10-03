/**
 * One joined match: wires the MatchClient to the renderer, input, rewards, sound and the
 * overlays, runs the frame loop, and walks the player's life through its stages:
 *
 *   waiting → alive → (down: second chance on offer → alive again)
 *                   → ended (the death plays out) → results → Play Again → waiting
 *
 * Gameplay feedback reacts to confirmed events only; drawing uses the predicted view.
 * Everything a life earned is banked the moment it ends, so leaving at any point never
 * loses coins.
 */
import { permille, previewCapture, type SimEvent, type SimState, type Slot } from '../core';
import { createInput } from '../input';
import type { InputHandle } from '../input/contract';
import type { MatchClient } from '../net';
import { playerColor } from '../palette';
import { createRenderer } from '../render';
import type { Renderer } from '../render/contract';
import { LifeRewards, planRevivePayment, reportLife, reviveCost, type LifeEnding, type RevivePayment } from '../rewards';
import type { GameServices } from '../../../shared/services';
import type { GameUi, ResultsView } from '../ui/store';
import { DEATH_BEAT_MS, ROUND_BEAT_MS } from '../ui/timing';
import { Feedback } from './feedback';
import { HudSync } from './hud';
import { startFrameLoop, type FrameLoop } from './loop';
import { MinimapCanvas } from './minimap';
import { tensionLevel } from './tension';

type DeathEvent = Extract<SimEvent, { t: 'death' }>;

/** The pending-coins bubble pulses faster as the trail grows, between these rates (Hz). */
const PULSE_MIN_HZ = 0.9;
const PULSE_MAX_HZ = 4.5;
const PULSE_TRAIL_POINTS = 180;
const PULSE_AMOUNT = 0.08;
const WALLET_REASON = 'landgrab';

export interface MatchOptions {
  client: MatchClient;
  canvas: HTMLCanvasElement;
  ui: GameUi;
  services: GameServices;
  /** The connection dropped; the life in progress is already banked. */
  onDisconnect(reason: string): void;
}

export class Match {
  private readonly client: MatchClient;
  private readonly ui: GameUi;
  private readonly services: GameServices;
  private readonly slot: Slot;
  private readonly renderer: Renderer;
  private readonly input: InputHandle;
  private readonly rewards: LifeRewards;
  private readonly feedback: Feedback;
  private readonly hud: HudSync;
  private readonly minimap = new MinimapCanvas();
  private readonly loop: FrameLoop;
  private readonly resizer: ResizeObserver;
  private readonly unsubscribe: (() => void)[];

  /** My death this tick, resolved once the whole tick's events (kills, feats) are in. */
  private pendingDeath: DeathEvent | null = null;
  /** The death the second chance is about, for the results if it isn't taken. */
  private downedBy: DeathEvent | null = null;
  private roundEndedAlive = false;
  /** A revive paid for and waiting on the host's answer. */
  private payment: RevivePayment | null = null;
  private resultsTimer: ReturnType<typeof setTimeout> | null = null;
  private resultsSerial = 0;
  private lastViewTick = -1;
  private previewShown = false;
  private lastFrame = 0;
  private pulsePhase = 0;

  constructor(opts: MatchOptions) {
    this.client = opts.client;
    this.ui = opts.ui;
    this.services = opts.services;
    this.slot = opts.client.mySlot;
    const { services, canvas, client } = opts;

    this.renderer = createRenderer(canvas, {
      cosmetics: (id) => services.cosmetics.get(id),
      screenShake: () => services.settings.screenShake.peek(),
    });
    this.rewards = new LifeRewards(this.slot, Math.random);
    this.feedback = new Feedback(this.ui, this.renderer, canvas, services.audio, services.haptics);
    this.hud = new HudSync(this.ui, this.slot);
    this.input = createInput({
      target: canvas,
      headScreenPos: () => this.renderer.headToScreen(this.slot),
      onSteer: (heading) => client.steer(heading),
      onAction: () => this.togglePause(),
      // While a dialog is up its menu has the keys and pad.
      enabled: () => this.ui.dialog.peek() === null,
    });
    this.resizer = new ResizeObserver(() => this.renderer.resize());
    this.resizer.observe(canvas);

    this.unsubscribe = [
      client.onEvent((e, state) => this.onEvent(e, state)),
      client.onTick((state) => this.onTick(state)),
      client.onReviveDenied(() => this.onReviveDenied()),
      client.onStatus((status) => {
        if (status.kind !== 'disconnected') return;
        this.bankLife();
        opts.onDisconnect(status.reason);
      }),
    ];

    // Joining while a round is over: show the countdown to the map we'll start on.
    const over = client.confirmed.roundOver;
    if (over) this.showRoundOver(over.winner, client.confirmed, over.tick);
    this.resumeSeat(client.confirmed);
    this.loop = startFrameLoop((now) => this.frame(now));
  }

  // ---------- Actions from the overlays and controller ----------

  playAgain(): void {
    const life = this.ui.life.peek();
    if ((life !== 'results' && life !== 'ended') || this.ui.round.peek()) return;
    this.clearResultsTimer();
    this.ui.results.value = null;
    this.ui.life.value = 'waiting';
    this.services.audio.play('whoosh');
    this.client.respawn();
  }

  revive(): void {
    const offer = this.ui.secondChance.peek();
    if (!offer || offer.pending || this.ui.life.peek() !== 'down') return;
    const { wallet, audio } = this.services;
    const plan = planRevivePayment(offer.price, wallet.coins.peek(), this.rewards.earnings);
    if (!plan || (plan.fromWallet > 0 && !wallet.spend(plan.fromWallet, 'landgrab-revive'))) {
      audio.play('error');
      return;
    }
    this.rewards.payFromRun(plan.fromRun);
    this.ui.coins.value = Math.max(0, this.ui.coins.value - plan.fromRun);
    this.payment = plan;
    this.ui.secondChance.value = { ...offer, pending: true };
    audio.play('coinBig');
    this.client.revive();
  }

  declineRevive(): void {
    if (this.ui.life.peek() !== 'down' || this.payment) return;
    this.endLife(this.client.confirmed, this.deathEnding(this.downedBy), 0);
  }

  /** Banks the life in progress without bonus spins (leaving the match, losing the connection). */
  bankLife(): void {
    this.clearResultsTimer();
    if (!this.rewards.inLife) return;
    // A revive still waiting on the host is worthless once we're gone, so its price comes back.
    if (this.payment) this.refund(this.payment);
    this.settle(this.client.confirmed, { kind: 'left' });
    this.ui.secondChance.value = null;
  }

  dispose(): void {
    this.bankLife();
    this.loop.stop();
    this.input.dispose();
    for (const off of this.unsubscribe) off();
    this.resizer.disconnect();
    this.minimap.dispose();
    this.feedback.dispose();
    this.renderer.dispose();
    this.services.audio.setTension(0);
  }

  // ---------- Confirmed simulation ----------

  private onEvent(e: SimEvent, state: SimState): void {
    this.renderer.onEvent(e, state, this.slot);
    this.feedback.celebrate(this.rewards.onEvent(e, state));
    switch (e.t) {
      case 'spawn':
        if (e.slot === this.slot) this.onSpawn(e.revive, state);
        return;
      case 'death':
        if (e.slot === this.slot) this.onDeath(e);
        return;
      case 'landCleared':
        // The window closed with nothing paid (a paid revive waits for the host's answer).
        if (e.slot === this.slot && this.ui.life.peek() === 'down' && !this.payment) {
          this.endLife(state, this.deathEnding(this.downedBy), 0);
        }
        return;
      case 'roundOver':
        this.showRoundOver(e.winner, state, state.tick);
        if (this.ui.life.peek() === 'alive') this.roundEndedAlive = true;
        return;
      case 'newRound':
        this.ui.round.value = null;
        return;
      default:
        return;
    }
  }

  /** After all of a tick's events: milestones, then whatever my death or the round's end means for my life. */
  private onTick(state: SimState): void {
    this.feedback.celebrate(this.rewards.onTick(state));
    const death = this.pendingDeath;
    if (death) {
      this.pendingDeath = null;
      if (death.canRevive) this.offerSecondChance(death, state);
      else this.endLife(state, this.deathEnding(death), DEATH_BEAT_MS);
    }
    if (this.roundEndedAlive) {
      this.roundEndedAlive = false;
      if (this.rewards.inLife) {
        const winner = state.roundOver?.winner ?? 0;
        this.endLife(
          state,
          {
            kind: 'roundOver',
            won: winner === this.slot,
            winner: nameOf(state, winner),
          },
          ROUND_BEAT_MS,
        );
      }
    }
  }

  private onSpawn(revive: boolean, state: SimState): void {
    const { audio, haptics } = this.services;
    if (revive) {
      this.payment = null;
      this.downedBy = null;
      this.ui.secondChance.value = null;
      this.ui.life.value = 'alive';
      audio.play('revive');
      haptics.notify('success');
      return;
    }
    this.clearResultsTimer();
    this.rewards.begin(state);
    this.ui.coins.value = 0;
    this.ui.results.value = null;
    this.ui.secondChance.value = null;
    this.ui.life.value = 'alive';
  }

  /**
   * A seat taken over from another window (net/roomHost.ts) already holds this player:
   * carry on with the life in progress, or ask for the next one as Play Again would. A
   * seat that is new still shows whoever is leaving it, so the player id tells them apart.
   */
  private resumeSeat(state: SimState): void {
    const p = state.players[this.slot];
    if (p?.profile.id !== this.services.profile.playerId) return;
    if (p.alive && !state.roundOver) this.onSpawn(false, state);
    else this.client.respawn();
  }

  private onDeath(e: DeathEvent): void {
    this.pendingDeath = e;
    this.hidePreview();
    this.services.audio.play('death');
    this.services.audio.setTension(0);
    this.services.haptics.impact('heavy');
    this.services.haptics.notify('error');
  }

  private onReviveDenied(): void {
    const paid = this.payment;
    if (!paid) return;
    this.refund(paid);
    if (this.ui.life.peek() === 'down') this.endLife(this.client.confirmed, this.deathEnding(this.downedBy), 0);
  }

  private refund(paid: RevivePayment): void {
    this.payment = null;
    if (paid.fromWallet > 0) this.services.wallet.add(paid.fromWallet, 'landgrab-revive-refund');
    this.rewards.refundRun(paid.fromRun);
    this.ui.coins.value += paid.fromRun;
  }

  private offerSecondChance(death: DeathEvent, state: SimState): void {
    const me = state.players[this.slot];
    if (!me) return;
    const price = reviveCost(me.revivesUsed);
    const wallet = this.services.wallet.coins.peek();
    const run = this.rewards.earnings;
    const tickMs = tickLengthMs(state);
    this.downedBy = death;
    this.ui.secondChance.value = {
      price,
      shortBy: planRevivePayment(price, wallet, run) ? 0 : price - wallet - run,
      keptPermille: permille(state, this.slot),
      revivesLeft: state.config.maxRevivesPerRound - me.revivesUsed,
      deadline: this.ui.clock() + Math.max(0, me.reviveUntilTick - state.tick) * tickMs,
      windowMs: state.config.reviveWindowTicks * tickMs,
      pending: false,
    };
    this.ui.life.value = 'down';
  }

  /** Banks the life now and shows the results after `delayMs`, so the death or win can play out first. */
  private endLife(state: SimState, ending: LifeEnding, delayMs: number): void {
    if (!this.rewards.inLife) return;
    const view = this.settle(state, ending);
    this.downedBy = null;
    this.ui.secondChance.value = null;
    this.ui.pending.value = 0;
    this.hidePreview();
    this.services.audio.setTension(0);
    this.ui.life.value = 'ended';
    this.clearResultsTimer();
    const show = () => {
      this.resultsTimer = null;
      this.ui.results.value = view;
      this.ui.life.value = 'results';
    };
    if (delayMs > 0) this.resultsTimer = setTimeout(show, delayMs);
    else show();
  }

  /** Finishes the life's tally, puts the coins in the wallet and reports stats and XP. */
  private settle(state: SimState, ending: LifeEnding): ResultsView {
    const { wallet, progress } = this.services;
    const before = {
      walletBefore: wallet.coins.peek(),
      levelBefore: progress.level.peek(),
      xpBefore: progress.xp.peek(),
      xpToNextBefore: progress.xpToNext.peek(),
    };
    const result = this.rewards.finish(state, ending);
    if (result.total > 0) wallet.add(result.total, WALLET_REASON);
    reportLife(progress, result);
    this.payment = null;
    return { id: ++this.resultsSerial, result, ...before };
  }

  private deathEnding(death: DeathEvent | null): LifeEnding {
    if (!death) return { kind: 'left' };
    return {
      kind: 'death',
      cause: death.cause,
      killer: death.killer === 0 ? null : nameOf(this.client.confirmed, death.killer),
    };
  }

  private showRoundOver(winner: Slot, state: SimState, overTick: number): void {
    const p = state.players[winner];
    const ticksLeft = Math.max(0, this.client.roundEndTicks - (state.tick - overTick));
    this.ui.round.value = {
      winner: p?.profile.name ?? 'Someone',
      winnerColor: p ? playerColor(p.profile.kind, p.profile.color).base : '#ffc531',
      me: winner === this.slot,
      nextAt: this.ui.clock() + ticksLeft * tickLengthMs(state),
    };
    if (winner === this.slot) this.services.haptics.notify('success');
  }

  // ---------- Every frame ----------

  private frame(now: number): void {
    const view = this.client.view();
    if (view.tick !== this.lastViewTick) {
      this.lastViewTick = view.tick;
      this.everyTick(view);
    }
    const me = view.players[this.slot];
    // Before the first spawn the camera follows the leader; after a death it holds where it was.
    this.renderer.draw(view, this.client.alpha(now), now, me ? this.slot : 0);
    this.placeBubble(view, now);
  }

  private everyTick(view: SimState): void {
    this.hud.update(view);
    const combo = this.rewards.comboAt(view.tick);
    const shown = this.ui.combo.peek();
    if (combo.level !== shown.level || Math.abs(combo.left - shown.left) > 0.01) this.ui.combo.value = combo;

    const me = view.players[this.slot];
    const outside = !!me?.alive && me.trailPath.length > 0 && this.rewards.inLife && !view.roundOver;
    if (outside) {
      const cells = previewCapture(view, this.slot);
      this.renderer.setPreview(cells);
      this.previewShown = true;
      this.ui.pending.value = this.rewards.loopValue(cells.length, view.tick);
    } else {
      this.hidePreview();
      if (this.ui.pending.peek() !== 0) this.ui.pending.value = 0;
    }
    this.services.audio.setTension(this.rewards.inLife ? tensionLevel(view, this.slot) : 0);
    this.minimap.draw(this.ui.minimap, view, this.slot);
  }

  private hidePreview(): void {
    if (!this.previewShown) return;
    this.renderer.setPreview(null);
    this.previewShown = false;
  }

  /** Keeps the pending-coins bubble over the head, pulsing faster the longer the trail. */
  private placeBubble(view: SimState, now: number): void {
    const bubble = this.ui.pendingBubble;
    const dt = this.lastFrame > 0 ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    if (!bubble || this.ui.pending.peek() === 0) return;
    const head = this.renderer.headToScreen(this.slot);
    if (!head) return;
    const points = (view.players[this.slot]?.trailPath.length ?? 0) >> 1;
    const hz = PULSE_MIN_HZ + (PULSE_MAX_HZ - PULSE_MIN_HZ) * Math.min(1, points / PULSE_TRAIL_POINTS);
    this.pulsePhase = (this.pulsePhase + dt * hz * 2 * Math.PI) % (2 * Math.PI);
    bubble.style.transform = `translate3d(${head.x.toFixed(1)}px, ${head.y.toFixed(1)}px, 0)`;
    bubble.style.setProperty('--pulse', (1 + PULSE_AMOUNT * Math.sin(this.pulsePhase)).toFixed(3));
  }

  // ---------- Controller buttons ----------

  /** Escape, or Start on a pad (which still works while a menu has the pad). */
  private togglePause(): void {
    if (this.ui.paused.peek()) this.ui.actions.resume();
    else this.ui.actions.pause();
  }

  private clearResultsTimer(): void {
    if (this.resultsTimer === null) return;
    clearTimeout(this.resultsTimer);
    this.resultsTimer = null;
  }
}

/** Real length of a tick on the host this state came from. */
function tickLengthMs(state: SimState): number {
  return 1000 / state.config.ticksPerSecond;
}

function nameOf(state: SimState, slot: Slot): string | null {
  return slot === 0 ? null : (state.players[slot]?.profile.name ?? null);
}
