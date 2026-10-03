/**
 * Dialog shell: dimmed backdrop, glossy panel with a title ribbon, and a close button.
 * It is a navigation scope, so keyboard/gamepad focus stays inside while it is open.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from '../../shared/ui/kit';
import { focusFirst, lastFocused, usingKeys } from '../../shared/ui/nav';
import { cx } from './format';
import './modal.css';

export type ModalTone = 'blue' | 'gold' | 'purple' | 'pink' | 'green';

interface ModalProps {
  title: string;
  /** Omit to make the dialog non-dismissible (it closes itself). */
  onClose?: () => void;
  tone?: ModalTone;
  size?: 's' | 'm' | 'l';
  class?: string;
  children: ComponentChildren;
}

export function Modal({ title, onClose, tone = 'blue', size = 'm', class: className, children }: ModalProps) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = lastFocused();
    if (root.current && usingKeys()) focusFirst(root.current);
    return () => {
      if (!previous || !usingKeys()) return;
      // Next frame: the screen behind stays inert until this dialog has unmounted.
      requestAnimationFrame(() => {
        if (previous.isConnected) previous.focus({ preventScroll: true });
      });
    };
  }, []);

  return (
    <div class="modal" ref={root} role="dialog" aria-modal="true" aria-label={title} data-nav-scope>
      <div class="modal__backdrop" onClick={onClose} />
      <div class={cx('modal__panel', `modal__panel--${size}`, `modal--${tone}`, className)}>
        <div class="modal__ribbon">
          <h2 class="modal__title headline">{title}</h2>
        </div>
        {onClose && (
          <button type="button" class="modal__close" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        )}
        <div class="modal__body scroll-y">{children}</div>
      </div>
    </div>
  );
}
