import { useState } from 'react';
import { addTag, removeTag } from '../../store/appStore';
import type { TaskState } from '../../data/types';
import { MAX_TAG_LENGTH } from '../../lib/tags';
import { t as tr } from '../../i18n';

/** Tags of a task: each tag is a button that removes it; a field adds a new one on Enter */
export function Tags({ t }: { t: TaskState }) {
  const [draft, setDraft] = useState('');
  const tags = t.tags ?? [];
  const add = () => {
    addTag(t.id, draft);
    setDraft('');
  };
  return (
    <div className="tags">
      <span className="f-l">{tr('tags.label')}</span>
      <div className="tag-list">
        {tags.map((x) => (
          <button key={x} type="button" className="tag" onClick={() => removeTag(t.id, x)} aria-label={tr('tags.remove', { name: x })} title={tr('tags.remove', { name: x })}>
            <span>{x}</span>
            <span className="tag-x" aria-hidden="true">×</span>
          </button>
        ))}
        <input
          className="tag-in"
          value={draft}
          maxLength={MAX_TAG_LENGTH}
          placeholder={tr('tags.placeholder')}
          aria-label={tr('tags.add')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            e.preventDefault();
            add();
          }}
          onBlur={() => draft.trim() && add()}
        />
      </div>
    </div>
  );
}
