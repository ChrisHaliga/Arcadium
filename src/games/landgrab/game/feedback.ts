/**
 * Makes reward moments loud: sounds, haptics, callouts, kill feed lines and coins that
 * burst from where they were earned and fly into the coin counter, which only counts
 * them as they land.
 */
import type { AudioService, HapticsService } from '../../../shared/services';
import type { Renderer, ScreenPoint } from '../render/contract';
import type { RewardMoment } from '../rewards';
import type { GameUi } from '../ui/store';
import { FEAT_ROLL_MS } from '../ui/timing';

/** One flying coin per this many coins earned, within the limits below. */
const COINS_PER_FLYER = 6;
const MAX_FLYERS = 40;
/** Coin landing sounds closer together than this merge into one. */
const CLINK_GAP_MS = 45;

export class Feedback {
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private lastClink = 0;
  private clinkPitch = 1;

  constructor(
    private readonly ui: GameUi,
    private readonly renderer: Renderer,
    private readonly canvas: HTMLCanvasElement,
    private readonly audio: AudioService,
    private readonly haptics: HapticsService,
  ) {}

  celebrate(moments: readonly RewardMoment[]): void {
    for (const m of moments) this.one(m);
  }

  dispose(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private one(m: RewardMoment): void {
    for (const sound of m.sounds) this.audio.play(sound.id, { pitch: sound.pitch });
    this.haptics.impact(m.haptic);
    // The round banner celebrates a win; a callout would say the same thing twice.
    if (m.title && m.kind !== 'win') {
      this.ui.showCallout({
        kind: m.kind,
        title: m.title,
        detail: m.detail,
        coins: m.coins,
        roll: m.roll,
      });
    }
    if (m.feed) {
      this.ui.addFeedLine(m.feed, m.coins);
      this.ui.flash.value++;
    }
    if (m.coins <= 0) return;
    if (m.roll) this.later(FEAT_ROLL_MS, () => this.flyCoins(m));
    else this.flyCoins(m);
  }

  private flyCoins(m: RewardMoment): void {
    const flyers = Math.min(MAX_FLYERS, Math.max(1, Math.ceil(m.coins / COINS_PER_FLYER)));
    const base = Math.floor(m.coins / flyers);
    let extra = m.coins - base * flyers;
    this.clinkPitch = 1;
    this.renderer.coinBurst(m.from, flyers, this.counterPoint(), () => {
      const share = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
      this.ui.coins.value += share;
      this.clink();
    });
  }

  /** Each landing coin clinks a little higher, so a big burst rises like a payout. */
  private clink(): void {
    const now = performance.now();
    if (now - this.lastClink < CLINK_GAP_MS) return;
    this.lastClink = now;
    this.audio.play('coin', { pitch: this.clinkPitch, volume: 0.55 });
    this.clinkPitch = Math.min(1.8, this.clinkPitch + 0.04);
  }

  /** The coin counter's centre in canvas coordinates. */
  private counterPoint(): ScreenPoint {
    const target = this.ui.coinCounter?.getBoundingClientRect();
    const origin = this.canvas.getBoundingClientRect();
    if (!target) return { x: 40, y: 80 };
    return {
      x: target.left + target.height / 2 - origin.left,
      y: target.top + target.height / 2 - origin.top,
    };
  }

  private later(ms: number, run: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, ms);
    this.timers.add(timer);
  }
}
