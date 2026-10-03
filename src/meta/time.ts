/**
 * Calendar keys and reset times. Daily and weekly content follow the player's local
 * calendar (resets at local midnight, weeks start Monday), so everything is keyed by
 * local-date strings rather than raw timestamps. Arithmetic between keys is done on
 * the calendar date itself, so DST shifts never make a day 23 or 25 hours long.
 */
import { batch, signal, type ReadonlySignal } from '@preact/signals';

const DAY_MS = 86_400_000;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEK_KEY = /^(\d{4})-W(\d{2})$/;

const pad = (n: number): string => String(n).padStart(2, '0');

const formatUtcDay = (t: number): string => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** The calendar date of a day key as a UTC timestamp: a pure date with no time zone attached. */
function calendarDate(key: string): number {
  const match = DAY_KEY.exec(key);
  if (!match) throw new Error(`invalid day key: ${key}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Local midnight at the start of the calendar date `t` (from calendarDate). */
const localMidnight = (t: number): number => {
  const d = new Date(t);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
};

export const isDayKey = (value: string): boolean => DAY_KEY.test(value);
export const isWeekKey = (value: string): boolean => WEEK_KEY.test(value);

/** Local calendar day of `ms`, e.g. "2026-10-01". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days from `from` to `to`; negative when `to` is earlier (e.g. the device clock was turned back). */
export function daysBetween(from: string, to: string): number {
  return Math.round((calendarDate(to) - calendarDate(from)) / DAY_MS);
}

export function addDays(key: string, days: number): string {
  return formatUtcDay(calendarDate(key) + days * DAY_MS);
}

/** ISO-8601 week of the local date of `ms`, e.g. "2026-W40". */
export function weekKey(ms: number): string {
  const date = calendarDate(dayKey(ms));
  const weekday = (new Date(date).getUTCDay() + 6) % 7;
  // An ISO week belongs to the year that holds its Thursday.
  const thursday = date + (3 - weekday) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return `${year}-W${pad(week)}`;
}

/** Local midnight that ends day `key` (epoch ms). */
export function dayEnd(key: string): number {
  return localMidnight(calendarDate(key) + DAY_MS);
}

/** Local midnight on the Monday that ends ISO week `key` (epoch ms). */
export function weekEnd(key: string): number {
  const match = WEEK_KEY.exec(key);
  if (!match) throw new Error(`invalid week key: ${key}`);
  // January 4th is always in week 1.
  const jan4 = Date.UTC(Number(match[1]), 0, 4);
  const week1Monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS;
  return localMidnight(week1Monday + Number(match[2]) * 7 * DAY_MS);
}

/**
 * The meta layer's view of "today". Time-dependent state (daily calendar, missions,
 * shop rotation) registers a rollover handler; sync() runs them all in one batch when
 * the local day or week changes, so the UI never sees half-rolled-over state.
 */
export interface Clock {
  now(): number;
  readonly day: ReadonlySignal<string>;
  readonly week: ReadonlySignal<string>;
  onRollover(handler: () => void): void;
  sync(): void;
}

export function createClock(now: () => number): Clock {
  const start = now();
  const day = signal(dayKey(start));
  const week = signal(weekKey(start));
  const handlers: (() => void)[] = [];
  return {
    now,
    day,
    week,
    onRollover(handler) {
      handlers.push(handler);
    },
    sync() {
      const t = now();
      const nextDay = dayKey(t);
      const nextWeek = weekKey(t);
      if (nextDay === day.peek() && nextWeek === week.peek()) return;
      batch(() => {
        day.value = nextDay;
        week.value = nextWeek;
        for (const handler of handlers) handler();
      });
    },
  };
}
