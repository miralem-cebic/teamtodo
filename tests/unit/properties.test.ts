// Property-based tests: generated inputs check rules that hold for every combination, not only for the examples
// in the other test files. The seed is fixed in CI (reproducible) and random locally (new cases every run).
// A failing run prints its seed; rerun it with FC_SEED=<seed>.
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { mergeTask, mergeUsers } from '../../src/data/merge';
import { migrate } from '../../src/data/migrations';
import { SCHEMA_VERSION } from '../../src/data/schema';
import { insertLink, normalizeUrl, parseLinks } from '../../src/lib/links';
import { COLORS, MERGEABLE_FIELDS, type ActivityType, type MergeableField, type Task, type User } from '../../src/data/types';

const SEED = process.env.FC_SEED ? Number(process.env.FC_SEED) : process.env.CI ? 20261011 : undefined;
const RUNS = Number(process.env.FC_RUNS ?? 200);
const check = <T>(arb: fc.Arbitrary<T>, prop: (v: T) => void) => fc.assert(fc.property(arb, prop), { seed: SEED, numRuns: RUNS });

/* ---------- generators ---------- */

const id = fc.uuid();
const timestamp = fc
  .integer({ min: Date.parse('2026-01-01T00:00:00Z'), max: Date.parse('2026-12-31T23:59:59Z') })
  .map((ms) => new Date(ms).toISOString());
const nullableTimestamp = fc.option(timestamp, { nil: null });
const text = fc.string({ maxLength: 40 });
const isoDate = fc.constantFrom('2026-01-05', '2026-06-30', '2026-12-31');

const attachment = fc.record({
  id,
  fileName: fc.constantFrom('a.pdf', 'b.png', 'notes.txt'),
  size: fc.nat({ max: 10_000_000 }),
  mimeType: fc.constantFrom('application/pdf', 'image/png', 'text/plain'),
  addedAt: timestamp,
  addedBy: id,
  removedAt: nullableTimestamp,
});

const comment = fc.record({
  id,
  userId: id,
  text,
  mentions: fc.array(id, { maxLength: 3 }),
  at: timestamp,
  editedAt: nullableTimestamp,
  deletedAt: nullableTimestamp,
});

const activity = fc.record({
  id,
  userId: id,
  type: fc.constantFrom<ActivityType>('created', 'status', 'completed', 'renamed', 'attachment'),
  at: timestamp,
});

/** Per field a timestamp, but not for every field, as in files written by older versions. */
const fieldUpdatedAt = fc.dictionary(fc.constantFrom(...MERGEABLE_FIELDS), timestamp, { maxKeys: MERGEABLE_FIELDS.length }) as fc.Arbitrary<
  Partial<Record<MergeableField, string>>
>;

const task: fc.Arbitrary<Task> = fc
  .record({
    id,
    parentId: fc.option(id, { nil: null }),
    projectId: fc.option(id, { nil: null }),
    sectionId: fc.option(id, { nil: null }),
    title: text,
    description: text,
    assigneeId: fc.option(id, { nil: null }),
    dueDate: fc.option(isoDate, { nil: null }),
    dueTime: fc.option(fc.constantFrom('09:00', '17:30'), { nil: null }),
    status: fc.constantFrom('todo' as const, 'doing' as const, 'waiting' as const),
    completedAt: nullableTimestamp,
    order: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
    followerIds: fc.array(id, { maxLength: 3 }),
    attachments: fc.uniqueArray(attachment, { maxLength: 3, selector: (a) => a.id }),
    comments: fc.uniqueArray(comment, { maxLength: 3, selector: (c) => c.id }),
    activity: fc.uniqueArray(activity, { maxLength: 3, selector: (a) => a.id }),
    createdAt: timestamp,
    createdBy: id,
    deletedAt: nullableTimestamp,
    fieldUpdatedAt,
  })
  .map((t) => ({ schemaVersion: SCHEMA_VERSION, ...t }));

