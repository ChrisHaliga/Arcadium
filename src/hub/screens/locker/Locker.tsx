/** Locker: the player's name, colour, lifetime stats and equipped cosmetics per game. */
import { useState } from 'preact/hooks';
import { PLAYER_COLORS, playerColor } from '../../../games/registry';
import type { GameModule } from '../../../shared/game';
import { cleanName, NAME_MAX_LENGTH } from '../../../shared/names';
import type { CosmeticDef, CosmeticKind } from '../../../shared/services';
import { Button, Icon, type IconName } from '../../../shared/ui/kit';
import { useHub } from '../../context';
import { ItemCard } from '../../cosmetics/ItemCard';
import { statIcon } from '../../statIcons';
import { KINDS, KIND_INFO } from '../../cosmetics/labels';
import { Avatar } from '../../ui/Avatar';
import { cx, formatCompact, humanize } from '../../ui/format';
import '../page.css';
import './locker.css';

export function Locker() {
  const { games } = useHub();
  const dressable = games.filter((g) => g.available && g.cosmetics.length > 0);
  return (
    <div class="page scroll-y">
      <div class="page__inner locker">
        <header class="page__header">
          <h1 class="page__title headline">Locker</h1>
        </header>
        <div class="locker__top">
          <ProfileCard />
          <ColorPicker />
        </div>
        {dressable.map((game) => (
          <Loadout key={game.id} game={game} />
        ))}
        <Stats />
      </div>
    </div>
  );
}

function ProfileCard() {
  const { meta, feedback, audio } = useHub();
  const { profile, progress } = meta.services;
  const [draft, setDraft] = useState<string | null>(null);
  const preview = draft === null ? '' : cleanName(draft);
  const previewLength = Array.from(preview).length;

  const save = () => {
    if (draft === null) return;
    if (!preview) {
      feedback.error('Your name needs at least one letter');
      return;
    }
    profile.setName(preview);
    setDraft(null);
    feedback.success('Name saved');
  };

  return (
    <section class="profile-card panel section">
      <Avatar color={playerColor(profile.color.value)} class="profile-card__avatar" />
      <div class="profile-card__main">
        {draft === null ? (
          <div class="profile-card__name-row">
            <span class="profile-card__name headline">{profile.name.value}</span>
            <Button
              variant="slate"
              size="s"
              round
              icon="pencil"
              aria-label="Edit name"
              onClick={() => setDraft(profile.name.value)}
            />
          </div>
        ) : (
          <form
            class="profile-card__edit"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input
              type="text"
              class="profile-card__input"
              value={draft}
              // Room for emoji (two UTF-16 units each); the counter shows what cleanName will keep.
              maxLength={NAME_MAX_LENGTH * 2}
              aria-label="Player name"
              autoFocus
              onInput={(e) => {
                setDraft(e.currentTarget.value);
                audio.play('hover', { pitch: 0.8 + Math.random() * 0.4 });
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                e.preventDefault();
                setDraft(null);
              }}
            />
            <span class={cx('profile-card__count', previewLength >= NAME_MAX_LENGTH && 'is-full')}>
              {previewLength}/{NAME_MAX_LENGTH}
            </span>
            <Button variant="green" size="s" icon="check" aria-label="Save name" onClick={save} />
          </form>
        )}
        <span class="profile-card__level">
          <Icon name="star" /> Level {progress.level.value}
        </span>
        <span class="profile-card__id">ID {profile.playerId.slice(0, 8).toUpperCase()}</span>
      </div>
    </section>
  );
}

function ColorPicker() {
  const { meta, particles, audio } = useHub();
  const { profile } = meta.services;
  const current = profile.color.value % PLAYER_COLORS.length;
  return (
    <section class="color-picker panel section">
      <h2 class="section__title headline">
        <Icon name="sparkle" /> Colour
      </h2>
      <div class="color-picker__grid" role="radiogroup" aria-label="Player colour">
        {PLAYER_COLORS.map((color, i) => (
          <button
            key={color.name}
            type="button"
            role="radio"
            aria-checked={i === current}
            aria-label={color.name}
            class={cx('swatch', i === current && 'is-active')}
            style={{ '--c': color.base, '--c-dark': color.dark, '--c-light': color.light }}
            data-sfx="none"
            onClick={(e) => {
              if (i === current) return;
              profile.setColor(i);
              audio.play('coin', { pitch: 0.8 + (i / PLAYER_COLORS.length) * 0.6 });
              const r = e.currentTarget.getBoundingClientRect();
              particles.burst(r.left + r.width / 2, r.top + r.height / 2, {
                colors: [color.base, color.light, '#fff'],
                kind: 'sparks',
                count: 18,
                speed: 260,
              });
            }}
          >
            {i === current && <Icon name="check" />}
          </button>
        ))}
      </div>
    </section>
  );
}

const RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3 } as const;

function Loadout({ game }: { game: GameModule }) {
  const { meta, toasts, particles, audio } = useHub();
  const { profile, cosmetics } = meta.services;
  const [kind, setKind] = useState<CosmeticKind>('skin');
  const loadout = profile.loadout(game.id);
  const owned = cosmetics.owned.value;
  const items = game.cosmetics
    .filter((def) => def.kind === kind)
    .sort((a, b) => Number(owned.has(b.id)) - Number(owned.has(a.id)) || RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
  const ownedCount = (k: CosmeticKind) => game.cosmetics.filter((d) => d.kind === k && owned.has(d.id)).length;

  const pick = (def: CosmeticDef, el: HTMLElement) => {
    if (!owned.has(def.id)) {
      toasts.show(`Find ${def.name} in the shop or in chests`, 'info');
      return;
    }
    if (loadout[kind] === def.id) return;
    profile.equip(game.id, kind, def.id);
    audio.play('reward', { volume: 0.5, pitch: 1.3 });
    const r = el.getBoundingClientRect();
    particles.burst(r.left + r.width / 2, r.top + r.height / 3, {
      colors: ['#fff', '#ffe680', '#8fd3ff'],
      kind: 'stars',
      count: 14,
      speed: 300,
    });
  };

  return (
    <section class="section loadout">
      <div class="section__head">
        <h2 class="section__title headline">
          <Icon name="locker" /> {game.title} loadout
        </h2>
      </div>
      <div class="segmented loadout__kinds" role="tablist" aria-label="Cosmetic type">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === kind}
            class={cx('segmented__tab', k === kind && 'is-active')}
            onClick={() => setKind(k)}
          >
            <Icon name={KIND_INFO[k].icon} />
            <span class="loadout__kind-label">{KIND_INFO[k].plural}</span>
            <span class="loadout__kind-count">
              {ownedCount(k)}/{game.cosmetics.filter((d) => d.kind === k).length}
            </span>
          </button>
        ))}
      </div>
      <div class="loadout__grid" key={kind}>
        {items.map((def) => {
          const equipped = loadout[kind] === def.id;
          return (
            <ItemCard
              key={def.id}
              def={def}
              size="s"
              locked={!owned.has(def.id)}
              active={equipped}
              tag={equipped ? 'Equipped' : undefined}
              onClick={(e) => pick(def, e.currentTarget)}
            />
          );
        })}
      </div>
    </section>
  );
}

function Stats() {
  const { meta, games } = useHub();
  const stats = meta.stats.value;
  const tiles: { icon: IconName; label: string; value: number }[] = [
    { icon: 'star', label: 'Coins earned', value: stats.coinsEarned },
    { icon: 'chest', label: 'Chests opened', value: stats.chestsOpened },
    { icon: 'missions', label: 'Missions done', value: stats.missionsClaimed },
    { icon: 'flame', label: 'Best streak', value: stats.bestStreak },
    { icon: 'shop', label: 'Items bought', value: stats.itemsBought },
    { icon: 'gift', label: 'Daily rewards', value: stats.dailyClaims },
  ];
  return (
    <section class="section">
      <h2 class="section__title headline">
        <Icon name="trophy" /> Stats
      </h2>
      <div class="stat-grid">
        {tiles.map((tile) => (
          <StatTile key={tile.label} {...tile} />
        ))}
      </div>
      {games
        .filter((g) => stats.games[g.id])
        .map((game) => (
          <div key={game.id} class="stat-game">
            <h3 class="stat-game__title">{game.title}</h3>
            <div class="stat-grid">
              {Object.entries(stats.games[game.id]).map(([stat, value]) => (
                <StatTile key={stat} icon={statIcon(stat)} label={humanize(stat)} value={value} />
              ))}
            </div>
          </div>
        ))}
    </section>
  );
}

function StatTile({ icon, label, value }: { icon: IconName; label: string; value: number }) {
  return (
    <div class="stat-tile panel">
      <Icon name={icon} class="stat-tile__icon" />
      <span class="stat-tile__value">{formatCompact(value)}</span>
      <span class="stat-tile__label">{label}</span>
    </div>
  );
}
