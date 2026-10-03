/**
 * The floating touch joystick's visuals: a ring where the finger landed and a knob that
 * follows it, fading out on release. Positioned with fixed client coordinates and
 * transforms only, so it never triggers layout and never intercepts touches.
 */

/** Ring radius and knob radius, CSS px. */
export const JOYSTICK_RADIUS = 56;
const KNOB_RADIUS = 24;
const FADE_MS = 220;

export class JoystickView {
  private readonly ring: HTMLDivElement;
  private readonly knob: HTMLDivElement;

  constructor(parent: HTMLElement = document.body) {
    this.ring = disc(JOYSTICK_RADIUS);
    this.ring.style.border = '3px solid rgba(255, 255, 255, 0.6)';
    this.ring.style.background = 'radial-gradient(circle, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.05) 70%)';
    this.ring.style.boxShadow = '0 4px 18px rgba(27, 20, 64, 0.35)';
    this.knob = disc(KNOB_RADIUS);
    this.knob.style.background = 'radial-gradient(circle at 35% 30%, #ffffff, #e9e3fb 75%)';
    this.knob.style.boxShadow = '0 3px 10px rgba(27, 20, 64, 0.45)';
    parent.append(this.ring, this.knob);
  }

  /** Shows the ring centred at (bx, by) and the knob at (kx, ky), client px. */
  place(bx: number, by: number, kx: number, ky: number): void {
    this.ring.style.transform = `translate3d(${bx}px, ${by}px, 0)`;
    this.knob.style.transform = `translate3d(${kx}px, ${ky}px, 0)`;
    this.ring.style.opacity = '1';
    this.knob.style.opacity = '1';
  }

  hide(): void {
    this.ring.style.opacity = '0';
    this.knob.style.opacity = '0';
  }

  dispose(): void {
    this.ring.remove();
    this.knob.remove();
  }
}

function disc(radius: number): HTMLDivElement {
  const el = document.createElement('div');
  const s = el.style;
  s.position = 'fixed';
  s.left = '0';
  s.top = '0';
  s.width = `${radius * 2}px`;
  s.height = `${radius * 2}px`;
  s.margin = `${-radius}px 0 0 ${-radius}px`;
  s.borderRadius = '50%';
  s.boxSizing = 'border-box';
  s.pointerEvents = 'none';
  s.opacity = '0';
  s.transition = `opacity ${FADE_MS}ms ease-out`;
  s.zIndex = '40';
  s.willChange = 'transform, opacity';
  el.setAttribute('aria-hidden', 'true');
  return el;
}
