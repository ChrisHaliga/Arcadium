/**
 * The icon set the hub and every game's UI share: bold, rounded, single-colour glyphs on
 * a 24-unit grid that take the text colour. Filled shapes get a thin matching stroke to
 * round their corners.
 */
import type { JSX } from 'preact';

type Shape = { d: string; stroke?: boolean };

const ICONS = {
  home: [{ d: 'M12 3.3 3.2 10.6c-.7.6-.3 1.7.6 1.7H5V20c0 .6.4 1 1 1h4.2v-5.2h3.6V21H18c.6 0 1-.4 1-1v-7.7h1.2c.9 0 1.3-1.1.6-1.7Z' }],
  shop: [
    { d: 'M7.5 8V6.5a4.5 4.5 0 0 1 9 0V8', stroke: true },
    { d: 'M4.6 8h14.8c.5 0 1 .4 1 .9l.9 11A2 2 0 0 1 19.3 22H4.7a2 2 0 0 1-2-2.1l.9-11c0-.5.5-.9 1-.9Z' },
  ],
  missions: [
    {
      d: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20Zm0 3.2a6.8 6.8 0 1 1 0 13.6 6.8 6.8 0 1 1 0-13.6Zm0 2.6a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 1 0 0-8.4Zm0 2.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 1 1 0-3.2Z',
    },
  ],
  locker: [{ d: 'M8.6 3 3 5.6 1.4 10.3l3.7 1.7L6 10.9V20c0 .6.4 1 1 1h10c.6 0 1-.4 1-1v-9.1l.9 1.1 3.7-1.7L21 5.6 15.4 3c-.4 1.6-1.8 2.7-3.4 2.7S9 4.6 8.6 3Z' }],
  gear: [
    {
      d: 'M19.49 9.82 22.02 10.09 22.02 13.91 19.49 14.18 18.84 15.76 20.44 17.73 17.73 20.44 15.76 18.84 14.18 19.49 13.91 22.02 10.09 22.02 9.82 19.49 8.24 18.84 6.27 20.44 3.56 17.73 5.16 15.76 4.51 14.18 1.98 13.91 1.98 10.09 4.51 9.82 5.16 8.24 3.56 6.27 6.27 3.56 8.24 5.16 9.82 4.51 10.09 1.98 13.91 1.98 14.18 4.51 15.76 5.16 17.73 3.56 20.44 6.27 18.84 8.24ZM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 1 0 0-6.8Z',
    },
  ],
  gift: [
    { d: 'M3 7.5h7.8V11H3ZM13.2 7.5H21V11h-7.8ZM4 12.4h6.8v9.1H5.5A1.5 1.5 0 0 1 4 20ZM13.2 12.4H20V20a1.5 1.5 0 0 1-1.5 1.5h-5.3Z' },
    { d: 'M12 6.9C10.5 3.3 6.8 2.9 6.8 5.2c0 1.5 2.4 2 5.2 1.7Zm0 0c1.5-3.6 5.2-4 5.2-1.7 0 1.5-2.4 2-5.2 1.7Z' },
  ],
  lock: [
    {
      d: 'M7 10V7.5a5 5 0 0 1 10 0V10h.5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Zm2.6 0h4.8V7.5a2.4 2.4 0 0 0-4.8 0Zm2.4 4a1.7 1.7 0 0 0-.9 3.1V19h1.8v-1.9A1.7 1.7 0 0 0 12 14Z',
    },
  ],
  check: [{ d: 'M5 12.8l4.4 4.4L19 7.6', stroke: true }],
  close: [{ d: 'M6.5 6.5l11 11M17.5 6.5l-11 11', stroke: true }],
  refresh: [
    { d: 'M19.5 10.5A7.7 7.7 0 0 0 6 6.4M4.5 13.5A7.7 7.7 0 0 0 18 17.6', stroke: true },
    { d: 'M5.2 2.8v4.4h4.4M18.8 21.2v-4.4h-4.4', stroke: true },
  ],
  info: [{ d: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20Zm-1.4 8.6h2.8V17h-2.8Zm1.4-4.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 1 1 0-3.2Z' }],
  flame: [{ d: 'M12 2.3c1.2 3.6 5.8 6.2 5.8 11.3a5.8 5.8 0 0 1-11.6 0c0-2.5 1.2-4.4 2.8-5.9.2 1.7.9 3 2.1 3.5-.5-3 .1-6.1.9-8.9Z' }],
  snowflake: [
    { d: 'M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5', stroke: true },
    { d: 'M9.3 3.8 12 6.3l2.7-2.5M9.3 20.2 12 17.7l2.7 2.5', stroke: true },
  ],
  star: [{ d: 'M12 2.6l2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.2l-5.7 3 1.1-6.4-4.6-4.5 6.4-.9Z' }],
  play: [{ d: 'M8 5.3v13.4c0 .9.9 1.4 1.7.9l10.5-6.7c.7-.4.7-1.4 0-1.8L9.7 4.4C8.9 3.9 8 4.4 8 5.3Z' }],
  bot: [
    { d: 'M12 2.5v3', stroke: true },
    {
      d: 'M7 6h10a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4Zm1.8 4.6a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 1 0 0-3.6Zm6.4 0a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 1 0 0-3.6Z',
    },
  ],
  globe: [{ d: 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 1 0 0-19ZM2.5 12h19M12 2.5c-3.2 3.4-3.2 15.6 0 19M12 2.5c3.2 3.4 3.2 15.6 0 19', stroke: true }],
  pencil: [{ d: 'M4 20l1.1-4.6L15.6 4.9a2.2 2.2 0 0 1 3.1 3.1L8.2 18.6Z' }],
  chevronLeft: [{ d: 'M15 5l-7 7 7 7', stroke: true }],
  chevronRight: [{ d: 'M9 5l7 7-7 7', stroke: true }],
  trophy: [
    { d: 'M6.5 3h11v6.5a5.5 5.5 0 0 1-11 0Z' },
    { d: 'M6.5 5H3.5v1.5A3.5 3.5 0 0 0 7 10M17.5 5h3v1.5A3.5 3.5 0 0 1 17 10', stroke: true },
    { d: 'M10.5 14.5h3V18h-3ZM7.5 18h9v3h-9Z' },
  ],
  clock: [{ d: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18ZM12 7.5V12l3 2', stroke: true }],
  volume: [
    { d: 'M3.5 9.2h3.2L11 5.3v13.4l-4.3-3.9H3.5Z' },
    { d: 'M15 9a4.2 4.2 0 0 1 0 6M17.8 6.2a8.2 8.2 0 0 1 0 11.6', stroke: true },
  ],
  music: [
    { d: 'M9 17.5V5.2l11-2.2v12.3M9 9.2l11-2.2', stroke: true },
    { d: 'M6 14.5a3 3 0 1 0 0 6 3 3 0 1 0 0-6ZM17 12.3a3 3 0 1 0 0 6 3 3 0 1 0 0-6Z' },
  ],
  vibrate: [
    { d: 'M8.5 3h7A1.5 1.5 0 0 1 17 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5v-15A1.5 1.5 0 0 1 8.5 3Z' },
    { d: 'M3.5 8.5v7M20.5 8.5v7', stroke: true },
  ],
  shake: [{ d: 'M3 12h2.5l2-5 3 10 3-12 3 10 2-3H21', stroke: true }],
  fullscreen: [{ d: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5', stroke: true }],
  power: [{ d: 'M12 3v8.5M7 6.2a7.5 7.5 0 1 0 10 0', stroke: true }],
  chest: [
    { d: 'M3 11.6h18V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Zm7.4 1.6v4.2h3.2v-4.2Z' },
    { d: 'M3 10a5.5 5.5 0 0 1 5.5-5.5h7A5.5 5.5 0 0 1 21 10Z' },
  ],
  tile: [
    { d: 'M6 3.5h12A2.5 2.5 0 0 1 20.5 6v12a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5Zm1.5 3a1 1 0 0 0 0 2h4a1 1 0 0 0 0-2Z' },
  ],
  trail: [{ d: 'M3 17c3.5 0 3.5-10 7-10s3.5 10 7 10c2 0 3-2 4-4', stroke: true }],
  flag: [{ d: 'M5.5 21.5V3', stroke: true }, { d: 'M6.5 3.5h11.8c.7 0 1.1.8.7 1.4l-2.3 3.4 2.3 3.4c.4.6 0 1.4-.7 1.4H6.5Z' }],
  boom: [{ d: 'M12 1.8l2.1 5.4 5.4-2.2-2.2 5.4 5.4 2.1-5.4 2.1 2.2 5.4-5.4-2.2-2.1 5.4-2.1-5.4-5.4 2.2 2.2-5.4L1.3 12.5l5.4-2.1L4.5 5l5.4 2.2Z' }],
  gem: [{ d: 'M7 3.5h10l4.5 5.5L12 21 2.5 9ZM2.5 9h19M9 3.5 12 9l3-5.5M12 9v12', stroke: true }],
  heart: [{ d: 'M12 20.5S3 15 3 8.8A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 9 2.4c0 6.2-9 11.7-9 11.7Z' }],
  sparkle: [{ d: 'M12 2c.7 5.2 4.8 9.3 10 10-5.2.7-9.3 4.8-10 10-.7-5.2-4.8-9.3-10-10 5.2-.7 9.3-4.8 10-10Z' }],
  pause: [
    {
      d: 'M7.5 4.5h2.4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H7.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Zm6.6 0h2.4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-2.4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z',
    },
  ],
  mute: [{ d: 'M3.5 9.2h3.2L11 5.3v13.4l-4.3-3.9H3.5Z' }, { d: 'M15.2 9.2l5.6 5.6M20.8 9.2l-5.6 5.6', stroke: true }],
  musicOff: [
    { d: 'M9 17.5V5.2l11-2.2v12.3', stroke: true },
    { d: 'M6 14.5a3 3 0 1 0 0 6 3 3 0 1 0 0-6ZM17 12.3a3 3 0 1 0 0 6 3 3 0 1 0 0-6Z' },
    { d: 'M3 3l18 18', stroke: true },
  ],
  noSignal: [
    { d: 'M2.8 9.2a13.5 13.5 0 0 1 18.4 0M6 12.6a9 9 0 0 1 12 0M9.2 16a4.5 4.5 0 0 1 5.6 0', stroke: true },
    { d: 'M12 18.2a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 1 1 0-3.2Z' },
    { d: 'M4 3l16 18', stroke: true },
  ],
  crown: [{ d: 'M3 8.2l4.6 3.6L12 4.8l4.4 7 4.6-3.6-1.7 10.3H4.7ZM4.9 19.8h14.2V21H4.9Z' }],
  land: [
    {
      d: 'M12.6 3.2c3.7-.4 7.4 2 8.1 5.8.5 2.6-.9 4.2-.5 6.6.5 2.9-2 5.4-5.2 5.2-1.9-.1-2.8-1.2-4.8-1-2.8.3-5.6-1-6.3-3.9-.6-2.4.9-3.6.6-6C4 6.6 7.8 3.7 12.6 3.2Z',
    },
  ],
  sword: [
    { d: 'M20.5 3.5 12 12', stroke: true },
    { d: 'M20.5 3.5v4.4l-7.2 7.2-4.4-4.4 7.2-7.2Z' },
    { d: 'M6.2 12.9l4.9 4.9M8.6 15.4 4.2 19.8', stroke: true },
  ],
} satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  class?: string;
  /** Accessible label; icons are decorative when omitted. */
  label?: string;
  style?: JSX.CSSProperties;
}

export function Icon({ name, class: className, label, style }: IconProps) {
  const shapes: readonly Shape[] = ICONS[name];
  return (
    <svg
      class={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      style={style}
    >
      {shapes.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill={s.stroke ? 'none' : 'currentColor'}
          fill-rule="evenodd"
          stroke="currentColor"
          stroke-width={s.stroke ? 2.6 : 1}
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      ))}
    </svg>
  );
}
