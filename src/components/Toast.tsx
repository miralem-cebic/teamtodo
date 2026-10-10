import { useEffect } from 'react';
import { dismissToast, undo, useApp } from '../store/appStore';
import { Icon } from './Icon';

export function ToastHost() {
  const toast = useApp((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(dismissToast, toast.undo ? 6000 : 2500);
    return () => clearTimeout(h);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite" key={toast.id}>
      <span>{toast.msg}</span>
      {toast.undo && (
        <button type="button" onClick={undo}>
          <Icon n="chevL" s={13} />
          Undo
        </button>
      )}
      <button type="button" className="icon-btn" onClick={dismissToast} aria-label="Dismiss notice">
        <Icon n="x" s={14} />
      </button>
    </div>
  );
}
