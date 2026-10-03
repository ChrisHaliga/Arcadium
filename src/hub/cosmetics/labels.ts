/** Display names and icons for cosmetic kinds and rarities. */
import type { CosmeticKind, Rarity } from '../../shared/services';
import type { IconName } from '../../shared/ui/kit';

export const KINDS: readonly CosmeticKind[] = ['skin', 'trail', 'capture', 'kill'];

export const KIND_INFO: Readonly<Record<CosmeticKind, { label: string; plural: string; icon: IconName }>> = {
  skin: { label: 'Skin', plural: 'Skins', icon: 'tile' },
  trail: { label: 'Trail', plural: 'Trails', icon: 'trail' },
  capture: { label: 'Capture FX', plural: 'Captures', icon: 'flag' },
  kill: { label: 'Knockout FX', plural: 'Knockouts', icon: 'boom' },
};

export const RARITY_LABEL: Readonly<Record<Rarity, string>> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

/** Rarity colours for canvas effects; CSS uses the matching --common/--rare/... tokens. */
export const RARITY_COLORS: Readonly<Record<Rarity, readonly string[]>> = {
  common: ['#a3b6cc', '#dfe7f1', '#ffffff'],
  rare: ['#3fa9ff', '#8fd3ff', '#ffffff'],
  epic: ['#b45bff', '#e0b3ff', '#ff6bd6', '#ffffff'],
  legendary: ['#ffc531', '#fff1a8', '#ff9a1f', '#ffffff'],
};
