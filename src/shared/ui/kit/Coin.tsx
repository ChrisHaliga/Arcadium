/** The gold coin: the one currency glyph used everywhere money is shown. */
import './coin.css';

export function CoinIcon({ class: className }: { class?: string }) {
  return (
    <svg class={className ? `coin-icon ${className}` : 'coin-icon'} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="13.2" r="10.3" fill="#b86f00" />
      <circle cx="12" cy="11.6" r="10.3" fill="#ffc531" />
      <circle cx="12" cy="11.6" r="7.3" fill="#ffd95a" stroke="#e39a00" stroke-width="1.5" />
      <path
        d="M12 6.9l1.45 2.95 3.25.47-2.35 2.3.55 3.24L12 14.33l-2.9 1.53.55-3.24-2.35-2.3 3.25-.47Z"
        fill="#e39a00"
        stroke="#e39a00"
        stroke-width="0.6"
        stroke-linejoin="round"
      />
      <path d="M5.2 8.6a7.6 7.6 0 0 1 4.6-4.4" fill="none" stroke="#fff6cf" stroke-width="1.6" stroke-linecap="round" />
    </svg>
  );
}
