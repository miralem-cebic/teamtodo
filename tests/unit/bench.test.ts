// Timings on a 10,000-task workspace. Runs only with BENCH=1 (npm run bench); prints numbers, asserts nothing,
// because times depend on the machine. Record the numbers in the issue when they change.
import { describe, expect, it } from 'vitest';
import * as A from '../../src/store/appStore';
import { buildGroups, defaultSettings, visibleTasks } from '../../src/store/selectors';
import { makeTask } from '../../src/data/schema';
import { sampleSnapshot } from '../../src/data/seed';
import type { Snapshot, Task } from '../../src/data/types';

const ms = (fn: () => void, runs = 1) => {
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) fn();
  return (performance.now() - t0) / runs;
};

function workspace(count: number): Snapshot {
  const base = sampleSnapshot('bench');
  const user = base.users[0]!;
  const tasks: Task[] = [];
  for (let i = 0; i < count; i++) {
    const t = makeTask({ createdBy: user.id, title: `Task ${i}`, projectId: base.projects[0]!.id, order: i, status: i % 3 ? 'todo' : 'doing' });
    tasks.push(t);
  }
  return { ...base, tasks };
}

describe.skipIf(!process.env.BENCH)('scale (10,000 tasks)', () => {
  it('prints timings', () => {
    const snap = workspace(10_000);
    const meId = snap.users[0]!.id;
    A.resetApp();
    const load = ms(() => A.loadSnapshot(snap));
    A.setMe(meId);
    const view = { type: 'project' as const, id: snap.projects[0]!.id };
    const settings = defaultSettings(view);
    const vis = ms(() => visibleTasks(A.useApp.getState().tasks, A.useApp.getState().projects), 5);
    const groups = ms(() => {
      const s = A.useApp.getState();
      buildGroups({ ...s, view, settings, search: '', collapsed: {}, recentDone: s.recentDone });
    }, 5);
    const ids = snap.tasks.slice(0, 200).map((t) => t.id);
    let n = 0;
    const update = ms(() => {
      A.updateTask(ids[n % ids.length]!, { status: n % 2 ? 'doing' : 'todo' });
      n++;
    }, 200);
    // what the persister does on every change: a pass over all tasks to find the changed ones (for…in, as in persister.ts)
    const scan = ms(() => {
      const s = A.useApp.getState();
      let changed = 0;
      for (const id in s.tasks) if (s.tasks[id]?.draft) changed++;
      expect(changed).toBe(0);
    }, 20);
    process.stdout.write(
      '\n' + [
        `loadSnapshot: ${load.toFixed(1)} ms`,
        `visibleTasks: ${vis.toFixed(2)} ms`,
        `buildGroups (project view): ${groups.toFixed(2)} ms`,
        `updateTask (one change, store only): ${update.toFixed(3)} ms`,
        `persister scan of all tasks per change: ${scan.toFixed(2)} ms`,
      ].join('\n') + '\n',
    );
  }, 120_000);
});
