import { addDays, today } from '../lib/dates';
import { makeProject, makeTask, makeUser, makeWorkspace, newId, nowIso } from './schema';
import type { Snapshot, Task, TaskStatus } from './types';

/** Empty workspace without any sample data (used when sample data is unchecked). */
export function emptySnapshot(workspaceName: string): Snapshot {
  return { workspace: makeWorkspace(workspaceName), users: [], projects: [], tasks: [] };
}

/** Sample data for a first look at the app. */
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

  const marketing = makeProject('Marketing', 'teal', 1, ['Events', 'Add-ons', 'Do next week', 'Do later']);
  const website = makeProject('Website relaunch', 'violet', 2, ['Concept', 'Copy', 'Design', 'Launch']);
  const messe = makeProject('Trade fair 2026', 'amber', 3, ['Preparation', 'On site', 'Follow-up']);
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
  const webinar = mk('Plan webinar "New features in the service portal"', { projectId: m, sectionId: sec(marketing, 0) }, pia, 2, 'doing', false,
    'Goal: 80 sign-ups. Target group: existing customers and prospects from IT service management.');
  mk('Agree the date with product management', { projectId: m, parentId: webinar.id }, pia, -1, 'todo', true);
  mk('Set up the sign-up landing page', { projectId: m, parentId: webinar.id }, jonas, 1);
  mk('Write the invitation email', { projectId: m, parentId: webinar.id }, pia, 0);
  mk('Set up the reminder sequence', { projectId: m, parentId: webinar.id }, mara, 5);
  mk('Customer day: finalize the agenda', { projectId: m, sectionId: sec(marketing, 0) }, lena, -2, 'waiting');
  const datenblatt = mk('Data sheet for the new add-on', { projectId: m, sectionId: sec(marketing, 1) }, pia, 4);
  mk('Get the feature list from the product team', { projectId: m, parentId: datenblatt.id }, sami, -1);
  mk('Create the layout in the corporate design', { projectId: m, parentId: datenblatt.id }, pia, 3);
  mk('Update the add-on price list', { projectId: m, sectionId: sec(marketing, 1) }, sami, 8);
  mk('Plan LinkedIn posts for the week', { projectId: m, sectionId: sec(marketing, 2) }, pia, 0, 'doing');
  mk('Revise the newsletter template', { projectId: m, sectionId: sec(marketing, 2) }, mara, 6);
  mk('Case study with pilot customer', { projectId: m, sectionId: sec(marketing, 3) }, null, null);

  const w = website.id;
  mk('Sitemap and page structure', { projectId: w, sectionId: sec(website, 0) }, jonas, -3, 'todo', true);
  mk('Write homepage copy', { projectId: w, sectionId: sec(website, 1) }, pia, -1, 'doing');
  mk('SEO metadata for all pages', { projectId: w, sectionId: sec(website, 1) }, lena, 9);
  mk('Define the imagery', { projectId: w, sectionId: sec(website, 2) }, sami, 3);
  mk('Go-live checklist', { projectId: w, sectionId: sec(website, 3) }, pia, 14);

  const x = messe.id;
  mk('Book the booth', { projectId: x, sectionId: sec(messe, 0) }, lena, 1);
  mk('Order giveaways', { projectId: x, sectionId: sec(messe, 0) }, pia, 7);
  mk('Transfer leads to the CRM', { projectId: x, sectionId: sec(messe, 2) }, mara, 21);

  webinar.comments.push({
    id: newId(),
    userId: jonas,
    text: '@Pia The landing page will be ready as a draft by tomorrow.',
    mentions: [pia],
    at: new Date(Date.now() - 5 * 3600000).toISOString(),
  });

  const ws = makeWorkspace(workspaceName);
  ws.createdAt = nowIso();
  return { workspace: ws, users, projects: [marketing, website, messe], tasks };
}
