/** Volume-style slider (0..1) with a filled track. */
import './widgets.css';

interface SliderProps {
  value: number;
  label: string;
  onInput(value: number): void;
  /** Fires once the player lets go, e.g. to play a sample at the new volume. */
  onCommit?(value: number): void;
}

const STEPS = 20;

export function Slider({ value, label, onInput, onCommit }: SliderProps) {
  const percent = Math.round(value * 100);
  return (
    <input
      class="slider"
      type="range"
      min={0}
      max={STEPS}
      step={1}
      value={Math.round(value * STEPS)}
      aria-label={label}
      aria-valuetext={`${percent}%`}
      style={{ '--fill': `${percent}%` }}
      onInput={(e) => onInput(Number(e.currentTarget.value) / STEPS)}
      onChange={(e) => onCommit?.(Number(e.currentTarget.value) / STEPS)}
    />
  );
}
