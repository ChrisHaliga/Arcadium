/** Who the bots are: plain names, muted colours, default cosmetics. */
import type { Random } from '../ai';
import { DEFAULT_LOADOUT } from '../content';
import type { PlayerProfile } from '../core';
import { BOT_COLORS } from '../palette';

/** Short ordinary names, so bots read as people rather than as "Bot 7". */
const BOT_NAMES: readonly string[] = [
  'Pip', 'Moss', 'Juno', 'Bram', 'Wren', 'Otto', 'Fern', 'Iris', 'Milo', 'Nell',
  'Rook', 'Tess', 'Ash', 'Bea', 'Cole', 'Dot', 'Elm', 'Fig', 'Gus', 'Hal',
  'Ivy', 'Jay', 'Kit', 'Lou', 'Max', 'Ned', 'Opal', 'Pia', 'Quin', 'Rex',
  'Sol', 'Tam', 'Uma', 'Vic', 'Wes', 'Yara', 'Zed', 'Bo', 'Cy', 'Dex',
  'Finn', 'Gale', 'Hugo', 'Ines', 'Jules', 'Kai', 'Lark', 'Mabel', 'Nico', 'Olive',
  'Pax', 'Remy', 'Tito', 'Vera', 'Wade', 'Zoe',
];

/**
 * A profile for a new bot whose name differs from everyone seated and whose colour is
 * one of the least used among the seated bots.
 */
export function botProfile(id: string, random: Random, seated: readonly PlayerProfile[]): PlayerProfile {
  const taken = new Set(seated.map((p) => p.name));
  const names = BOT_NAMES.filter((name) => !taken.has(name));
  const uses = new Array<number>(BOT_COLORS.length).fill(0);
  for (const p of seated) if (p.kind === 'bot') uses[p.color % BOT_COLORS.length]++;
  const fewest = Math.min(...uses);
  const colors = uses.flatMap((n, color) => (n === fewest ? [color] : []));
  return {
    id,
    name: random.pick(names.length > 0 ? names : BOT_NAMES),
    kind: 'bot',
    color: random.pick(colors),
    cosmetics: { ...DEFAULT_LOADOUT },
  };
}
