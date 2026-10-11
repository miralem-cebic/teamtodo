import { useEffect, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { readConflictCopy, resolveConflictCopy, useSession } from '../../app/session';
import { showToast } from '../../store/appStore';
import type { ConflictPayload } from '../../data/repository';
import { t } from '../../i18n';

/** The copies that the shared folder created when a file was changed in two places at once. Merge or discard each one. */
export function ConflictDialog({ onClose }: { onClose: () => void }) {
  const names = useSession((s) => s.conflictCopies);
  const [loaded, setLoaded] = useState<Record<string, ConflictPayload>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    for (const name of names) {
      if (loaded[name]) continue;
      readConflictCopy(name).then(
        (p) => setLoaded((cur) => ({ ...cur, [name]: p })),
        (e) => setLoaded((cur) => ({ ...cur, [name]: { kind: 'unreadable', message: e instanceof Error ? e.message : String(e), modified: 0 } })),
      );
    }
  }, [names, loaded]);

  const act = async (name: string, action: 'merge' | 'discard') => {
    setBusy(name);
    try {
      await resolveConflictCopy(name, action);
      showToast(t(action === 'merge' ? 'conflict.merged' : 'conflict.discarded'));
    } catch (e) {
      showToast(t('conflict.failed', { reason: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
    }
  };

  const label = (p: ConflictPayload | undefined) => {
    if (!p) return t('conflict.loading');
    switch (p.kind) {
      case 'task':
        return t('conflict.kindTask', { title: p.task.title.trim() || t('task.untitled') });
      case 'users':
        return t('conflict.kindUsers');
      case 'projects':
        return t('conflict.kindProjects');
      case 'workspace':
        return t('conflict.kindWorkspace');
      case 'unreadable':
        return t('conflict.unreadable');
    }
  };

  return (
    <Dialog title={t('conflict.title')} onClose={onClose} wide>
      {names.length === 0 ? (
        <p className="d-text">{t('conflict.none')}</p>
      ) : (
        <>
          <p className="d-text">{t('conflict.intro')}</p>
          <ul className="conflict-list">
            {names.map((name) => {
              const p = loaded[name];
              const mergeable = p !== undefined && (p.kind === 'task' || p.kind === 'users' || p.kind === 'projects');
              return (
                <li key={name} className="conflict-item">
                  <div className="conflict-text">
                    <strong>{label(p)}</strong>
                    {p && p.kind !== 'unreadable' && <span className="d-text">{t('conflict.modified', { date: new Date(p.modified).toLocaleString() })}</span>}
                    <code>{name}</code>
                  </div>
                  <div className="conflict-actions">
                    <button type="button" className="btn primary" disabled={!mergeable || busy !== null} onClick={() => void act(name, 'merge')}>
                      {t('conflict.merge')}
                    </button>
                    <button type="button" className="btn" disabled={busy !== null || !p} onClick={() => void act(name, 'discard')}>
                      {t('conflict.discard')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Dialog>
  );
}
