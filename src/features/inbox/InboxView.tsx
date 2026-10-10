import { useMemo } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { openPanel, useApp } from '../../store/appStore';
import { usePrefs } from '../../store/prefs';
import { isVisible } from '../../store/selectors';
import { fmtTimestamp } from '../../lib/dates';
import { renderMentions } from '../task-panel/Feed';
import { deriveInbox, isRead, markAllRead, markRead, useInboxRead, type InboxItem } from './inbox';

const ICON: Record<InboxItem['kind'], 'user' | 'comment' | 'check'> = { assigned: 'user', mention: 'comment', comment: 'comment', completed: 'check' };

export function useInbox() {
  const tasks = useApp((s) => s.tasks);
  const projects = useApp((s) => s.projects);
  const users = useApp((s) => s.users);
  const meId = useApp((s) => s.meId);
  const read = useInboxRead();
  const items = useMemo(() => {
    const deleted = new Set(projects.filter((p) => p.deletedAt).map((p) => p.id));
    return deriveInbox(tasks, users, meId, (t) => isVisible(t, tasks, deleted));
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
        <div className="seg" role="tablist" aria-label="Benachrichtigungen">
          <button type="button" role="tab" aria-selected={!unreadOnly} className={unreadOnly ? '' : 'on'} onClick={() => usePrefs.setState({ inboxUnreadOnly: false })}>All</button>
          <button type="button" role="tab" aria-selected={unreadOnly} className={unreadOnly ? 'on' : ''} onClick={() => usePrefs.setState({ inboxUnreadOnly: true })}>
            Unread{unread ? ` (${unread})` : ''}
          </button>
        </div>
        <span className="sp" />
        {unread > 0 && (
          <button type="button" className="tb" onClick={markAllRead}>
            <Icon n="check" s={15} />
            <span>Mark all as read</span>
          </button>
        )}
      </div>
      {!shown.length && (
        <div className="empty-state">
          <p>{unreadOnly ? 'All caught up.' : 'Here you see what others assign to you, where they mention you, or comment on tasks you follow.'}</p>
        </div>
      )}
      <ul className="inbox-list" aria-label="Benachrichtigungen">
        {shown.map((it) => {
          const u = users.find((x) => x.id === it.userId);
          const t = tasks[it.taskId];
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
                aria-label={`${u?.name ?? 'Someone'} ${it.text}: ${t?.title ?? ''}${unreadItem ? ' (unread)' : ''}`}
              >
                <span className="inbox-dot" aria-hidden="true" />
                <Avatar user={u} size={30} />
                <span className="inbox-b">
                  <span className="inbox-h">
                    <strong>{u?.name ?? 'Someone'}</strong> {it.text}
                    <span className="inbox-t">{fmtTimestamp(it.at)}</span>
                  </span>
                  <span className="inbox-task">
                    <Icon n={ICON[it.kind]} s={13} />
                    {t?.title || 'Untitled'}
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
