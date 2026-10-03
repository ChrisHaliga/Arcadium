/** Red notification badge pinned to the top-right corner of its (relatively positioned) parent. */
import './widgets.css';

export function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span class="badge" aria-label={`${count} new`}>
      {count > 9 ? '9+' : count}
    </span>
  );
}
