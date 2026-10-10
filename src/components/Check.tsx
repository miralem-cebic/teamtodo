import { Icon } from './Icon';

export function Check({ done, onToggle, small }: { done: boolean; onToggle: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      className={'chk' + (done ? ' on' : '') + (small ? ' sm' : '')}
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={done ? 'Mark as not done' : 'Mark as done'}
      aria-pressed={done}
    >
      <Icon n="check" s={small ? 11 : 12} />
    </button>
  );
}
