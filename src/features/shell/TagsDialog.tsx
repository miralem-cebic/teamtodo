import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { removeTagEverywhere, renameTag, useApp } from '../../store/appStore';
import { tagCounts } from '../../lib/tags';
import { t } from '../../i18n';

/** All tags in use, with the number of tasks that have them. Rename (a name in use merges) or remove from all tasks. */
export function TagsDialog({ onClose }: { onClose: () => void }) {
  const tasks = useApp((s) => s.tasks);
  const tags = tagCounts(Object.values(tasks));
  return (
    <Dialog title={t('tags.manageTitle')} onClose={onClose}>
      <p className="d-text">{t('tags.intro')}</p>
      {tags.length === 0 ? (
        <p className="d-text">{t('tags.none')}</p>
      ) : (
        <ul className="tag-manage">
          {tags.map((tag) => (
            <TagRow key={tag.name} name={tag.name} count={tag.count} />
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function TagRow({ name, count }: { name: string; count: number }) {
  const [draft, setDraft] = useState(name);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== name) renameTag(name, next);
    else setDraft(name);
  };
  return (
    <li className="tag-manage-row">
      <input
        className="tag-in"
        value={draft}
        aria-label={t('tags.renameAria', { name })}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
      <span className="n">{count === 1 ? t('tags.count1') : t('tags.countN', { n: count })}</span>
      <button type="button" className="btn sm" onClick={() => removeTagEverywhere(name)} aria-label={t('tags.removeAllAria', { name })}>
        {t('tags.removeAll')}
      </button>
    </li>
  );
}
