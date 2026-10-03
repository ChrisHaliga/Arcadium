/**
 * The one rule for player names, shared by the hub (what a player may call themselves) and
 * the match server (what it shows everyone else), so the name in the profile is the name
 * other players see. No DOM: the server imports it.
 */

export const NAME_MAX_LENGTH = 16;

/**
 * Control, format (zero-width, bidi override), lone surrogate and private-use characters,
 * except whitespace. Unassigned code points stay: an emoji newer than one side's Unicode
 * tables would otherwise survive on one side and not the other.
 */
const UNPRINTABLE = /(?!\p{White_Space})[\p{Cc}\p{Cf}\p{Cs}\p{Co}]/gu;
const WHITESPACE_RUN = /\p{White_Space}+/gu;

/**
 * Keeps at most NAME_MAX_LENGTH characters: unprintable ones go and whitespace runs (tabs
 * and line breaks too) become one space. Counts code points, so emoji are never cut in
 * half. '' when nothing usable is left.
 */
export function cleanName(name: string): string {
  const printable = name.replace(UNPRINTABLE, '').replace(WHITESPACE_RUN, ' ').trim();
  return Array.from(printable).slice(0, NAME_MAX_LENGTH).join('').trim();
}
