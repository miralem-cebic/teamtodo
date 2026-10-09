import { addDays, today } from '../lib/dates';
import { makeProject, makeTask, makeUser, makeWorkspace, newId, nowIso } from './schema';
import type { Snapshot, Task, TaskStatus } from './types';

/** Leerer Workspace mit nur einer Person (wenn Beispieldaten abgewählt sind). */
export function emptySnapshot(workspaceName: string): Snapshot {
  return { workspace: makeWorkspace(workspaceName), users: [], projects: [], tasks: [] };
}

/** Beispieldaten aus dem Referenz-Prototyp. */
export function sampleSnapshot(workspaceName: string): Snapshot {
  const t0 = today();
  const users = [
    makeUser('Pia', 'teal'),
    makeUser('Jonas Weber', 'violet'),
    makeUser('Lena Hoffmann', 'amber'),
    makeUser('Sami Yilmaz', 'rose'),
    makeUser('Mara Schulz', 'blue'),
  ];
  const [pia, jonas, lena, sami, mara] = users.map((u) => u.id) as [string, string, string, string, string];

  const marketing = makeProject('Marketing', 'teal', 1, ['Events', 'Add-ons', 'Nächste Woche erledigen', 'Später erledigen']);
  const website = makeProject('Website-Relaunch', 'violet', 2, ['Konzept', 'Texte', 'Design', 'Launch']);
  const messe = makeProject('Messe 2026', 'amber', 3, ['Vorbereitung', 'Vor Ort', 'Nachbereitung']);
  const sec = (p: typeof marketing, i: number) => p.sections[i]!.id;

  const created = new Date(Date.now() - 3 * 86400000).toISOString();
  const tasks: Task[] = [];
  let order = 1;
  const mk = (
    title: string,
    where: { projectId: string; sectionId?: string | null; parentId?: string | null },
    assigneeId: string | null,
    dueOffset: number | null,
    status: TaskStatus = 'todo',
    done = false,
    description = '',
  ): Task => {
    const t = makeTask({
      title,
      projectId: where.projectId,
      sectionId: where.parentId ? null : (where.sectionId ?? null),
      parentId: where.parentId ?? null,
      assigneeId,
      dueDate: dueOffset === null ? null : addDays(t0, dueOffset),
      status,
      completedAt: done ? created : null,
      description,
      order: order++,
      createdAt: created,
      createdBy: pia,
      activity: [{ id: newId(), userId: pia, type: 'created', at: created }],
    });
    tasks.push(t);
    return t;
  };

  const m = marketing.id;
  const webinar = mk('Webinar „Neuerungen im Service-Portal“ planen', { projectId: m, sectionId: sec(marketing, 0) }, pia, 2, 'doing', false,
    'Ziel: 80 Anmeldungen. Zielgruppe Bestandskunden und Interessenten aus dem IT-Service-Management.');
  mk('Termin mit Produktmanagement abstimmen', { projectId: m, parentId: webinar.id }, pia, -1, 'todo', true);
  mk('Landingpage für Anmeldung aufsetzen', { projectId: m, parentId: webinar.id }, jonas, 1);
  mk('Einladungsmail schreiben', { projectId: m, parentId: webinar.id }, pia, 0);
  mk('Reminder-Sequenz einrichten', { projectId: m, parentId: webinar.id }, mara, 5);
  mk('Kundentag: Agenda finalisieren', { projectId: m, sectionId: sec(marketing, 0) }, lena, -2, 'waiting');
  const datenblatt = mk('Datenblatt für neues Add-on', { projectId: m, sectionId: sec(marketing, 1) }, pia, 4);
  mk('Feature-Liste vom Produktteam einholen', { projectId: m, parentId: datenblatt.id }, sami, -1);
  mk('Layout im CI anlegen', { projectId: m, parentId: datenblatt.id }, pia, 3);
  mk('Preisliste Add-ons aktualisieren', { projectId: m, sectionId: sec(marketing, 1) }, sami, 8);
  mk('LinkedIn-Beiträge für KW planen', { projectId: m, sectionId: sec(marketing, 2) }, pia, 0, 'doing');
  mk('Newsletter-Template überarbeiten', { projectId: m, sectionId: sec(marketing, 2) }, mara, 6);
  mk('Case Study mit Pilotkunde', { projectId: m, sectionId: sec(marketing, 3) }, null, null);

  const w = website.id;
  mk('Sitemap und Seitenstruktur', { projectId: w, sectionId: sec(website, 0) }, jonas, -3, 'todo', true);
  mk('Startseiten-Texte schreiben', { projectId: w, sectionId: sec(website, 1) }, pia, -1, 'doing');
  mk('SEO-Metadaten für alle Seiten', { projectId: w, sectionId: sec(website, 1) }, lena, 9);
  mk('Bildwelt festlegen', { projectId: w, sectionId: sec(website, 2) }, sami, 3);
  mk('Go-live-Checkliste', { projectId: w, sectionId: sec(website, 3) }, pia, 14);

  const x = messe.id;
  mk('Standfläche buchen', { projectId: x, sectionId: sec(messe, 0) }, lena, 1);
  mk('Give-aways bestellen', { projectId: x, sectionId: sec(messe, 0) }, pia, 7);
  mk('Leads ins CRM übertragen', { projectId: x, sectionId: sec(messe, 2) }, mara, 21);

  webinar.comments.push({
    id: newId(),
    userId: jonas,
    text: '@Pia Die Landingpage steht bis morgen als Entwurf.',
    mentions: [pia],
    at: new Date(Date.now() - 5 * 3600000).toISOString(),
  });

  const ws = makeWorkspace(workspaceName);
  ws.createdAt = nowIso();
  return { workspace: ws, users, projects: [marketing, website, messe], tasks };
}