const user: fc.Arbitrary<User> = fc.record({
  id,
  name: text,
  color: fc.constantFrom(...COLORS),
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: nullableTimestamp,
});

const url = fc.oneof(
  fc.webUrl({ withQueryParameters: true, withFragments: true }),
  fc.constantFrom('www.example.org/x', 'example.com', 'https://a.b/c.', 'HTTP://Upper.case/Path'),
  fc.string({ maxLength: 60 }),
);

/* ---------- merge ---------- */

const stampOf = (t: Task, f: MergeableField) => t.fieldUpdatedAt[f] ?? t.createdAt;
const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
const byAt = <T extends { id: string; at: string }>(xs: T[]) => [...xs].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

describe('merge (properties)', () => {
  it('merging a task with itself changes nothing', () => {
    check(task, (t) => {
      // Lists are canonicalized by time (then ID) when merged, so compare them in that order
      const canon = (x: Task) => ({ ...x, comments: byAt(x.comments), activity: byAt(x.activity), attachments: byId(x.attachments) });
      expect(canon(mergeTask(t, t))).toEqual(canon(t));
    });
  });

  it('each mergeable field takes the value with the newer timestamp', () => {
    check(fc.tuple(task, task), ([a, b]) => {
      const merged = mergeTask(a, b);
      for (const f of MERGEABLE_FIELDS) {
        const ta = stampOf(a, f);
        const tb = stampOf(b, f);
        if (tb > ta) expect(merged[f]).toEqual(b[f]);
        else expect(merged[f]).toEqual(a[f]);
      }
    });
  });

  it('the timestamp of a field after merging is the newer of the two, and never goes back', () => {
    check(fc.tuple(task, task), ([a, b]) => {
      const merged = mergeTask(a, b);
      for (const f of MERGEABLE_FIELDS) {
        const newest = stampOf(a, f) >= stampOf(b, f) ? stampOf(a, f) : stampOf(b, f);
        expect(merged.fieldUpdatedAt[f] ?? merged.createdAt).toBe(newest);
      }
    });
  });

  it('field values agree regardless of the order of the arguments, when the timestamps differ', () => {
    check(fc.tuple(task, task), ([a, b]) => {
      const ab = mergeTask(a, b);
      const ba = mergeTask(b, a);
      for (const f of MERGEABLE_FIELDS) {
        if (stampOf(a, f) === stampOf(b, f)) continue;
        expect(ab[f]).toEqual(ba[f]);
      }
    });
  });

  it('comments, activity and attachments keep every ID from both sides', () => {
    check(fc.tuple(task, task), ([a, b]) => {
      const merged = mergeTask(a, b);
      const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
      const expected = (pick: (t: Task) => { id: string }[]) => new Set([...ids(pick(a)), ...ids(pick(b))]);
      expect(ids(merged.comments)).toEqual(expected((t) => t.comments));
      expect(ids(merged.activity)).toEqual(expected((t) => t.activity));
      expect(ids(merged.attachments)).toEqual(expected((t) => t.attachments));
    });
  });

  it('a removed attachment stays removed', () => {
    check(fc.tuple(task, task), ([a, b]) => {
      const merged = mergeTask(a, b);
      for (const att of [...a.attachments, ...b.attachments]) {
        if (!att.removedAt) continue;
        const m = merged.attachments.find((x) => x.id === att.id);
        expect(m?.removedAt).toBeTruthy();
      }
    });
  });

  it('merging users is idempotent and keeps every ID', () => {
    check(fc.tuple(fc.array(user, { maxLength: 4 }), fc.array(user, { maxLength: 4 })), ([a, b]) => {
      const once = mergeUsers(a, b);
      expect(mergeUsers(once, once)).toEqual(once);
      const ids = new Set([...a, ...b].map((u) => u.id));
      expect(new Set(once.map((u) => u.id))).toEqual(ids);
    });
  });
});

/* ---------- links ---------- */

