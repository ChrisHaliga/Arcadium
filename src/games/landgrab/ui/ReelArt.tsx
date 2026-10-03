/**
 * Full-colour art for the bonus spin's faces, one per multiplier: things from the game
 * (land, flags, treasure gems, crowns, trophies), never fruit, sevens or bars.
 */
import type { JSX } from 'preact';
import type { ReelIcon } from '../rewards';

const ART: Record<ReelIcon, () => JSX.Element> = {
  blob: () => (
    <>
      <path
        d="M24 9c8-1 15 4 15.5 11.5.3 5-2.6 7.6-1.8 12-1 5.6-6 8.2-11.4 7.6-3.4-.4-5.2-2-8.6-1.6-5.4.6-10.6-2.4-11.3-8-.4-3.6 2-5.6 1.6-9.4C7.4 14.2 14.6 10.2 24 9Z"
        fill="#0e9a72"
        transform="translate(0 3)"
      />
      <path
        d="M24 9c8-1 15 4 15.5 11.5.3 5-2.6 7.6-1.8 12-1 5.6-6 8.2-11.4 7.6-3.4-.4-5.2-2-8.6-1.6-5.4.6-10.6-2.4-11.3-8-.4-3.6 2-5.6 1.6-9.4C7.4 14.2 14.6 10.2 24 9Z"
        fill="#1fd6a0"
      />
      <path d="M14 17c2.4-3 6-4.4 9.6-4.6" fill="none" stroke="#b9f7e4" stroke-width="3" stroke-linecap="round" />
      <circle cx="20" cy="25" r="2.6" fill="#1b1440" />
      <circle cx="29" cy="25" r="2.6" fill="#1b1440" />
    </>
  ),
  flag: () => (
    <>
      <ellipse cx="22" cy="41" rx="13" ry="4" fill="#549a0b" />
      <ellipse cx="22" cy="39.5" rx="13" ry="4" fill="#7ed321" />
      <rect x="15" y="6" width="3.6" height="34" rx="1.8" fill="#f3efff" />
      <path d="M18 7.5h20.5c1 0 1.6 1.1 1 2l-4.2 6 4.2 6c.6.9 0 2-1 2H18Z" fill="#c4123a" transform="translate(0 2)" />
      <path d="M18 7.5h20.5c1 0 1.6 1.1 1 2l-4.2 6 4.2 6c.6.9 0 2-1 2H18Z" fill="#ff3b5c" />
      <path d="M21 10.5h12" stroke="#ff9cb0" stroke-width="2.4" stroke-linecap="round" />
    </>
  ),
  gem: () => (
    <>
      <path d="M15 9h18l9 11-18 20L6 20Z" fill="#0080c4" transform="translate(0 3)" />
      <path d="M15 9h18l9 11-18 20L6 20Z" fill="#1fb4ff" />
      <path
        d="M6 20h36M15 9l-3 11 12 20 12-20-3-11M12 20l12-11 12 11"
        fill="none"
        stroke="#bfe8ff"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <path d="M15 9h9l-12 11H6Z" fill="#7ad3ff" />
    </>
  ),
  crown: () => (
    <>
      <path d="M7 16l9 8 8-14 8 14 9-8-3.5 21h-27Z" fill="#c47f00" transform="translate(0 3)" />
      <path d="M7 16l9 8 8-14 8 14 9-8-3.5 21h-27Z" fill="#ffc531" />
      <rect x="10.5" y="33" width="27" height="5" rx="2" fill="#ffe680" />
      <circle cx="24" cy="26" r="3.4" fill="#ff3b5c" />
      <circle cx="15.5" cy="29" r="2.4" fill="#1fb4ff" />
      <circle cx="32.5" cy="29" r="2.4" fill="#1fd6a0" />
      <circle cx="7" cy="16" r="2.6" fill="#ffe680" />
      <circle cx="24" cy="10" r="2.6" fill="#ffe680" />
      <circle cx="41" cy="16" r="2.6" fill="#ffe680" />
    </>
  ),
  trophy: () => (
    <>
      <path d="M14 7h20v10a10 10 0 0 1-20 0Z" fill="#c47f00" transform="translate(0 3)" />
      <path
        d="M14 10H8.5v3a7 7 0 0 0 7 7M34 10h5.5v3a7 7 0 0 1-7 7"
        fill="none"
        stroke="#ffb21f"
        stroke-width="3.4"
        stroke-linecap="round"
      />
      <path d="M14 7h20v10a10 10 0 0 1-20 0Z" fill="#ffc531" />
      <path d="M18 10v6a6 6 0 0 0 3 5" fill="none" stroke="#fff4c2" stroke-width="2.6" stroke-linecap="round" />
      <rect x="21" y="26" width="6" height="7" fill="#e39a00" />
      <rect x="14" y="33" width="20" height="7" rx="2.5" fill="#9b3dff" />
      <rect x="14" y="33" width="20" height="2.6" rx="1.3" fill="#c48cff" />
    </>
  ),
};

export function ReelArt({ icon }: { icon: ReelIcon }): JSX.Element {
  const Art = ART[icon];
  return (
    <svg class="lg-face-art" viewBox="0 0 48 48" aria-hidden="true">
      <Art />
    </svg>
  );
}
