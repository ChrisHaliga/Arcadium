/** Short messages that slide in under the top bar and leave by themselves. */
import { signal, type ReadonlySignal } from '@preact/signals';

export type ToastTone = 'error' | 'success' | 'info';

export interface ToastEntry {
  id: number;
  text: string;
  tone: ToastTone;
}

export interface Toasts {
  readonly list: ReadonlySignal<readonly ToastEntry[]>;
  show(text: string, tone?: ToastTone): void;
}

const VISIBLE_MS = 2400;
const MAX_VISIBLE = 3;

export function createToasts(): Toasts {
  const list = signal<readonly ToastEntry[]>([]);
  let nextId = 1;
  return {
    list,
    show(text, tone = 'info') {
      // The same message twice in a row (e.g. tapping a locked button repeatedly) restarts it instead of stacking.
      const id = nextId++;
      list.value = [...list.value.filter((t) => t.text !== text), { id, text, tone }].slice(-MAX_VISIBLE);
      setTimeout(() => {
        list.value = list.value.filter((t) => t.id !== id);
      }, VISIBLE_MS);
    },
  };
}