describe('links (properties)', () => {
  it('parseLinks never produces an href that is not http(s)', () => {
    check(fc.oneof(text, url), (input) => {
      for (const s of parseLinks(input)) {
        if (s.kind === 'link') expect(s.href).toMatch(/^https?:\/\//i);
      }
    });
  });

  it('parseLinks returns only text and links, and link text is never empty', () => {
    check(fc.oneof(text, url), (input) => {
      for (const s of parseLinks(input)) {
        if (s.kind === 'link') expect(s.text.length).toBeGreaterThan(0);
      }
    });
  });

  it('normalizeUrl only returns http(s) addresses or null', () => {
    check(url, (input) => {
      const out = normalizeUrl(input);
      if (out !== null) {
        expect(out).toMatch(/^https?:\/\//i);
        expect(() => new URL(out)).not.toThrow();
      }
    });
  });

  it('normalizeUrl is idempotent', () => {
    check(url, (input) => {
      const once = normalizeUrl(input);
      if (once === null) return;
      expect(normalizeUrl(once)).toBe(once);
    });
  });

  it('insertLink never creates a link with a foreign scheme', () => {
    check(fc.tuple(text, url), ([label, target]) => {
      const out = insertLink(label, 0, label.length, target);
      if (out === null) return;
      for (const s of parseLinks(out.text)) if (s.kind === 'link') expect(s.href).toMatch(/^https?:\/\//i);
    });
  });
});

/* ---------- migrations ---------- */

describe('migrations (properties)', () => {
  it('migrating a valid, complete task file is a no-op', () => {
    check(task, (t) => {
      expect(migrate<Task>('task', t)).toEqual(t);
    });
  });

  it('migrating twice gives the same result as once', () => {
    check(task, (t) => {
      const once = migrate<Task>('task', t);
      expect(migrate<Task>('task', once)).toEqual(once);
    });
  });

  it('a task file without optional fields gets the defaults and stays valid', () => {
    check(task, (t) => {
      const { comments: _c, attachments: _a, followerIds: _f, activity: _ac, fieldUpdatedAt: _fu, ...rest } = t;
      const out = migrate<Task>('task', rest);
      expect(out.comments).toEqual([]);
      expect(out.attachments).toEqual([]);
      expect(out.followerIds).toEqual([]);
      expect(out.activity).toEqual([]);
      expect(out.fieldUpdatedAt).toEqual({});
    });
  });
});

describe('merge regression found by the properties', () => {
  it('an older remote timestamp does not lower the local field timestamp', () => {
    const local: Task = { ...sampleTask(), createdAt: '2026-03-01T00:00:00.000Z', fieldUpdatedAt: {} };
    const remote: Task = { ...sampleTask(), createdAt: '2026-03-01T00:00:00.000Z', fieldUpdatedAt: { title: '2026-02-01T00:00:00.000Z' } };
    const merged = mergeTask(local, remote);
    expect(merged.title).toBe(local.title);
    expect(merged.fieldUpdatedAt.title).toBeUndefined();
    // A later change from a third client still wins over the value kept above
    const later = mergeTask(merged, { ...sampleTask(), title: 'later', fieldUpdatedAt: { title: '2026-04-01T00:00:00.000Z' } });
    expect(later.title).toBe('later');
  });
});

function sampleTask(): Task {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: '5d1c0e5e-2a8b-4f0e-9d7a-6b3c2e1f0a9b',
    parentId: null,
    projectId: null,
    sectionId: null,
    title: 'Local title',
    description: '',
    assigneeId: null,
    dueDate: null,
    dueTime: null,
    status: 'todo',
    completedAt: null,
    order: 1,
    followerIds: [],
    attachments: [],
    comments: [],
    activity: [],
    createdAt: '2026-03-01T00:00:00.000Z',
    createdBy: '5d1c0e5e-2a8b-4f0e-9d7a-6b3c2e1f0a9c',
    deletedAt: null,
    fieldUpdatedAt: {},
  };
}
