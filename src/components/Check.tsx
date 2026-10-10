import { Icon } from './Icon';
import { t } from '../i18n';

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
      aria-label={done ? t('check.undone') : t('panel.markDone')}
      aria-pressed={done}
    >
      <Icon n="check" s={small ? 11 : 12} />
    </button>
  );
}
