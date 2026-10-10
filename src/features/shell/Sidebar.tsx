import { useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { Menu, Popover, usePop } from '../../components/Popover';
import { archiveProject, showToast, useApp } from '../../store/appStore';
import { byOrder, visibleTasks, type View } from '../../store/selectors';
import { forgetFolder, switchUser, useSession } from '../../app/session';
import { useInbox } from '../inbox/InboxView';
import { LANGS, LANG_NAMES, currentLang, t } from '../../i18n';
import { PALETTES, setLanguage, setPalette, usePrefs } from '../../store/prefs';
import { setNotificationsEnabled } from '../../lib/notifications';
import { paletteLabel } from '../../lib/labels';
import { NewProjectDialog } from '../templates/NewProjectDialog';

interface Props {
  view: View;
  go: (v: View) => void;
  openKeys: () => void;
  openData: () => void;
  openTeam: () => void;
}

export function Sidebar({ view, go, openKeys, openData, openTeam }: Props) {
  const tasks = useApp((s) => s.tasks);
  const projects = useApp((s) => s.projects);
  const users = useApp((s) => s.users);
  const meId = useApp((s) => s.meId);
  const dirName = useSession((s) => s.dirName);
  const conflicts = useSession((s) => s.conflictCopies.length);
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const up = usePop();
  const palette = usePrefs((s) => s.palette ?? 'standard');
  const notifications = usePrefs((s) => !!s.notifications);
  const me = users.find((u) => u.id === meId);
  const { unread } = useInbox();

  const counts = useMemo(() => {
    const { visible } = visibleTasks(tasks, projects);
    const c: Record<string, number> = { my: 0 };
    for (const t of visible) {
      if (t.completedAt) continue;
      if (t.assigneeId === meId) c.my! += 1;
      if (t.projectId && !t.parentId) c[t.projectId] = (c[t.projectId] ?? 0) + 1;
    }
    return c;
  }, [tasks, projects, meId]);

  const live = projects.filter((p) => !p.deletedAt && !p.template).sort(byOrder);
  const active = live.filter((p) => !p.archivedAt);
  const archived = live.filter((p) => p.archivedAt);

  return (
    <nav className="side" aria-label={t('nav.label')}>
      <div className="brand">
        <span className="logo" aria-hidden="true"><Icon n="check" s={14} /></span>
        teamtodo
      </div>
      <button type="button" className={'nav' + (view.type === 'my' ? ' on' : '')} onClick={() => go({ type: 'my' })} aria-current={view.type === 'my' ? 'page' : undefined}>
        <Icon n="mine" />
        <span>{t('nav.myTasks')}</span>
        <span className="n">{counts.my}</span>
      </button>
      <button type="button" className={'nav' + (view.type === 'inbox' ? ' on' : '')} onClick={() => go({ type: 'inbox' })} aria-current={view.type === 'inbox' ? 'page' : undefined}
        aria-label={unread ? t('nav.inboxUnread', { n: unread }) : t('nav.inbox')}>
        <Icon n="bell" />
        <span>{t('nav.inbox')}</span>
        {unread > 0 && <span className="n badge-n">{unread}</span>}
      </button>
      <button type="button" className={'nav' + (view.type === 'templates' ? ' on' : '')} onClick={() => go({ type: 'templates' })} aria-current={view.type === 'templates' ? 'page' : undefined}>
        <Icon n="copy" />
        <span>{t('nav.templates')}</span>
      </button>

      <div className="side-h">
        <span>{t('nav.projects')}</span>
        <button type="button" className="icon-btn" onClick={() => setAdding(true)} aria-label={t('project.add')} title={t('project.add')}>
          <Icon n="plus" s={15} />
        </button>
      </div>
      {active.map((p) => (
        <button key={p.id} type="button" className={'nav' + (view.type === 'project' && view.id === p.id ? ' on' : '')} onClick={() => go({ type: 'project', id: p.id })}
          aria-current={view.type === 'project' && view.id === p.id ? 'page' : undefined}>
          <span className={'sq c-' + p.color} />
          <span>{p.name}</span>
          <span className="n">{counts[p.id] ?? 0}</span>
        </button>
      ))}
      {!active.length && <p className="side-empty">{t('side.noProjects')}</p>}
      {archived.length > 0 && (
        <>
          <button type="button" className="side-h side-toggle" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
            <span>{t('side.archive', { n: archived.length })}</span>
            <Icon n={showArchived ? 'chevD' : 'chevR'} s={14} />
          </button>
          {showArchived &&
            archived.map((p) => (
              <div key={p.id} className="nav-arch">
                <button type="button" className={'nav' + (view.type === 'project' && view.id === p.id ? ' on' : '')} onClick={() => go({ type: 'project', id: p.id })}>
                  <span className={'sq c-' + p.color} />
                  <span>{p.name}</span>
                </button>
                <button type="button" className="icon-btn" onClick={() => archiveProject(p.id, false)} aria-label={t('project.restoreNamed', { name: p.name })} title={t('project.restore')}>
                  <Icon n="archive" s={14} />
                </button>
              </div>
            ))}
        </>
      )}

      {adding && (
        <NewProjectDialog
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            go({ type: 'project', id });
          }}
        />
      )}

      <span className="sp" />
      {conflicts > 0 && (
        <p className="side-note" role="button" tabIndex={0} onClick={openData} onKeyDown={(e) => e.key === 'Enter' && openData()} title={t('side.conflictHint')}>
          <Icon n="alert" s={14} />
          {conflicts === 1 ? t('side.conflict1') : t('side.conflictN', { n: conflicts })}
        </p>
      )}
      <div className="side-h">
        <span>{t('team.title')}</span>
        <button type="button" className="icon-btn" onClick={openTeam} aria-label={t('team.manage')} title={t('team.manage')}>
          <Icon n="edit" s={14} />
        </button>
      </div>
      <div className="team">
        {users.filter((u) => !u.deletedAt).map((u) => (
          <Avatar key={u.id} user={u} size={26} />
        ))}
      </div>
      <button type="button" className="nav" onClick={openData}>
        <Icon n="db" />
        <span>{t('nav.data')}</span>
      </button>
      <button type="button" className="nav" onClick={openKeys}>
        <Icon n="key" />
        <span>{t('nav.shortcuts')}</span>
        <kbd>?</kbd>
      </button>
      <button type="button" className="me" onClick={up.open} aria-label={t('nav.switchAria')}>
        <Avatar user={me} size={28} />
        <span>
          <small>{dirName ? t('nav.folder', { name: dirName }) : t('nav.signedIn')}</small>
          {me?.name}
        </span>
        <Icon n="chevD" s={14} />
      </button>
      {up.anchor && (
        <Popover anchor={up.anchor} onClose={up.close} width={240} label={t('nav.account')}>
          <Menu
            onClose={up.close}
            items={[
              { label: t('nav.switchPerson'), icon: 'swap', onClick: switchUser, keepFocus: true },
              { label: t('nav.chooseFolder'), icon: 'folder', onClick: () => void forgetFolder(), keepFocus: true },
              { sep: true as const },
              { head: t('nav.language') },
              ...LANGS.map((l) => ({ label: LANG_NAMES[l], active: currentLang() === l, onClick: () => setLanguage(l), keepFocus: true })),
              { sep: true as const },
              { head: t('theme.title') },
              ...PALETTES.map((p) => ({ label: paletteLabel(p), dot: `pal-${p}`, active: palette === p, onClick: () => setPalette(p), keepFocus: true })),
              { sep: true as const },
              {
                label: t('notify.menu'),
                icon: 'bell' as const,
                active: notifications,
                keepFocus: true,
                onClick: () => void setNotificationsEnabled(!notifications).then((r) => showToast(t(`notify.${r}`))),
              },
            ]}
          />
        </Popover>
      )}
    </nav>
  );
}
