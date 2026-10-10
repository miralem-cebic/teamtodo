import { useMemo } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { openPanel, useApp } from '../../store/appStore';
import { usePrefs } from '../../store/prefs';
import { hiddenProjectIds, isVisible } from '../../store/selectors';
import { fmtTimestamp } from '../../lib/dates';
import { t } from '../../i18n';
import { renderMentions } from '../../components/RichText';
import { deriveInbox, isRead, markAllRead, markRead, useInboxRead, type InboxItem } from './inbox';

const ICON: Record<InboxItem['kind'], 'user' | 'comment' | 'check'> = { assigned: 'user', mention: 'comment', comment: 'comment', completed: 'check' };

export function useInbox() {
  const tasks = useApp((s) => s.tasks);
  const projects = useApp((s) => s.projects);
  const users = useApp((s) => s.users);
  const meId = useApp((s) => s.meId);
  const read = useInboxRead();
  const items = useMemo(() => {
    const hidden = hiddenProjectIds(projects);
    return deriveInbox(tasks, users, meId, (t) => isVisible(t, tasks, hidden));
  }, [tasks, projects, users, meId]);
  const unread = items.filter((it) => !isRead(it, read)).length;
  return { items, unread, read };
}

export function InboxView() {
  const { items, unread, read } = useInbox();
  const tasks = useApp((s) => s.tasks);
  const users = useApp((s) => s.users);
  const panelId = useApp((s) => s.panelId);
  const unreadOnly = usePrefs((p) => !!p.inboxUnreadOnly);
  const shown = unreadOnly ? items.filter((it) => !isRead(it, read)) : items;

  return (
    <div className="inbox">
      <div className="inbox-tools">
        <div className="seg" role="tablist" aria-label={t('inbox.label')}>
          <button type="button" role="tab" aria-selected={!unreadOnly} className={unreadOnly ? '' : 'on'} onClick={() => usePrefs.setState({ inboxUnreadOnly: false })}>{t('common.all')}</button>
          <button type="button" role="tab" aria-selected={unreadOnly} className={unreadOnly ? 'on' : ''} onClick={() => usePrefs.setState({ inboxUnreadOnly: true })}>
            {t('inbox.unread')}{unread ? ` (${unread})` : ''}
          </button>
        </div>
        <span className="sp" />
        {unread > 0 && (
          <button type="button" className="tb" onClick={markAllRead}>
            <Icon n="check" s={15} />
            <span>{t('inbox.markAll')}</span>
          </button>
        )}
      </div>
      {!shown.length && (
        <div className="empty-state">
          <p>{unreadOnly ? t('inbox.caughtUp') : t('inbox.intro')}</p>
        </div>
      )}
      <ul className="inbox-list" aria-label={t('inbox.label')}>
        {shown.map((it) => {
          const u = users.find((x) => x.id === it.userId);
          const task = tasks[it.taskId];
          const unreadItem = !isRead(it, read);
          return (
            <li key={it.id}>
              <button
                type="button"
                className={'inbox-it' + (unreadItem ? ' unread' : '') + (panelId === it.taskId ? ' selected' : '')}
                onClick={() => {
                  markRead([it.id]);
                  openPanel(it.taskId);
                }}
                aria-label={`${u?.name ?? t('inbox.someone')} ${it.text}: ${task?.title ?? ''}${unreadItem ? ' ' + t('inbox.unreadTag') : ''}`}
              >
                <span className="inbox-dot" aria-hidden="true" />
                <Avatar user={u} size={30} />
                <span className="inbox-b">
                  <span className="inbox-h">
                    <strong>{u?.name ?? t('inbox.someone')}</strong> {it.text}
                    <span className="inbox-t">{fmtTimestamp(it.at)}</span>
                  </span>
                  <span className="inbox-task">
                    <Icon n={ICON[it.kind]} s={13} />
                    {task?.title || t('task.untitled')}
                  </span>
                  {it.snippet && <span className="inbox-snip">{renderMentions(it.snippet, users)}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
