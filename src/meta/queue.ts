/**
 * Notification queues the hub drains to play celebrations (level-ups, coins flying
 * into the counter). Entries wait until the hub is ready to show them, e.g. after a
 * match ends, instead of firing while nobody is looking.
 */
import { signal, type ReadonlySignal } from '@preact/signals';

export interface EventQueue<T> {
  /** Entries not yet consumed, oldest first. */
  readonly pending: ReadonlySignal<readonly T[]>;
  /** Removes and returns the oldest entry (call when starting to show it). */
  shift(): T | undefined;
  /** Drops everything pending, e.g. gains earned in a match that already showed its own animation. */
  clear(): void;
}

export interface WritableQueue<T> extends EventQueue<T> {
  push(entry: T): void;
}

/** When more than `limit` entries pile up, the oldest are dropped. */
export function createQueue<T>(limit: number): WritableQueue<T> {
  const pending = signal<readonly T[]>([]);
  return {
    pending,
    push(entry) {
      pending.value = [...pending.value, entry].slice(-limit);
    },
    shift() {
      const list = pending.value;
      if (list.length === 0) return undefined;
      pending.value = list.slice(1);
      return list[0];
    },
    clear() {
      if (pending.value.length > 0) pending.value = [];
    },
  };
}
